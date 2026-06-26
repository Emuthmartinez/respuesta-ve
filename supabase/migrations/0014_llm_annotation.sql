-- =====================================================================
-- 0014 — LLM annotation layer + pipeline ingest RPC.
--
-- Realises the LLM-council architecture (2026-06-26): the deterministic
-- layer stays the ONLY write path; the LLM (running inside the local
-- respuesta-ingest claude routine) acts as a bounded ANNOTATOR — it enriches
-- each lead with a rationale + a SUGGESTED coordinator action, but never
-- decides merges, classification, location, or moderation_status. Those stay
-- deterministic + coordinator-gated.
--
-- Objects:
--   * buildings.llm_* annotation columns (coordinator-facing triage aids;
--     NOT exposed in any public view).
--   * RPC public.submit_ingest_lead() — SECURITY DEFINER. The controlled
--     write path for the automated pipeline: sets source_channel /
--     landmark_description / corroboration_count / llm_* (which anon cannot
--     set via direct INSERT — the anon column grant stays narrow), FORCES
--     moderation_status='pending' + verified=false, bounds-checks coords,
--     throttles, and RETURNS the new id so the routine can correlate.
-- =====================================================================

-- ---- annotation columns ---------------------------------------------
alter table public.buildings
  add column if not exists llm_rationale text,
  add column if not exists llm_suggested_action text
    check (llm_suggested_action is null or llm_suggested_action in
      ('none','review_misinformation','review_possible_duplicate',
       'review_classification','escalate_life_safety')),
  add column if not exists llm_confidence text
    check (llm_confidence is null or llm_confidence in ('low','medium','high')),
  add column if not exists llm_related_ids uuid[],
  add column if not exists llm_reviewed_at timestamptz;

comment on column public.buildings.llm_suggested_action is
  'LLM triage SUGGESTION for the coordinator. Advisory only — never auto-applied. The committed damage_level/duplicate_of/moderation_status remain deterministic + human-gated.';

-- Index for the coordinator triage queue (rows the LLM flagged for attention).
create index if not exists buildings_llm_action_idx
  on public.buildings (llm_suggested_action)
  where llm_suggested_action is not null and llm_suggested_action <> 'none';

-- ---- pipeline ingest RPC --------------------------------------------
-- SECURITY DEFINER so it can write the columns anon lacks a direct grant on
-- (source_channel, landmark_description, corroboration_count, llm_*) while the
-- anon INSERT grant on public.buildings stays restricted to the public-form
-- columns. moderation_status + verified are FORCED here — the pipeline (and any
-- anon caller) can never self-approve a lead onto the public map.
create or replace function public.submit_ingest_lead(
  p_ip_hash             text,
  p_lat                 double precision,
  p_lng                 double precision,
  p_estado              text default null,
  p_municipio           text default null,
  p_parroquia           text default null,
  p_landmark            text default null,
  p_description         text default null,
  p_damage_level        damage_level  default 'unknown',
  p_people_status       people_status default 'unknown',
  p_source_channel      text default 'social_scan',
  p_corroboration_count int  default 1,
  p_llm_rationale       text default null,
  p_llm_suggested_action text default 'none',
  p_llm_confidence      text default 'low',
  p_llm_related_ids     uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent int;
  new_id uuid;
  v_action text := coalesce(p_llm_suggested_action, 'none');
begin
  -- Venezuela bounding box (mirrors buildings_insert_anyone policy + submit_building_report)
  if p_lat is null or p_lng is null
     or p_lat < 0 or p_lat > 16 or p_lng < -74 or p_lng > -59 then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  if v_action not in ('none','review_misinformation','review_possible_duplicate',
                      'review_classification','escalate_life_safety') then
    v_action := 'none';
  end if;

  -- Rate limit: generous for a trusted recurring routine, caps abuse of this
  -- anon-callable surface. Keyed by the pipeline's stable ip_hash.
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'ingest_lead'
      and created_at > now() - interval '1 hour';
  if recent >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.buildings (
    lat, lng, estado, municipio, parroquia, landmark_description, description,
    damage_level, people_status, source_channel, corroboration_count,
    llm_rationale, llm_suggested_action, llm_confidence, llm_related_ids,
    llm_reviewed_at, moderation_status, verified
  ) values (
    p_lat, p_lng, p_estado, p_municipio, p_parroquia,
    nullif(trim(coalesce(p_landmark, '')), ''),
    p_description,
    coalesce(p_damage_level, 'unknown'),
    coalesce(p_people_status, 'unknown'),
    coalesce(nullif(trim(coalesce(p_source_channel, '')), ''), 'social_scan'),
    least(greatest(coalesce(p_corroboration_count, 1), 1), 50),  -- clamp 1..50 (anti-spoof)
    nullif(trim(coalesce(p_llm_rationale, '')), ''),
    v_action,
    coalesce(p_llm_confidence, 'low'),
    p_llm_related_ids,
    case when p_llm_rationale is not null or v_action <> 'none' then now() else null end,
    'pending',   -- FORCED: never anon-approvable
    false        -- FORCED: never anon-verifiable
  ) returning id into new_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'ingest_lead');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;

revoke execute on function public.submit_ingest_lead(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, text, int, text, text, text, uuid[]
) from public;
grant execute on function public.submit_ingest_lead(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, text, int, text, text, text, uuid[]
) to anon, authenticated;
