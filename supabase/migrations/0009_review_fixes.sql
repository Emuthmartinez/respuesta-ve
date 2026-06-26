-- =====================================================================
-- 0009 — Fixes from the adversarial review (confirmed findings).
-- =====================================================================

-- #1 — Verified (non-coordinator) responders could self-set buildings.verified.
-- Remove `verified` from the authenticated UPDATE grant; it is now set only by
-- the coordinator moderate_building RPC.
revoke update on public.buildings from authenticated;
grant update (inspection_status, people_status) on public.buildings to authenticated;

-- moderate_building now also flips the `verified` flag on approval.
create or replace function public.moderate_building(
  p_building uuid, p_status report_moderation_status, p_reason text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.buildings
    set moderation_status = p_status,
        verified = (p_status = 'approved'),
        moderated_by = auth.uid(), moderated_at = now(),
        moderation_reason = p_reason, updated_at = now()
    where id = p_building;
  get diagnostics c = row_count;
  if c > 0 then
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
      values ('building', p_building, 'moderate', p_status::text, auth.uid(), p_reason);
  end if;
  return c > 0;
end; $$;

-- #8 — Verified non-coordinators could read pending/rejected buildings (precise
-- coords + reporter_contact). Gate base reads to approved rows; coordinators see all.
drop policy buildings_select_responders on public.buildings;
create policy buildings_select_responders on public.buildings
  for select to authenticated
  using (
    public.is_verified_responder(auth.uid())
    and (moderation_status = 'approved' or public.is_responder_coordinator(auth.uid()))
  );

-- #2 — Suspended responders could still advance/release in-flight requests.
create or replace function public.mark_inspection_arrived(request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_verified_responder(auth.uid()) then return false; end if;
  update public.inspection_requests
    set status = 'in_progress', arrived_at = now(), updated_at = now()
    where id = request_id and claimed_by = auth.uid() and status = 'claimed';
  get diagnostics c = row_count;
  return c > 0;
end; $$;

create or replace function public.release_inspection_request(request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_verified_responder(auth.uid()) then return false; end if;
  update public.inspection_requests
    set status = 'triaged', claimed_by = null, claimed_at = null, arrived_at = null, updated_at = now()
    where id = request_id and claimed_by = auth.uid() and status in ('claimed','in_progress');
  get diagnostics c = row_count;
  return c > 0;
end; $$;

-- #6 / #7 — Link the assessment to the SPECIFIC request, not by building_id.
alter table public.assessments
  add column inspection_request_id uuid references public.inspection_requests(id);

create or replace function public.link_assessment_to_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.inspection_request_id is not null then
    update public.inspection_requests
      set assessment_id = new.id, status = 'assessed', updated_at = now()
    where id = new.inspection_request_id
      and claimed_by = new.responder_id
      and status in ('claimed','in_progress');
  end if;
  return new;
end; $$;

-- #9 — Coordinators must be able to review pending responders + their documents.
create policy responders_coordinator_select on public.responders
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

create policy "responder docs read coordinator"
  on storage.objects for select to authenticated
  using (bucket_id = 'responder-docs' and public.is_responder_coordinator(auth.uid()));

create or replace function public.verify_responder(
  p_responder uuid, p_tier responder_tier default 'verified',
  p_approve boolean default true, p_notes text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  if p_approve then
    update public.responders
      set verification = 'verified', tier = coalesce(p_tier,'verified'),
          verified_by = auth.uid(), verified_at = now(),
          verified_at_source = true, verification_notes = p_notes
      where id = p_responder;
  else
    update public.responders
      set verification = 'rejected', verification_notes = p_notes
      where id = p_responder;
  end if;
  get diagnostics c = row_count;
  if c > 0 then
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
      values ('responder', p_responder, case when p_approve then 'verify' else 'reject' end,
              case when p_approve then 'verified' else 'rejected' end, auth.uid(), p_notes);
  end if;
  return c > 0;
end; $$;
revoke execute on function public.verify_responder(uuid, responder_tier, boolean, text) from public, anon;
grant execute on function public.verify_responder(uuid, responder_tier, boolean, text) to authenticated;

-- #3 — building-photos storage policy allowed arbitrary-path anon uploads.
drop policy "building photos insert anyone" on storage.objects;
create policy "building photos insert anyone"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'building-photos' and name ~ '^[0-9a-fA-F-]+/');
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'building-photos';
