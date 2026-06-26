-- =====================================================================
-- 0005 — Inspection-request coordination flow + ATC-20 assessment fields.
-- States: submitted -> triaged -> claimed -> in_progress -> assessed -> closed
--         (any -> cancelled). All transitions go through SECURITY DEFINER
-- RPCs so the claim is atomic (prevents conflicting placards).
-- =====================================================================

create type inspection_request_status as enum
  ('submitted','triaged','claimed','in_progress','assessed','closed','cancelled');
create type request_urgency as enum ('critical','high','normal','low');

create table public.inspection_requests (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid references public.buildings(id) on delete set null,
  needs_type         text not null default 'structural_safety',
  status             inspection_request_status not null default 'submitted',
  urgency            request_urgency not null default 'normal',
  inspection_tier    text not null default 'rapid',
  requester_id       uuid references auth.users(id) on delete set null default auth.uid(),
  requester_contact  text,
  contact_window     text,
  access_status      text,
  people_inside_at_submission boolean not null default false,
  lat                double precision,
  lng                double precision,
  estado             text,
  municipio          text,
  parroquia          text,
  address            text,
  description        text,
  claimed_by         uuid references public.responders(id),
  claimed_at         timestamptz,
  arrived_at         timestamptz,
  assessment_id      uuid references public.assessments(id),
  coordinator_notes  text,
  token_hash         text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index inspection_requests_status_idx   on public.inspection_requests (status);
create index inspection_requests_urgency_idx  on public.inspection_requests (urgency, status);
create index inspection_requests_building_idx on public.inspection_requests (building_id);
create trigger trg_ir_touch before update on public.inspection_requests
  for each row execute function public.touch_updated_at();

-- Auto-triage life-safety cases straight to triaged + critical.
create or replace function public.auto_triage_inspection_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.people_inside_at_submission
     or exists (select 1 from public.buildings b
                where b.id = new.building_id
                  and b.people_status in ('possible','confirmed_trapped')) then
    new.urgency := 'critical';
    new.status := 'triaged';
  end if;
  return new;
end; $$;
create trigger trg_ir_auto_triage before insert on public.inspection_requests
  for each row execute function public.auto_triage_inspection_request();
revoke execute on function public.auto_triage_inspection_request() from public, anon, authenticated;

-- Reflect a new request on the building summary.
create or replace function public.sync_building_inspection_on_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.building_id is not null then
    update public.buildings set inspection_status = 'requested', updated_at = now()
      where id = new.building_id and inspection_status = 'not_requested';
  end if;
  return new;
end; $$;
create trigger trg_ir_after_insert after insert on public.inspection_requests
  for each row execute function public.sync_building_inspection_on_request();

-- ---- RLS ------------------------------------------------------------
alter table public.inspection_requests enable row level security;
revoke all on public.inspection_requests from anon, authenticated;
grant insert (building_id, needs_type, requester_contact, contact_window, access_status,
              people_inside_at_submission, lat, lng, estado, municipio, parroquia,
              address, description, token_hash) on public.inspection_requests to anon, authenticated;
grant select on public.inspection_requests to authenticated;

create policy ir_insert_anyone on public.inspection_requests
  for insert to anon, authenticated
  with check ((lat is null or lat between 0 and 16) and (lng is null or lng between -74 and -59));
create policy ir_select_responder_or_owner on public.inspection_requests
  for select to authenticated
  using (public.is_verified_responder(auth.uid()) or requester_id = auth.uid());
-- No UPDATE policy: transitions happen only via the RPCs below.

create view public.inspection_requests_public with (security_invoker = off) as
  select id, public.fuzz_coord(lat) as lat, public.fuzz_coord(lng) as lng,
    estado, municipio, needs_type, urgency, status, inspection_tier, created_at
  from public.inspection_requests
  where status not in ('cancelled','closed');
grant select on public.inspection_requests_public to anon, authenticated;

-- ---- transition RPCs ------------------------------------------------
-- Coordinator triages a submitted request.
create or replace function public.triage_inspection_request(
  request_id uuid, p_urgency request_urgency default null, p_tier text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.inspection_requests
    set status = 'triaged',
        urgency = coalesce(p_urgency, urgency),
        inspection_tier = coalesce(p_tier, inspection_tier),
        updated_at = now()
    where id = request_id and status in ('submitted','triaged');
  get diagnostics c = row_count;
  return c > 0;
end; $$;
revoke execute on function public.triage_inspection_request(uuid, request_urgency, text) from public, anon;
grant execute on function public.triage_inspection_request(uuid, request_urgency, text) to authenticated;

-- Atomic claim — the life-safety-critical operation.
create or replace function public.claim_inspection_request(request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_verified_responder(auth.uid()) then return false; end if;
  update public.inspection_requests
    set claimed_by = auth.uid(), claimed_at = now(), status = 'claimed', updated_at = now()
    where id = request_id and status = 'triaged' and claimed_by is null;
  get diagnostics c = row_count;
  if c > 0 then
    update public.buildings set inspection_status = 'claimed', updated_at = now()
      where id = (select building_id from public.inspection_requests where id = request_id);
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id)
      values ('inspection_request', request_id, 'claimed', 'claimed', auth.uid());
  end if;
  return c > 0;
end; $$;
revoke execute on function public.claim_inspection_request(uuid) from public, anon;
grant execute on function public.claim_inspection_request(uuid) to authenticated;

-- Claimed responder marks on-site arrival.
create or replace function public.mark_inspection_arrived(request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  update public.inspection_requests
    set status = 'in_progress', arrived_at = now(), updated_at = now()
    where id = request_id and claimed_by = auth.uid() and status = 'claimed';
  get diagnostics c = row_count;
  return c > 0;
end; $$;
revoke execute on function public.mark_inspection_arrived(uuid) from public, anon;
grant execute on function public.mark_inspection_arrived(uuid) to authenticated;

-- Claimed responder releases a request back to the queue.
create or replace function public.release_inspection_request(request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  update public.inspection_requests
    set status = 'triaged', claimed_by = null, claimed_at = null, arrived_at = null, updated_at = now()
    where id = request_id and claimed_by = auth.uid() and status in ('claimed','in_progress');
  get diagnostics c = row_count;
  return c > 0;
end; $$;
revoke execute on function public.release_inspection_request(uuid) from public, anon;
grant execute on function public.release_inspection_request(uuid) to authenticated;

-- Coordinator closes a fully-assessed request (placard physically posted).
create or replace function public.close_inspection_request(request_id uuid, p_notes text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.inspection_requests
    set status = 'closed',
        coordinator_notes = coalesce(coordinator_notes,'') || coalesce(chr(10) || p_notes, ''),
        updated_at = now()
    where id = request_id and status = 'assessed';
  get diagnostics c = row_count;
  return c > 0;
end; $$;
revoke execute on function public.close_inspection_request(uuid, text) from public, anon;
grant execute on function public.close_inspection_request(uuid, text) to authenticated;

-- Anonymous requester polls status with the raw token (route hashes it first).
create or replace function public.get_inspection_request_status(p_token_hash text) returns text
language sql security definer set search_path = public stable as $$
  select status::text from public.inspection_requests where token_hash = p_token_hash;
$$;
revoke execute on function public.get_inspection_request_status(text) from public;
grant execute on function public.get_inspection_request_status(text) to anon, authenticated;

-- ---- ATC-20 assessment fields --------------------------------------
alter table public.assessments
  add column assessment_type   text not null default 'rapid',  -- rapid | detailed
  add column inspection_scope  text,                            -- exterior_only | exterior_and_interior
  add column construction_type text,
  add column occupancy_type    text,
  add column collapse_mode     text,
  add column hazard_collapse   text,   -- none|minor|moderate|severe
  add column hazard_leaning    text,
  add column hazard_racking    text,
  add column hazard_falling    text,
  add column hazard_geotechnical text,
  add column hazard_other_notes text,
  add column hazards_present   text[],
  add column estimated_damage_pct text, -- 0-1 | 1-10 | 10-30 | 30-60 | 60-100
  add column use_restrictions  text,
  add column barricade_needed  boolean,
  add column gas_shutoff_confirmed boolean,
  add column detailed_evaluation_recommended text, -- not_needed|recommended|required
  add column reinspection_recommended boolean,
  add column inspector_license_number text,
  add column community_disclaimer_accepted boolean not null default false,
  add column supersedes_assessment_id uuid references public.assessments(id),
  add column assessed_at timestamptz not null default now();

-- The UI must show the "not an official certification" disclaimer before submit.
alter table public.assessments
  add constraint assessments_disclaimer_chk check (community_disclaimer_accepted);

-- When a claimed responder posts an assessment, mark the request assessed.
create or replace function public.link_assessment_to_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.inspection_requests
    set assessment_id = new.id, status = 'assessed', updated_at = now()
  where building_id = new.building_id
    and claimed_by = new.responder_id
    and status in ('claimed','in_progress');
  return new;
end; $$;
create trigger trg_link_assessment_request after insert on public.assessments
  for each row execute function public.link_assessment_to_request();
