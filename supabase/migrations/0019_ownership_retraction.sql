-- =====================================================================
-- 0019 — Universal management-token ownership + soft-retraction.
-- (llm-council verdict 2026-06-26: Option 1, unanimous.)
--
-- Model: a citizen creates content anonymously; on submit the server mints a
-- one-time secret token (randomBytes(24)), stores ONLY sha256(token) as
-- token_hash, and hands the raw token back. Possession of the token = the
-- right to manage/retract that one submission — no account required.
-- (skill_offers stay account-owned; offerer_id NOT NULL is the identity.)
--
-- Retraction is SOFT: the row is never deleted. We flip it to a withdrawn
-- state (excluded from every *_public view) and append a moderation_log entry,
-- so "delete-after-approve" can never erase the accountability trail.
--
-- Two life-safety guards (the council's blind-spot catch):
--   * a publicly-visible building with people possibly trapped cannot be
--     silently un-reported — it goes to coordinator-confirm.
--   * an inspection request already claimed/in-progress cannot silently drop
--     an on-site responder — it goes to responder/coordinator-confirm.
--
-- Hashing stays in the Next.js server layer (matching the live inspection /
-- help-request pattern): the RPCs receive a precomputed token_hash, never the
-- raw token, so raw secrets never reach Postgres query logs.
-- =====================================================================

-- ---- ownership + retraction columns --------------------------------
alter table public.buildings
  add column if not exists token_hash text unique,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_requested_at timestamptz,
  add column if not exists retraction_requested_reason text;

alter table public.donation_centers
  add column if not exists token_hash text unique,
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_reason text;

alter table public.organizations
  add column if not exists token_hash text unique,
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_reason text;

alter table public.help_requests
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_reason text;

alter table public.inspection_requests
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_reason text,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_requested_reason text;

alter table public.misinformation_reports
  add column if not exists token_hash text unique,
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_token_hash text,
  add column if not exists retraction_reason text;

-- =====================================================================
-- Submit RPCs gain a p_token_hash param (drop+recreate to avoid overloads).
-- Bodies are unchanged except they persist token_hash. The two token-bearing
-- entities (help_requests, inspection_requests) already store it.
-- =====================================================================

-- ---- submit_building_report ----------------------------------------
drop function if exists public.submit_building_report(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, integer, text, text, smallint, text, text[],
  text, text, boolean, text, text);
create function public.submit_building_report(
  p_ip_hash text,
  p_lat double precision, p_lng double precision,
  p_estado text default null, p_municipio text default null, p_parroquia text default null,
  p_address text default null, p_description text default null,
  p_damage_level damage_level default 'unknown', p_people_status people_status default 'unknown',
  p_people_count_estimate int default null, p_reporter_contact text default null,
  p_construction_type text default null, p_floors smallint default null,
  p_occupancy_type text default null, p_hazard_flags text[] default null,
  p_collapse_mode text default null, p_access_status text default null,
  p_evacuated boolean default null, p_landmark text default null,
  p_source_channel text default 'web_form',
  p_token_hash text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare recent_count int; new_id uuid;
begin
  if p_lat is null or p_lng is null
     or p_lat < 0 or p_lat > 16 or p_lng < -74 or p_lng > -59 then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  select count(*) into recent_count from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'building_report'
      and created_at > now() - interval '1 hour';
  if recent_count >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.buildings (
    lat, lng, estado, municipio, parroquia, address, description,
    damage_level, people_status, people_count_estimate, reporter_contact,
    construction_type, floors_above_ground, occupancy_type, hazard_flags,
    collapse_mode, access_status, evacuated, landmark_description,
    source_channel, moderation_status, token_hash
  ) values (
    p_lat, p_lng, p_estado, p_municipio, p_parroquia, p_address, p_description,
    coalesce(p_damage_level,'unknown'), coalesce(p_people_status,'unknown'),
    p_people_count_estimate, p_reporter_contact,
    p_construction_type, p_floors, p_occupancy_type, p_hazard_flags,
    p_collapse_mode, p_access_status, p_evacuated, p_landmark,
    coalesce(p_source_channel,'web_form'), 'pending', p_token_hash
  ) returning id into new_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'building_report');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_building_report(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, integer, text, text, smallint, text, text[],
  text, text, boolean, text, text, text) from public;
grant execute on function public.submit_building_report(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, integer, text, text, smallint, text, text[],
  text, text, boolean, text, text, text) to anon, authenticated;

-- ---- submit_donation_center ----------------------------------------
drop function if exists public.submit_donation_center(
  text, text, double precision, double precision, text, text, text, text, text,
  text, text, donation_item[], donation_item[], text, boolean, text);
create function public.submit_donation_center(
  p_ip_hash text, p_name text,
  p_lat double precision default null, p_lng double precision default null,
  p_address text default null, p_city text default null, p_state text default null,
  p_country_code text default null, p_contact_public text default null,
  p_social text default null, p_hours text default null,
  p_accepts donation_item[] default null, p_priority donation_item[] default null,
  p_needs text default null, p_accepts_monetary boolean default false, p_monetary_url text default null,
  p_token_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare recent int; new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    return jsonb_build_object('ok', false, 'error', 'bad_coords');
  end if;
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'donation_center' and created_at > now() - interval '1 hour';
  if recent >= 2 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.donation_centers (name, lat, lng, address, city, state_province,
      country_code, contact_public_display, social_handle, hours_notes, accepts_items,
      priority_items, needs_notes, accepts_monetary, monetary_url, submitted_by, moderation_status, token_hash)
    values (p_name, p_lat, p_lng, p_address, p_city, p_state, p_country_code, p_contact_public,
      p_social, p_hours, p_accepts, p_priority, p_needs, coalesce(p_accepts_monetary,false),
      p_monetary_url, auth.uid(), 'pending', p_token_hash)
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'donation_center');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_donation_center(
  text, text, double precision, double precision, text, text, text, text, text,
  text, text, donation_item[], donation_item[], text, boolean, text, text) from public;
grant execute on function public.submit_donation_center(
  text, text, double precision, double precision, text, text, text, text, text,
  text, text, donation_item[], donation_item[], text, boolean, text, text) to anon, authenticated;

-- ---- submit_organization -------------------------------------------
drop function if exists public.submit_organization(
  text, text, text, text, org_category, org_scope, boolean, text, text);
create function public.submit_organization(
  p_ip_hash text, p_name text, p_website_url text default null,
  p_donation_url text default null, p_category org_category default 'other',
  p_scope org_scope default 'ambos', p_is_in_country boolean default false,
  p_description text default null, p_notes text default null,
  p_token_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare recent int; new_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'organization' and created_at > now() - interval '1 hour';
  if recent >= 3 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.organizations (name, website_url, donation_url, category, scope,
      is_in_country, description, submitter_notes, suggested_by, org_status, token_hash)
    values (p_name, p_website_url, p_donation_url, p_category, p_scope,
      coalesce(p_is_in_country,false), p_description, p_notes, auth.uid(), 'suggested', p_token_hash)
    returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'organization');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'suggested');
end; $$;
revoke execute on function public.submit_organization(
  text, text, text, text, org_category, org_scope, boolean, text, text, text) from public;
grant execute on function public.submit_organization(
  text, text, text, text, org_category, org_scope, boolean, text, text, text) to anon, authenticated;

-- ---- submit_misinformation_report ----------------------------------
drop function if exists public.submit_misinformation_report(
  text, text, misinfo_verdict, text, text, text, text, text);
create function public.submit_misinformation_report(
  p_ip_hash text, p_claim text, p_verdict misinfo_verdict default 'unverified',
  p_explanation text default '', p_source_url text default null,
  p_debunk_url text default null, p_related_place text default null,
  p_severity text default 'medium', p_token_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare recent int; new_id uuid;
begin
  if p_claim is null or length(trim(p_claim)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'claim_required');
  end if;
  if p_source_url is null or length(trim(p_source_url)) < 7 then
    return jsonb_build_object('ok', false, 'error', 'source_url_required');
  end if;
  if p_severity not in ('low', 'medium', 'high') then
    return jsonb_build_object('ok', false, 'error', 'invalid_severity');
  end if;
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'misinfo' and created_at > now() - interval '1 hour';
  if recent >= 5 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.misinformation_reports (
    claim, verdict, explanation, source_url, debunk_url,
    related_place, severity, status, suggested_by, token_hash
  ) values (
    trim(p_claim), coalesce(p_verdict, 'unverified'), coalesce(trim(p_explanation), ''),
    trim(p_source_url), nullif(trim(coalesce(p_debunk_url, '')), ''),
    nullif(trim(coalesce(p_related_place, '')), ''), coalesce(p_severity, 'medium'),
    'pending', auth.uid(), p_token_hash
  ) returning id into new_id;
  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'misinfo');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_misinformation_report(
  text, text, misinfo_verdict, text, text, text, text, text, text) from public;
grant execute on function public.submit_misinformation_report(
  text, text, misinfo_verdict, text, text, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- lookup_submission(token_hash) — the management page reads current state.
-- Token-hash possession is the authorization; returns no PII.
-- =====================================================================
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
      'retracted', (r.retracted_at is not null),
      'place', left(r.claim, 80));
  end if;

  return jsonb_build_object('ok', false, 'error', 'not_found');
end; $$;
revoke execute on function public.lookup_submission(text) from public;
grant execute on function public.lookup_submission(text) to anon, authenticated;

-- =====================================================================
-- retract_submission — soft-retract one row, gated by token-hash possession.
-- =====================================================================
create or replace function public.retract_submission(
  p_entity text, p_id uuid, p_token_hash text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c int; v_people people_status; v_status text; n int;
begin
  if p_token_hash is null or length(p_token_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;

  -- Light anti-brute-force throttle keyed on the token-hash prefix.
  select count(*) into n from public.submission_throttle
    where ip_hash = 'retract:' || left(p_token_hash, 16) and kind = 'retract'
      and created_at > now() - interval '1 hour';
  if n >= 30 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  insert into public.submission_throttle (ip_hash, kind)
    values ('retract:' || left(p_token_hash, 16), 'retract');

  if p_entity = 'building' then
    select people_status, moderation_status::text into v_people, v_status
      from public.buildings where id = p_id and token_hash = p_token_hash;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_status = 'retracted' then return jsonb_build_object('ok', true, 'status', 'retracted'); end if;
    -- LIFE-SAFETY GUARD: a publicly-visible possibly-trapped report needs a
    -- coordinator to confirm the retraction (never silently un-report a rescue).
    if v_people in ('possible', 'confirmed_trapped') and v_status = 'approved' then
      update public.buildings set retraction_requested_at = now(),
        retraction_requested_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash and retraction_requested_at is null;
      insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
        values ('building', p_id, 'retraction_requested', v_status, 'retraction_pending', p_reason);
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
    insert into public.moderation_log (entity_type, entity_id, action, new_status, reason)
      values ('help_request', p_id, 'retract', 'cancelled', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');

  elsif p_entity = 'inspection_request' then
    select status::text into v_status from public.inspection_requests
      where id = p_id and token_hash = p_token_hash;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'retracted'); end if;
    -- GUARD: a claimed / in-progress request must not silently drop an on-site responder.
    if v_status in ('claimed', 'in_progress') then
      update public.inspection_requests set cancellation_requested_at = now(),
        cancellation_requested_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash and cancellation_requested_at is null;
      insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
        values ('inspection_request', p_id, 'cancellation_requested', v_status, 'cancellation_pending', p_reason);
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
    -- coordinators, not a self-serve takedown. A still-pending one is rejected.
    if v_status = 'published' then
      update public.misinformation_reports set retracted_at = now(),
        retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
        where id = p_id and token_hash = p_token_hash;
      insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
        values ('misinfo_report', p_id, 'retract_signal', v_status, 'published', p_reason);
      return jsonb_build_object('ok', true, 'status', 'retraction_pending',
        'note', 'published_stays_until_coordinator');
    end if;
    update public.misinformation_reports set status = 'rejected', retracted_at = now(),
      retracted_by_token_hash = p_token_hash, retraction_reason = p_reason, updated_at = now()
      where id = p_id and token_hash = p_token_hash;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, reason)
      values ('misinfo_report', p_id, 'retract', v_status, 'rejected', p_reason);
    return jsonb_build_object('ok', true, 'status', 'retracted');
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_entity');
end; $$;
revoke execute on function public.retract_submission(text, uuid, text, text) from public;
grant execute on function public.retract_submission(text, uuid, text, text) to anon, authenticated;

-- =====================================================================
-- retract_skill_offer — account-owner path (offerer_id = auth.uid()).
-- =====================================================================
create or replace function public.retract_skill_offer(p_offer uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'auth_required'); end if;
  update public.skill_offers
    set suspended_at = now(), suspended_reason = coalesce(p_reason, 'retirada por el autor'),
        moderation_status = 'archived', available = false, updated_at = now()
    where id = p_offer and offerer_id = auth.uid() and suspended_at is null;
  get diagnostics c = row_count;
  if c = 0 then return jsonb_build_object('ok', false, 'error', 'not_found_or_not_owner'); end if;
  insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
    values ('skill_offer', p_offer, 'retract_by_owner', 'archived', auth.uid(), p_reason);
  return jsonb_build_object('ok', true, 'status', 'retracted');
end; $$;
revoke execute on function public.retract_skill_offer(uuid, text) from public, anon;
grant execute on function public.retract_skill_offer(uuid, text) to authenticated;

-- =====================================================================
-- Coordinator guard-resolution RPCs.
-- =====================================================================
-- A requested retraction of a possibly-trapped building: confirm hides it,
-- deny clears the request and the report stays public.
create or replace function public.resolve_building_retraction(p_building uuid, p_approve boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator'); end if;
  select moderation_status::text into v_status from public.buildings
    where id = p_building and retraction_requested_at is not null;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_pending_retraction'); end if;
  if p_approve then
    update public.buildings set moderation_status = 'retracted', retracted_at = now(),
      retracted_by = auth.uid(),
      retraction_reason = coalesce(retraction_reason, retraction_requested_reason),
      retracted_by_token_hash = coalesce(retracted_by_token_hash, 'coordinator-confirmed'),
      retraction_requested_at = null, updated_at = now()
      where id = p_building;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, moderator_id)
      values ('building', p_building, 'retraction_confirmed', v_status, 'retracted', auth.uid());
  else
    update public.buildings set retraction_requested_at = null,
      retraction_requested_reason = null, updated_at = now() where id = p_building;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, moderator_id)
      values ('building', p_building, 'retraction_denied', v_status, v_status, auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end; $$;
revoke execute on function public.resolve_building_retraction(uuid, boolean) from public, anon;
grant execute on function public.resolve_building_retraction(uuid, boolean) to authenticated;

-- A requested cancellation of a claimed/in-progress inspection: the assigned
-- responder OR a coordinator confirms (cancel) or denies (keep dispatch).
create or replace function public.resolve_inspection_cancellation(p_request uuid, p_approve boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text; v_claimed uuid;
begin
  select status::text, claimed_by into v_status, v_claimed from public.inspection_requests
    where id = p_request and cancellation_requested_at is not null;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_pending_cancellation'); end if;
  if not (public.is_responder_coordinator(auth.uid()) or v_claimed = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized'); end if;
  if p_approve then
    update public.inspection_requests set status = 'cancelled', retracted_at = now(),
      retraction_reason = coalesce(retraction_reason, cancellation_requested_reason),
      cancellation_requested_at = null, updated_at = now() where id = p_request;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, moderator_id)
      values ('inspection_request', p_request, 'cancellation_confirmed', v_status, 'cancelled', auth.uid());
  else
    update public.inspection_requests set cancellation_requested_at = null,
      cancellation_requested_reason = null, updated_at = now() where id = p_request;
    insert into public.moderation_log (entity_type, entity_id, action, previous_status, new_status, moderator_id)
      values ('inspection_request', p_request, 'cancellation_denied', v_status, v_status, auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end; $$;
revoke execute on function public.resolve_inspection_cancellation(uuid, boolean) from public, anon;
grant execute on function public.resolve_inspection_cancellation(uuid, boolean) to authenticated;
