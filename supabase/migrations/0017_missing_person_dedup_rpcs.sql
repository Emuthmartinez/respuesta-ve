-- =====================================================================
-- 0017 — Dedup RPCs: reversible coordinator merge/unmerge/split + the
--        upgraded federation ingest path (array-merged edges, status-
--        regression guard, dedup columns). Pairs with 0016.
--
-- "Group without losing records" in practice: grouping is advisory
-- (possible_duplicate_ids / cluster_id); the ONLY record-hiding action is
-- duplicate_of, and it is coordinator-gated, audited, and REVERSIBLE here.
-- =====================================================================

-- ---- bidirectional edge helper ---------------------------------------
-- Append an edge to a record's possible_duplicate_ids, deduped and honoring
-- any coordinator split (split_from). Used so union-find groups correctly even
-- when edges are discovered one direction at a time across paginated ingest.
create or replace function public.append_duplicate_edge(p_record_id uuid, p_edge_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.missing_person_pins
    set possible_duplicate_ids = array(
      select distinct e from unnest(
        coalesce(possible_duplicate_ids, '{}') || array[p_edge_id]
      ) e
      where e <> all (coalesce(split_from, '{}'))
    )
    where id = p_record_id
      and p_edge_id <> p_record_id
      and p_edge_id <> all (coalesce(split_from, '{}'));
$$;
revoke execute on function public.append_duplicate_edge(uuid, uuid) from anon, authenticated;

-- ---- upgraded federation ingest --------------------------------------
-- Extends 0015 with the dedup columns + array-merged edges + a status
-- regression guard (a "found" update never silently overwrites a "missing"
-- record unless the source timestamp is strictly newer).
drop function if exists public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real);

create or replace function public.submit_missing_person_record(
  p_ip_hash               text,
  p_external_record_id    text,
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
  p_dedupe_score          real default null,
  -- new dedup fields (computed in JS by the caller — single source of truth):
  p_cedula_normalized     text default null,
  p_photo_phash           text default null,
  p_name_phonetic         text default null,
  p_is_multi_person       boolean default false,
  p_cluster_reason        text[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent       int;
  rec_id       uuid;
  existed      boolean;
  prev_status  missing_status;
  prev_src_upd timestamptz;
  eff_status   missing_status := coalesce(p_status, 'missing');
  v_key        text := nullif(trim(coalesce(p_external_record_id, '')), '');
begin
  if p_source <> 'internal' and nullif(trim(coalesce(p_external_url, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'external_url_required');
  end if;
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'external_record_id_required');
  end if;
  if p_last_seen_lat is not null and p_last_seen_lng is not null
     and (p_last_seen_lat < 0 or p_last_seen_lat > 16
          or p_last_seen_lng < -74 or p_last_seen_lng > -59) then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  -- Trusted federation routine bypasses the per-hour throttle (TTL/bulk sync
  -- is liveness, not spam); everyone else is capped.
  if p_ip_hash like 'federation-%' then
    recent := 0;
  else
    select count(*) into recent from public.submission_throttle
      where ip_hash = p_ip_hash and kind = 'missing_ingest'
        and created_at > now() - interval '1 hour';
    if recent >= 500 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  select id, status, source_updated_at
    into rec_id, prev_status, prev_src_upd
    from public.missing_person_pins where pfif_person_record_id = v_key;
  existed := rec_id is not null;

  -- Status regression guard: do not flip an open (missing/unknown) record to a
  -- resolved status unless the incoming source timestamp is strictly newer.
  if existed and prev_status in ('missing','unknown')
     and eff_status in ('found_safe','found_injured','deceased')
     and (p_source_updated_at is null or prev_src_upd is null or p_source_updated_at <= prev_src_upd) then
    eff_status := prev_status;
  end if;

  insert into public.missing_person_pins (
    pfif_person_record_id, source, external_url, display_name,
    last_seen_lat, last_seen_lng, last_seen_at, estado, municipio,
    age_estimate, cedula, status, notes, source_updated_at,
    possible_duplicate_ids, dedupe_score, ingested_at,
    cedula_normalized, photo_phash, name_phonetic, is_multi_person, cluster_reason,
    consent_given, photo_url, expires_at
  ) values (
    v_key, p_source, nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_display_name, '')), ''),
    p_last_seen_lat, p_last_seen_lng, p_last_seen_at, p_estado, p_municipio,
    p_age_estimate, nullif(trim(coalesce(p_cedula, '')), ''),
    eff_status, p_notes, p_source_updated_at,
    p_possible_duplicate_ids, p_dedupe_score, now(),
    nullif(trim(coalesce(p_cedula_normalized, '')), ''),
    nullif(trim(coalesce(p_photo_phash, '')), ''),
    nullif(trim(coalesce(p_name_phonetic, '')), ''),
    coalesce(p_is_multi_person, false), p_cluster_reason,
    false, null, now() + interval '30 days'
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
    status                 = eff_status,
    notes                  = coalesce(excluded.notes, missing_person_pins.notes),
    source_updated_at      = excluded.source_updated_at,
    -- ARRAY-MERGE edges (never destroy prior-run edges), honoring splits.
    possible_duplicate_ids = array(
      select distinct e from unnest(
        coalesce(missing_person_pins.possible_duplicate_ids, '{}') || coalesce(excluded.possible_duplicate_ids, '{}')
      ) e
      where e <> all (coalesce(missing_person_pins.split_from, '{}'))
    ),
    dedupe_score           = coalesce(excluded.dedupe_score, missing_person_pins.dedupe_score),
    cedula                 = coalesce(excluded.cedula, missing_person_pins.cedula),
    cedula_normalized      = coalesce(excluded.cedula_normalized, missing_person_pins.cedula_normalized),
    photo_phash            = coalesce(excluded.photo_phash, missing_person_pins.photo_phash),
    name_phonetic          = coalesce(excluded.name_phonetic, missing_person_pins.name_phonetic),
    is_multi_person        = excluded.is_multi_person,
    cluster_reason         = coalesce(excluded.cluster_reason, missing_person_pins.cluster_reason),
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
  uuid[], real, text, text, text, boolean, text[]) from public;
grant execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[]) to anon, authenticated;

-- ---- coordinator: reversible HARD merge ------------------------------
-- Suppresses p_merged_id behind p_merged_into_id. LIFE-SAFETY GUARD: refuses to
-- suppress the last open (missing) record behind a resolved one unless the
-- coordinator passes p_override_missing. Audits BEFORE writing. Reversible.
create or replace function public.set_duplicate_of(
  p_merged_id        uuid,
  p_merged_into_id   uuid,
  p_reason_text      text default null,
  p_override_missing boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_merged_status   missing_status;
  v_survivor_status missing_status;
  v_cluster_reason  text[];
begin
  if not public.is_responder_coordinator(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  if p_merged_id = p_merged_into_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_merge_self');
  end if;

  select status, cluster_reason into v_merged_status, v_cluster_reason
    from public.missing_person_pins where id = p_merged_id;
  select status into v_survivor_status
    from public.missing_person_pins where id = p_merged_into_id;
  if v_merged_status is null or v_survivor_status is null then
    return jsonb_build_object('ok', false, 'error', 'record_not_found');
  end if;

  if v_merged_status in ('missing','unknown')
     and v_survivor_status not in ('missing','unknown')
     and not p_override_missing then
    return jsonb_build_object('ok', false, 'error', 'suppressing_open_record',
      'warning', 'Estás ocultando el único registro activo de búsqueda de esta persona detrás de un registro ya resuelto. Confirma para continuar.');
  end if;

  insert into public.missing_person_merge_audit
    (merged_id, merged_into_id, action, actor_id, reason_text, pre_status, cluster_reason)
  values (p_merged_id, p_merged_into_id, 'merge', v_uid, p_reason_text, v_merged_status, v_cluster_reason);

  update public.missing_person_pins set duplicate_of = p_merged_into_id where id = p_merged_id;

  -- A hard merge supersedes a prior split decision for this exact pair.
  delete from public.missing_person_dedup_exceptions
    where (id_a = p_merged_id and id_b = p_merged_into_id)
       or (id_b = p_merged_id and id_a = p_merged_into_id);

  return jsonb_build_object('ok', true, 'merged_id', p_merged_id, 'merged_into_id', p_merged_into_id);
end; $$;
revoke execute on function public.set_duplicate_of(uuid, uuid, text, boolean) from anon, public;
grant execute on function public.set_duplicate_of(uuid, uuid, text, boolean) to authenticated;

-- ---- coordinator: reverse a merge ------------------------------------
create or replace function public.clear_duplicate_of(p_merged_id uuid, p_reason_text text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pre missing_status;
begin
  if not public.is_responder_coordinator(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  select status into v_pre from public.missing_person_pins where id = p_merged_id;
  if v_pre is null then return jsonb_build_object('ok', false, 'error', 'record_not_found'); end if;
  insert into public.missing_person_merge_audit
    (merged_id, merged_into_id, action, actor_id, reason_text, pre_status)
  values (p_merged_id, null, 'unmerge', v_uid, p_reason_text, v_pre);
  update public.missing_person_pins set duplicate_of = null, needs_rescore = true where id = p_merged_id;
  return jsonb_build_object('ok', true, 'unmerged_id', p_merged_id);
end; $$;
revoke execute on function public.clear_duplicate_of(uuid, text) from anon, public;
grant execute on function public.clear_duplicate_of(uuid, text) to authenticated;

-- ---- coordinator: split a wrong grouping (records stay, edge dies) ----
create or replace function public.split_cluster(p_id_a uuid, p_id_b uuid, p_reason_text text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_responder_coordinator(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  -- remove the edge in both directions
  update public.missing_person_pins
    set possible_duplicate_ids = array(select e from unnest(coalesce(possible_duplicate_ids,'{}')) e where e <> p_id_b),
        split_from = array(select distinct e from unnest(coalesce(split_from,'{}') || array[p_id_b]) e)
    where id = p_id_a;
  update public.missing_person_pins
    set possible_duplicate_ids = array(select e from unnest(coalesce(possible_duplicate_ids,'{}')) e where e <> p_id_a),
        split_from = array(select distinct e from unnest(coalesce(split_from,'{}') || array[p_id_a]) e)
    where id = p_id_b;
  insert into public.missing_person_dedup_exceptions (id_a, id_b, split_by, reason_text)
    values (p_id_a, p_id_b, v_uid, p_reason_text) on conflict (id_a, id_b) do nothing;
  return jsonb_build_object('ok', true, 'split', array[p_id_a, p_id_b]);
end; $$;
revoke execute on function public.split_cluster(uuid, uuid, text) from anon, public;
grant execute on function public.split_cluster(uuid, uuid, text) to authenticated;
