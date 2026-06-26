-- =====================================================================
-- 0023 — Hardening of the ownership/retraction surface.
-- (Renumbered from 0020 to avoid a filename collision with a concurrently
--  landed 0020_partner_api; this is the 3rd migration of the retraction
--  feature, after 0018_retraction_enum + 0019_ownership_retraction.)
-- Fixes confirmed by the adversarial security review (2026-06-26):
--   * Life-safety guard now fires for a possibly-trapped building in ANY
--     non-retracted state (was: only 'approved'), so a pending/flagged
--     trapped report can't be self-retracted before a coordinator sees it.
--   * Community flag auto-quarantine no longer hides possibly-trapped
--     buildings (anon flag-flooding could otherwise pull a rescue pin off
--     the map with no token and no coordinator).
--   * Retracting a help_request now cancels its dangling match so the
--     matched volunteer side stays consistent (no silent drop).
--   * Published-misinfo retraction is reported as "pending coordinator",
--     not "withdrawn" (it deliberately stays published until a coordinator
--     acts — the lookup/UX must say so truthfully).
--   * Idempotent moderation_log on repeated retraction/cancellation requests.
--   * Throttle keyed on the caller IP (bounded) instead of the token-hash
--     prefix (unbounded → table-bloat). retract_submission gains p_ip_hash.
-- =====================================================================

-- ---- 1. Don't auto-quarantine life-safety buildings on community flags ----
create or replace function public.increment_building_flag_count() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.buildings
    set flagged_count = flagged_count + 1,
        moderation_status = case
          when flagged_count + 1 >= 3 and moderation_status = 'approved'
               and people_status not in ('possible','confirmed_trapped') then 'flagged'
          else moderation_status end
  where id = new.building_id;
  return new;
end; $$;
revoke execute on function public.increment_building_flag_count() from public, anon, authenticated;

-- ---- 2. Rebuild retract_submission with the review fixes ----------------
drop function if exists public.retract_submission(text, uuid, text, text);
create function public.retract_submission(
  p_entity text, p_id uuid, p_token_hash text, p_reason text default null,
  p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c int; v_people people_status; v_status text; n int; v_key text;
begin
  if p_token_hash is null or length(p_token_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;

  -- Throttle on the caller IP (bounded growth) — falls back to the token-hash
  -- prefix only when no IP is supplied.
  v_key := 'retract:' || coalesce(nullif(p_ip_hash, ''), left(p_token_hash, 16));
  select count(*) into n from public.submission_throttle
    where ip_hash = v_key and kind = 'retract' and created_at > now() - interval '1 hour';
  if n >= 40 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.submission_throttle (ip_hash, kind) values (v_key, 'retract');

  if p_entity = 'building' then
    select people_status, moderation_status::text into v_people, v_status
      from public.buildings where id = p_id and token_hash = p_token_hash;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_status = 'retracted' then return jsonb_build_object('ok', true, 'status', 'retracted'); end if;
    -- LIFE-SAFETY GUARD: a possibly-trapped report (in ANY live/pending state)
    -- needs a coordinator to confirm the retraction. Never self-serve.
    if v_people in ('possible', 'confirmed_trapped') then
      update public.buildings set retraction_requested_at = now(),
        retraction_requested_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash and retraction_requested_at is null;
      get diagnostics c = row_count;
      if c > 0 then
        insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
          values ('building', p_id, 'retraction_requested', v_status, 'retraction_pending', p_reason);
      end if;
      return jsonb_build_object('ok', true, 'status', 'retraction_pending',
        'note', 'coordinator_review_required');
    end if;
    update public.buildings set moderation_status = 'retracted', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
      values ('building', p_id, 'retract', v_status, 'retracted', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'donation_center' then
    update public.donation_centers set moderation_status = 'retracted', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash and moderation_status <> 'retracted';
    get diagnostics c = row_count;
    if c = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    insert into public.moderation_log (entity_type, entity_id, action, new_status, reason)
      values ('donation_center', p_id, 'retract', 'retracted', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'organization' then
    update public.organizations set org_status = 'inactive', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash and retracted_at is null;
    get diagnostics c = row_count;
    if c = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    insert into public.moderation_log (entity_type, entity_id, action, new_status, reason)
      values ('organization', p_id, 'retract', 'inactive', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'help_request' then
    update public.help_requests set status = 'cancelled', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash and status <> 'cancelled';
    get diagnostics c = row_count;
    if c = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    -- Cancel any live match so the matched volunteer side isn't silently
    -- left dangling (visible to the coordinator in the matching desk).
    update public.matches set status = 'cancelled'
      where help_request_id = p_id and status in ('proposed', 'confirmed');
    insert into public.moderation_log (entity_type, entity_id, action, new_status, reason)
      values ('help_request', p_id, 'retract', 'cancelled', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'inspection_request' then
    select status::text into v_status from public.inspection_requests
      where id = p_id and token_hash = p_token_hash;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'retracted'); end if;
    if v_status in ('claimed', 'in_progress') then
      update public.inspection_requests set cancellation_requested_at = now(),
        cancellation_requested_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash and cancellation_requested_at is null;
      get diagnostics c = row_count;
      if c > 0 then
        insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
          values ('inspection_request', p_id, 'cancellation_requested', v_status, 'cancellation_pending', p_reason);
      end if;
      return jsonb_build_object('ok', true, 'status', 'cancellation_pending',
        'note', 'responder_confirm_required');
    end if;
    update public.inspection_requests set status = 'cancelled', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
      values ('inspection_request', p_id, 'retract', v_status, 'cancelled', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'misinfo_report' then
    select status::text into v_status from public.misinformation_reports
      where id = p_id and token_hash = p_token_hash;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    -- A PUBLISHED debunk stays public — reporter retraction is a signal to
    -- coordinators, not a self-serve takedown. Reported back as "pending".
    if v_status = 'published' then
      update public.misinformation_reports set retracted_at = now(),
        retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash and retracted_at is null;
      get diagnostics c = row_count;
      if c > 0 then
        insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
          values ('misinfo_report', p_id, 'retract_signal', v_status, 'published', p_reason);
      end if;
      return jsonb_build_object('ok', true, 'status', 'retraction_pending',
        'note', 'published_stays_until_coordinator');
    end if;
    update public.misinformation_reports set status = 'rejected', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash and status <> 'rejected';
    get diagnostics c = row_count;
    if c = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
      values ('misinfo_report', p_id, 'retract', v_status, 'rejected', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_entity');
end; $$;
revoke execute on function public.retract_submission(text, uuid, text, text, text) from public;
grant execute on function public.retract_submission(text, uuid, text, text, text) to anon, authenticated;

-- ---- 3. lookup_submission: published-misinfo shows as pending, not done ----
create or replace function public.lookup_submission(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare r record;
begin
  if p_token_hash is null or length(p_token_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;
  select id, moderation_status::text as status, created_at, retracted_at,
         retraction_requested_at, people_status::text as people, estado, municipio
    into r from public.buildings where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'building', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      'retracted', (r.retracted_at is not null or r.status = 'retracted'),
      'pending_review', (r.retraction_requested_at is not null),
      'life_safety', (r.people in ('possible','confirmed_trapped')),
      'place', concat_ws(', ', r.municipio, r.estado));
  end if;
  select id, moderation_status::text as status, created_at, retracted_at, name, city
    into r from public.donation_centers where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'donation_center', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      'retracted', (r.retracted_at is not null or r.status = 'retracted'),
      'place', concat_ws(' · ', r.name, r.city));
  end if;
  select id, org_status::text as status, created_at, retracted_at, name
    into r from public.organizations where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'organization', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      'retracted', (r.retracted_at is not null or r.status = 'inactive'),
      'place', r.name);
  end if;
  select id, status::text as status, created_at, retracted_at, estado, municipio
    into r from public.help_requests where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'help_request', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      'retracted', (r.retracted_at is not null or r.status = 'cancelled'),
      'place', concat_ws(', ', r.municipio, r.estado));
  end if;
  select id, status::text as status, created_at, retracted_at,
         cancellation_requested_at, estado, municipio
    into r from public.inspection_requests where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'inspection_request', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      'retracted', (r.retracted_at is not null or r.status = 'cancelled'),
      'pending_review', (r.cancellation_requested_at is not null),
      'place', concat_ws(', ', r.municipio, r.estado));
  end if;
  select id, status::text as status, created_at, retracted_at, claim
    into r from public.misinformation_reports where token_hash = p_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'entity', 'misinfo_report', 'id', r.id,
      'status', r.status, 'created_at', r.created_at,
      -- a published debunk that the reporter retracted stays public pending a
      -- coordinator => show as pending_review, NOT withdrawn.
      'retracted', (r.retracted_at is not null and r.status <> 'published'),
      'pending_review', (r.retracted_at is not null and r.status = 'published'),
      'place', left(r.claim, 80));
  end if;
  return jsonb_build_object('ok', false, 'error', 'not_found');
end; $$;
revoke execute on function public.lookup_submission(text) from public;
grant execute on function public.lookup_submission(text) to anon, authenticated;
