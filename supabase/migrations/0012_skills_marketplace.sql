-- =====================================================================
-- 0012 — Skills <-> Needs marketplace (in-country mutual aid).
-- Launch model = COORDINATOR-MEDIATED introductions (critique simplification):
--   * offers & requests store contact PRIVATELY (coordinator-only, like
--     inspection_requests.requester_contact). NO public PII.
--   * public views expose skill + area only.
--   * confirm_match() refuses to connect a high-stakes offer unless the
--     credential is verified (red-team P0).
--   * phone-pattern CHECK on all public free-text (prevents smuggling contact).
-- =====================================================================

create type skill_category as enum (
  'structural_engineer','civil_engineer','architect','medical_doctor','nurse',
  'psychologist','therapist','search_and_rescue','firefighter','driver_logistics',
  'translator','legal','electrician','plumber','childcare','it_comms',
  'shelter_host','volunteer_general','other');
create type help_request_status as enum ('open','matched','in_progress','fulfilled','cancelled','expired');
create type match_status as enum ('proposed','confirmed','completed','cancelled');

-- High-stakes categories require credential verification before matching.
create or replace function public.is_high_stakes_skill(c skill_category)
returns boolean language sql immutable set search_path = '' as $$
  select c in ('structural_engineer','civil_engineer','architect','medical_doctor',
               'nurse','psychologist','therapist','search_and_rescue','childcare','shelter_host');
$$;

-- Shared phone-pattern guard (VE mobile prefixes / +58 / bare 11-digit run).
create or replace function public.has_contact_pattern(t text)
returns boolean language sql immutable set search_path = '' as $$
  select t is not null and t ~ '(0412|0416|0424|0426|0414|0212|\+?58[ -]?[0-9]{9,11}|[0-9]{11})';
$$;

-- ---- skill_offers ---------------------------------------------------
create table public.skill_offers (
  id              uuid primary key default gen_random_uuid(),
  offerer_id      uuid not null references auth.users(id) on delete cascade,
  skill_category  skill_category not null,
  skill_detail    text check (skill_detail is null or not public.has_contact_pattern(skill_detail)),
  languages       text[],
  estado          text,
  operating_estados text[],
  available       boolean not null default true,
  contact_private text,                       -- coordinator-only (the intro channel)
  credential_verified boolean not null default false,
  credential_doc_path text check (credential_doc_path is null or credential_doc_path like 'skill-docs/%'),
  is_high_stakes  boolean generated always as (public.is_high_stakes_skill(skill_category)) stored,
  moderation_status report_moderation_status not null default 'pending',
  suspended_at    timestamptz,
  suspended_reason text,
  flagged_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index skill_offers_cat_idx on public.skill_offers (skill_category);
create trigger trg_skill_offers_touch before update on public.skill_offers
  for each row execute function public.touch_updated_at();

create view public.skill_offers_public with (security_invoker = off) as
  select id, skill_category, skill_detail, languages, estado, operating_estados,
         is_high_stakes, credential_verified, created_at
  from public.skill_offers
  where moderation_status = 'approved' and suspended_at is null and available = true
    and (not is_high_stakes or credential_verified = true);
grant select on public.skill_offers_public to anon, authenticated;

alter table public.skill_offers enable row level security;
revoke all on public.skill_offers from anon, authenticated;
grant select on public.skill_offers to authenticated;
grant update (available) on public.skill_offers to authenticated;
create policy skill_offers_self_or_coord_select on public.skill_offers
  for select to authenticated
  using (offerer_id = auth.uid() or public.is_responder_coordinator(auth.uid()));
create policy skill_offers_self_update on public.skill_offers
  for update to authenticated using (offerer_id = auth.uid()) with check (offerer_id = auth.uid());

-- ---- help_requests --------------------------------------------------
create table public.help_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid references auth.users(id) on delete set null default auth.uid(),
  token_hash      text unique,
  skill_needed    skill_category not null,
  urgency         request_urgency not null default 'normal',
  num_people      integer,
  has_minor_children boolean not null default false,
  estado          text,
  municipio       text,
  description     text check (description is null or not public.has_contact_pattern(description)),
  contact_private text,                       -- coordinator-only
  status          help_request_status not null default 'open',
  moderation_status report_moderation_status not null default 'pending',
  expires_at      timestamptz not null default (now() + interval '14 days'),
  flagged_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index help_requests_status_idx on public.help_requests (status);
create trigger trg_help_requests_touch before update on public.help_requests
  for each row execute function public.touch_updated_at();

create view public.help_requests_public with (security_invoker = off) as
  select id, skill_needed, urgency, estado, municipio,
         case when has_minor_children then null else description end as description,
         has_minor_children, created_at
  from public.help_requests
  where moderation_status = 'approved' and status = 'open' and expires_at > now();
grant select on public.help_requests_public to anon, authenticated;

alter table public.help_requests enable row level security;
revoke all on public.help_requests from anon, authenticated;
grant select on public.help_requests to authenticated;
create policy help_requests_owner_or_coord_select on public.help_requests
  for select to authenticated
  using (requester_id = auth.uid() or public.is_responder_coordinator(auth.uid()));

-- ---- matches --------------------------------------------------------
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references public.help_requests(id) on delete cascade,
  skill_offer_id  uuid not null references public.skill_offers(id) on delete cascade,
  matched_by      uuid references auth.users(id),
  status          match_status not null default 'confirmed',
  coordinator_notes text,
  created_at      timestamptz not null default now(),
  unique (help_request_id, skill_offer_id)
);
alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;
create policy matches_coord_select on public.matches
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- ---- storage: skill-docs (private) ---------------------------------
insert into storage.buckets (id, name, public) values ('skill-docs','skill-docs', false)
  on conflict (id) do nothing;
create policy "skill docs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'skill-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "skill docs read own" on storage.objects for select to authenticated
  using (bucket_id = 'skill-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "skill docs read coordinator" on storage.objects for select to authenticated
  using (bucket_id = 'skill-docs' and public.is_responder_coordinator(auth.uid()));

-- =====================================================================
-- RPCs
-- =====================================================================
create or replace function public.submit_skill_offer(
  p_ip_hash text, p_skill_category skill_category, p_skill_detail text default null,
  p_languages text[] default null, p_estado text default null,
  p_operating_estados text[] default null, p_contact text default null,
  p_credential_doc_path text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n_uid int; n_ip int; new_id uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'auth_required'); end if;
  if public.has_contact_pattern(p_skill_detail) then return jsonb_build_object('ok', false, 'error', 'contact_in_text'); end if;
  if p_credential_doc_path is not null and p_credential_doc_path not like 'skill-docs/%' then
    return jsonb_build_object('ok', false, 'error', 'bad_doc_path'); end if;
  select count(*) into n_uid from public.submission_throttle where ip_hash = uid::text and kind = 'skill_offer' and created_at > now() - interval '1 hour';
  select count(*) into n_ip  from public.submission_throttle where ip_hash = p_ip_hash and kind = 'skill_offer' and created_at > now() - interval '1 hour';
  if n_uid >= 5 or n_ip >= 10 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.skill_offers (offerer_id, skill_category, skill_detail, languages, estado,
      operating_estados, contact_private, credential_doc_path, moderation_status)
    values (uid, p_skill_category, p_skill_detail, p_languages, p_estado, p_operating_estados,
      p_contact, p_credential_doc_path, 'pending')
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (uid::text, 'skill_offer');
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'skill_offer');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending',
    'requires_credential', public.is_high_stakes_skill(p_skill_category));
end; $$;
revoke execute on function public.submit_skill_offer(text,skill_category,text,text[],text,text[],text,text) from public;
grant execute on function public.submit_skill_offer(text,skill_category,text,text[],text,text[],text,text) to authenticated;

create or replace function public.submit_help_request(
  p_ip_hash text, p_token_hash text, p_skill_needed skill_category,
  p_urgency request_urgency default 'normal', p_num_people int default null,
  p_has_minor_children boolean default false, p_estado text default null,
  p_municipio text default null, p_description text default null, p_contact text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; new_id uuid;
begin
  -- high-stakes needs require a signed-in requester (accountability)
  if auth.uid() is null and p_skill_needed in ('childcare','shelter_host','medical_doctor','nurse') then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if public.has_contact_pattern(p_description) then return jsonb_build_object('ok', false, 'error', 'contact_in_text'); end if;
  select count(*) into n from public.submission_throttle where ip_hash = p_ip_hash and kind = 'help_request' and created_at > now() - interval '1 hour';
  if n >= 10 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.help_requests (token_hash, skill_needed, urgency, num_people, has_minor_children,
      estado, municipio, description, contact_private, moderation_status)
    values (p_token_hash, p_skill_needed, coalesce(p_urgency,'normal'), p_num_people,
      coalesce(p_has_minor_children,false), p_estado, p_municipio, p_description, p_contact, 'pending')
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'help_request');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_help_request(text,text,skill_category,request_urgency,int,boolean,text,text,text,text) from public;
grant execute on function public.submit_help_request(text,text,skill_category,request_urgency,int,boolean,text,text,text,text) to anon, authenticated;

-- Coordinator verifies a credential (unlocks high-stakes offers).
create or replace function public.verify_skill_credential(p_offer uuid, p_approve boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.skill_offers
    set credential_verified = p_approve, moderation_status = case when p_approve then 'approved' else moderation_status end, updated_at = now()
    where id = p_offer;
  get diagnostics c = row_count;
  if c > 0 then insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id)
    values ('skill_offer', p_offer, 'verify_credential', case when p_approve then 'verified' else 'rejected' end, auth.uid()); end if;
  return c > 0;
end; $$;
revoke execute on function public.verify_skill_credential(uuid, boolean) from public, anon;
grant execute on function public.verify_skill_credential(uuid, boolean) to authenticated;

create or replace function public.approve_skill_offer(p_offer uuid, p_approve boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.skill_offers set moderation_status = case when p_approve then 'approved' else 'rejected_spam' end, updated_at = now() where id = p_offer;
  get diagnostics c = row_count;
  return c > 0;
end; $$;
revoke execute on function public.approve_skill_offer(uuid, boolean) from public, anon;
grant execute on function public.approve_skill_offer(uuid, boolean) to authenticated;

-- THE life-safety gate: cannot confirm a high-stakes match without verification.
create or replace function public.confirm_match(p_request uuid, p_offer uuid, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare off record; new_id uuid;
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator'); end if;
  select is_high_stakes, credential_verified, moderation_status, suspended_at into off
    from public.skill_offers where id = p_offer;
  if not found then return jsonb_build_object('ok', false, 'error', 'offer_not_found'); end if;
  if off.suspended_at is not null or off.moderation_status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'offer_not_active'); end if;
  if off.is_high_stakes and not off.credential_verified then
    return jsonb_build_object('ok', false, 'error', 'credential_required'); end if;
  insert into public.matches (help_request_id, skill_offer_id, matched_by, status, coordinator_notes)
    values (p_request, p_offer, auth.uid(), 'confirmed', p_notes)
    on conflict (help_request_id, skill_offer_id) do nothing
    returning id into new_id;
  if new_id is null then return jsonb_build_object('ok', false, 'error', 'already_matched'); end if;
  update public.help_requests set status = 'matched', updated_at = now()
    where id = p_request and status = 'open';
  insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id)
    values ('match', new_id, 'confirm_match', 'confirmed', auth.uid());
  return jsonb_build_object('ok', true, 'id', new_id);
end; $$;
revoke execute on function public.confirm_match(uuid, uuid, text) from public, anon;
grant execute on function public.confirm_match(uuid, uuid, text) to authenticated;

create or replace function public.suspend_skill_offer(p_offer uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.skill_offers set suspended_at = now(), suspended_reason = p_reason,
    moderation_status = 'archived', updated_at = now() where id = p_offer;
  get diagnostics c = row_count;
  if c > 0 then insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
    values ('skill_offer', p_offer, 'suspend', 'archived', auth.uid(), p_reason); end if;
  return c > 0;
end; $$;
revoke execute on function public.suspend_skill_offer(uuid, text) from public, anon;
grant execute on function public.suspend_skill_offer(uuid, text) to authenticated;

create or replace function public.get_help_request_status(p_token_hash text) returns text
language sql security definer set search_path = public stable as $$
  select status::text from public.help_requests where token_hash = p_token_hash;
$$;
revoke execute on function public.get_help_request_status(text) from public;
grant execute on function public.get_help_request_status(text) to anon, authenticated;
