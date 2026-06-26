-- =====================================================================
-- 0015 — Missing-person FEDERATION: controlled ingestion RPC + advisory
--        dedupe annotations.
--
-- Realises the long-deferred PFIF aggregation (architecture decision
-- 2026-06-25 "federate / link out, do NOT build a competing registry").
-- We pull records that ALREADY EXIST on public registries (Google Person
-- Finder PFIF feeds, Venezuela Te Busca, etc.) into a read-only federated
-- index so families search in ONE place, with every record linking back to
-- its source. We never host their photos and never become the system of
-- record.
--
-- Dedupe stance (user decision 2026-06-26): SURFACE, NEVER AUTO-MERGE.
-- A wrong merge during a disaster can hide a found person. So ingestion
-- writes *advisory* possible-duplicate annotations only; the hard
-- `duplicate_of` merge link stays human/coordinator-gated (set elsewhere).
--
-- Objects:
--   * missing_person_pins.possible_duplicate_ids / dedupe_score / ingested_at
--     — advisory dedupe annotations (NOT a merge; possible_duplicate_ids is
--       exposed publicly so the search can cluster "posible misma persona").
--   * RPC public.submit_missing_person_record() — SECURITY DEFINER controlled
--     write path. UPSERTS by pfif_person_record_id (cross-feed/cross-tick
--     dedup for free), requires external_url for federated rows, FORCES
--     consent_given=false + photo_url=null (we don't host federated photos),
--     refreshes expires_at (federated TTL), throttles, returns id + action.
-- =====================================================================

-- ---- advisory dedupe annotations -------------------------------------
alter table public.missing_person_pins
  add column if not exists possible_duplicate_ids uuid[],
  add column if not exists dedupe_score           real,
  add column if not exists ingested_at            timestamptz;

comment on column public.missing_person_pins.possible_duplicate_ids is
  'Advisory: other pins that MIGHT be the same person (fuzzy match at ingestion). NOT a merge — purely surfaces a "posible misma persona" cluster. The authoritative merge is duplicate_of, set only by a human/coordinator.';

-- Re-expose the public view with the advisory cluster + age (helps families
-- disambiguate). Keeps every existing privacy filter and the consent photo gate.
drop view if exists public.missing_person_pins_public;
create view public.missing_person_pins_public with (security_invoker = off) as
  select
    id, display_name,
    public.fuzz_coord(last_seen_lat) as lat,
    public.fuzz_coord(last_seen_lng) as lng,
    estado, municipio, status, source, external_url,
    case when consent_given then photo_url else null end as photo_url,
    age_estimate,
    possible_duplicate_ids,
    last_seen_at, created_at
  from public.missing_person_pins
  where retracted_at is null
    and duplicate_of is null
    and expires_at > now();
grant select on public.missing_person_pins_public to anon, authenticated;

-- ---- controlled federation ingestion RPC -----------------------------
-- SECURITY DEFINER so it can write the provenance columns anon lacks a direct
-- grant on (source, external_url, pfif_person_record_id, display_name, coords…)
-- while the anon INSERT grant on the base table stays narrow. consent_given and
-- photo_url are FORCED — a federated pull can never publish a hosted photo or a
-- consent claim it didn't earn.
create or replace function public.submit_missing_person_record(
  p_ip_hash               text,
  p_external_record_id    text,                 -- PFIF person_record_id, or a stable synthetic key
  p_source                external_source,
  p_external_url          text,
  p_display_name          text default null,
  p_last_seen_lat         double precision default null,
  p_last_seen_lng         double precision default null,
  p_last_seen_at          timestamptz default null,
  p_estado                text default null,
  p_municipio             text default null,
  p_age_estimate          smallint default null,
  p_cedula                text default null,
  p_status                missing_status default 'missing',
  p_notes                 text default null,
  p_source_updated_at     timestamptz default null,
  p_possible_duplicate_ids uuid[] default null,
  p_dedupe_score          real default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent  int;
  rec_id  uuid;
  existed boolean;
  v_key   text := nullif(trim(coalesce(p_external_record_id, '')), '');
begin
  -- Federation invariant (mirrors mpp_external_requires_url): non-internal
  -- rows MUST link back to a source registry. We do not own this data.
  if p_source <> 'internal' and nullif(trim(coalesce(p_external_url, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'external_url_required');
  end if;

  -- A stable key is what makes this idempotent (re-ingest = update, not dup).
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'external_record_id_required');
  end if;

  -- Bounds-check coords when present (Venezuela bbox; coords are optional for
  -- a federated record that only knows a locality).
  if p_last_seen_lat is not null and p_last_seen_lng is not null
     and (p_last_seen_lat < 0 or p_last_seen_lat > 16
          or p_last_seen_lng < -74 or p_last_seen_lng > -59) then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  -- Rate limit: generous for a trusted recurring federation routine.
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'missing_ingest'
      and created_at > now() - interval '1 hour';
  if recent >= 500 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select id into rec_id from public.missing_person_pins
    where pfif_person_record_id = v_key;
  existed := rec_id is not null;

  insert into public.missing_person_pins (
    pfif_person_record_id, source, external_url, display_name,
    last_seen_lat, last_seen_lng, last_seen_at, estado, municipio,
    age_estimate, cedula, status, notes, source_updated_at,
    possible_duplicate_ids, dedupe_score, ingested_at,
    consent_given, photo_url, expires_at
  ) values (
    v_key, p_source, nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_display_name, '')), ''),
    p_last_seen_lat, p_last_seen_lng, p_last_seen_at, p_estado, p_municipio,
    p_age_estimate, nullif(trim(coalesce(p_cedula, '')), ''),
    coalesce(p_status, 'missing'), p_notes, p_source_updated_at,
    p_possible_duplicate_ids, p_dedupe_score, now(),
    false,                          -- FORCED: federation never claims consent
    null,                           -- FORCED: we don't host federated photos
    now() + interval '30 days'      -- federated TTL; re-ingestion refreshes it
  )
  on conflict (pfif_person_record_id) do update set
    source                 = excluded.source,
    external_url           = excluded.external_url,
    display_name           = coalesce(excluded.display_name, missing_person_pins.display_name),
    last_seen_lat          = coalesce(excluded.last_seen_lat, missing_person_pins.last_seen_lat),
    last_seen_lng          = coalesce(excluded.last_seen_lng, missing_person_pins.last_seen_lng),
    last_seen_at           = coalesce(excluded.last_seen_at, missing_person_pins.last_seen_at),
    estado                 = coalesce(excluded.estado, missing_person_pins.estado),
    municipio              = coalesce(excluded.municipio, missing_person_pins.municipio),
    age_estimate           = coalesce(excluded.age_estimate, missing_person_pins.age_estimate),
    status                 = excluded.status,
    notes                  = coalesce(excluded.notes, missing_person_pins.notes),
    source_updated_at      = excluded.source_updated_at,
    possible_duplicate_ids = excluded.possible_duplicate_ids,
    dedupe_score           = excluded.dedupe_score,
    ingested_at            = now(),
    expires_at             = now() + interval '30 days'
  returning id into rec_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'missing_ingest');
  return jsonb_build_object('ok', true, 'id', rec_id,
                            'action', case when existed then 'updated' else 'inserted' end);
end; $$;

revoke execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real
) from public;
grant execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real
) to anon, authenticated;
