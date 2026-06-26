-- =====================================================================
-- 0028 — Ingest fast-lane: deterministic auto-publish to the provisional
--        layer + cross-run idempotency.
--
-- Operator policy (2026-06-26): corroborated OR trusted-tier damage leads that
-- are NOT life-safety and NOT judge-vetoed may auto-publish to the "Reportes por
-- confirmar" provisional layer (moderation_status='approved' +
-- location_status='provisional') WITHOUT a coordinator click, so fresh info
-- reaches the public hourly. The gate is RE-ENFORCED in this RPC — a buggy or
-- compromised caller cannot self-publish a lead that fails the server check.
-- Everything else stays 'pending'. Trapped/possible (life-safety) ALWAYS pending.
--
-- The DEFAULT map (buildings_public, location_status='confirmed') stays fully
-- human/crowd-gated: an auto-published provisional pin only graduates to the
-- default map via confirm_building_location() (3 convergent crowd confirms or a
-- verified responder). So auto-publish surfaces area pins in the off-by-default
-- "Por confirmar" layer, never fake-precise pins on the primary map.
--
-- Also adds content_hash idempotency so a lead re-collected on a later tick
-- (e.g. after seen.json is lost, or two ticks overlap) bumps corroboration
-- instead of creating a duplicate pending row that would drown coordinators.
-- =====================================================================

-- ---- idempotency: content hash + cross-run dedup --------------------
alter table public.buildings
  add column if not exists content_hash text;

comment on column public.buildings.content_hash is
  'Stable signature of an ingested lead (sha256 of its dedup key). One live row per signature; lets the ingest RPC corroborate a re-collected lead instead of duplicating it.';

-- One LIVE row per content signature. Retracted rows excluded so a genuine
-- re-report after a retraction can re-open a fresh row.
create unique index if not exists buildings_content_hash_uq
  on public.buildings (content_hash)
  where content_hash is not null and retracted_at is null;

-- ---- replace submit_ingest_lead with the fast-lane-aware version ----
-- Drop the exact old signature (migration 0014) first, then recreate. Adding
-- parameters otherwise creates a confusing overload (AGENTS.md).
drop function if exists public.submit_ingest_lead(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, text, int, text, text, text, uuid[]
);

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
  p_llm_related_ids     uuid[] default null,
  -- fast-lane inputs (all default to the safe "stay pending" behaviour):
  p_best_tier           text default 'unknown',
  p_autopublish         boolean default false,
  p_content_hash        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent      int;
  new_id      uuid;
  existing_id uuid;
  v_action    text    := coalesce(p_llm_suggested_action, 'none');
  v_publish   boolean := false;
  v_modstatus text    := 'pending';
  v_locstatus text    := 'confirmed';   -- unchanged for the pending path
  v_locradius int     := null;
  v_reason    text    := null;
begin
  -- Venezuela bounding box (mirrors buildings_insert_anyone policy).
  if p_lat is null or p_lng is null
     or p_lat < 0 or p_lat > 16 or p_lng < -74 or p_lng > -59 then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  if v_action not in ('none','review_misinformation','review_possible_duplicate',
                      'review_classification','escalate_life_safety') then
    v_action := 'none';
  end if;

  -- Cross-run idempotency: if a live row already carries this content signature,
  -- corroborate it (bump count) instead of inserting a duplicate.
  if p_content_hash is not null then
    select id into existing_id from public.buildings
      where content_hash = p_content_hash and retracted_at is null
      limit 1;
    if existing_id is not null then
      update public.buildings
        set corroboration_count = least(coalesce(corroboration_count,1) + 1, 50),
            updated_at = now()
        where id = existing_id;
      return jsonb_build_object('ok', true, 'id', existing_id, 'status', 'corroborated');
    end if;
  end if;

  -- Rate limit (generous for a trusted recurring routine; caps abuse).
  select count(*) into recent from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'ingest_lead'
      and created_at > now() - interval '1 hour';
  if recent >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ===== SERVER-ENFORCED FAST-LANE GATE (mirror of fastlane.mjs) =====
  -- Auto-publish to the provisional layer ONLY when ALL conditions hold.
  -- Any failure → the lead stays 'pending' for the coordinator.
  if p_autopublish
     and coalesce(p_people_status::text, 'unknown') not in ('possible','confirmed_trapped')
     and v_action not in ('review_misinformation','review_classification','escalate_life_safety')
     and coalesce(p_damage_level::text, 'unknown') in ('minor','moderate','severe','collapsed')
     and (coalesce(p_corroboration_count, 1) >= 2
          or coalesce(p_best_tier, 'unknown') in ('official','media'))
  then
    v_publish   := true;
    v_modstatus := 'approved';
    v_locstatus := 'provisional';   -- "Por confirmar" layer; NOT the default map
    v_locradius := 600;             -- locality-centroid placement uncertainty (m)
    v_reason    := case when coalesce(p_corroboration_count, 1) >= 2
                        then 'corroborated:' || p_corroboration_count
                        else 'trusted:' || coalesce(p_best_tier, 'unknown') end;
  end if;

  insert into public.buildings (
    lat, lng, estado, municipio, parroquia, landmark_description, description,
    damage_level, people_status, source_channel, corroboration_count,
    llm_rationale, llm_suggested_action, llm_confidence, llm_related_ids,
    llm_reviewed_at, content_hash,
    moderation_status, verified, location_status, location_radius_m, located_at
  ) values (
    p_lat, p_lng, p_estado, p_municipio, p_parroquia,
    nullif(trim(coalesce(p_landmark, '')), ''),
    p_description,
    coalesce(p_damage_level, 'unknown'),
    coalesce(p_people_status, 'unknown'),
    coalesce(nullif(trim(coalesce(p_source_channel, '')), ''), 'social_scan'),
    least(greatest(coalesce(p_corroboration_count, 1), 1), 50),
    nullif(trim(coalesce(p_llm_rationale, '')), ''),
    v_action,
    coalesce(p_llm_confidence, 'low'),
    p_llm_related_ids,
    case when p_llm_rationale is not null or v_action <> 'none' then now() else null end,
    p_content_hash,
    v_modstatus::report_moderation_status,
    false,                              -- verified FORCED false (never anon-verifiable)
    v_locstatus,
    v_locradius,
    case when v_publish then now() else null end
  ) returning id into new_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'ingest_lead');

  -- Audit every auto-publish (append-only moderation_log). moderator_id is null
  -- (automated action); a coordinator can still re-provisional/retract it.
  if v_publish then
    insert into public.moderation_log
      (entity_type, entity_id, action, previous_status, new_status, reason)
    values
      ('building', new_id, 'auto_publish_fastlane', 'pending', 'approved',
       'ingest fast-lane (provisional): ' || coalesce(v_reason, ''));
  end if;

  return jsonb_build_object(
    'ok', true, 'id', new_id, 'status', v_modstatus,
    'location_status', v_locstatus, 'autopublished', v_publish
  );
end; $$;

revoke execute on function public.submit_ingest_lead(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, text, int, text, text, text, uuid[],
  text, boolean, text
) from public;
grant execute on function public.submit_ingest_lead(
  text, double precision, double precision, text, text, text, text, text,
  damage_level, people_status, text, int, text, text, text, uuid[],
  text, boolean, text
) to anon, authenticated;
