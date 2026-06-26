-- =====================================================================
-- 0026 — Partner status sync for the federated missing-person API.
--
-- Partners need two things after submitting records:
--   1) exact-identifier advisory edges, so two sources with the same cédula
--      or exact photo hash become one reviewable/searchable cluster without a
--      destructive merge; and
--   2) a status/sync read path, so a partner can poll what changed elsewhere
--      and reconcile its own record when another source reports "found".
--
-- The life-safety rule remains unchanged: the API surfaces status conflicts
-- and duplicate evidence, but only coordinators can hide one record behind
-- another through duplicate_of.
-- =====================================================================

-- Public/API projection now carries safe sync clocks. No cédula, contact,
-- precise coordinates, or photo hash are exposed.
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
    cluster_id,
    is_multi_person,
    (cedula_normalized is not null and not cedula_conflict) as cedula_confirmed,
    coalesce(array_length(possible_duplicate_ids, 1), 0) as cluster_size,
    last_seen_at, source_updated_at, created_at, updated_at
  from public.missing_person_pins
  where retracted_at is null
    and duplicate_of is null
    and expires_at > now()
    and quality_status = 'accepted';
grant select on public.missing_person_pins_public to anon, authenticated;

create index if not exists mpp_public_updated_at_idx
  on public.missing_person_pins (updated_at)
  where retracted_at is null
    and duplicate_of is null
    and quality_status = 'accepted';

-- Replace the federation RPC with:
--   * general stale-status protection (status changes require a newer source
--     timestamp when the row already has one);
--   * exact cédula/photo advisory edge linking inside Postgres; and
--   * updated_at/source_updated_at preservation for sync feeds.
drop function if exists public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[], text, text[]);

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
  p_cedula_normalized     text default null,
  p_photo_phash           text default null,
  p_name_phonetic         text default null,
  p_is_multi_person       boolean default false,
  p_cluster_reason        text[] default null,
  p_quality_status        text default 'accepted',
  p_quality_flags         text[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent             int;
  rec_id             uuid;
  existed            boolean;
  prev_status        missing_status;
  prev_src_upd       timestamptz;
  eff_status         missing_status := coalesce(p_status, 'missing');
  eff_quality_status text := coalesce(nullif(trim(p_quality_status), ''), 'accepted');
  eff_quality_flags  text[] := coalesce(p_quality_flags, '{}');
  out_quality_status text;
  out_quality_flags  text[];
  v_key              text := nullif(trim(coalesce(p_external_record_id, '')), '');
  v_bypass           text;
  v_cedula_norm      text := nullif(trim(coalesce(p_cedula_normalized, '')), '');
  v_photo_phash      text := nullif(trim(coalesce(p_photo_phash, '')), '');
  v_identifier_edges uuid[] := '{}';
  v_identifier_reason text[] := '{}';
  v_edge             uuid;
begin
  if eff_quality_status not in ('accepted', 'needs_review', 'rejected_spam') then
    return jsonb_build_object('ok', false, 'error', 'invalid_quality_status');
  end if;
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

  select value into v_bypass from public.internal_config where name = 'federation_bypass_token';
  if v_bypass is not null and p_ip_hash = v_bypass then
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

  -- Stale guard: once a row exists, do not let an older/no-timestamp source
  -- update change its status in either direction. It may still refresh TTL and
  -- non-status metadata.
  if existed and eff_status is distinct from prev_status then
    if p_source_updated_at is null
       or (prev_src_upd is not null and p_source_updated_at <= prev_src_upd) then
      eff_status := prev_status;
    end if;
  end if;

  insert into public.missing_person_pins (
    pfif_person_record_id, source, external_url, display_name,
    last_seen_lat, last_seen_lng, last_seen_at, estado, municipio,
    age_estimate, cedula, status, notes, source_updated_at,
    possible_duplicate_ids, dedupe_score, ingested_at,
    cedula_normalized, photo_phash, name_phonetic, is_multi_person, cluster_reason,
    quality_status, quality_flags,
    consent_given, photo_url, expires_at
  ) values (
    v_key, p_source, nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_display_name, '')), ''),
    p_last_seen_lat, p_last_seen_lng, p_last_seen_at, p_estado, p_municipio,
    p_age_estimate, nullif(trim(coalesce(p_cedula, '')), ''),
    eff_status, p_notes, p_source_updated_at,
    p_possible_duplicate_ids, p_dedupe_score, now(),
    v_cedula_norm,
    v_photo_phash,
    nullif(trim(coalesce(p_name_phonetic, '')), ''),
    coalesce(p_is_multi_person, false), p_cluster_reason,
    eff_quality_status, eff_quality_flags,
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
    source_updated_at      = coalesce(excluded.source_updated_at, missing_person_pins.source_updated_at),
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
    quality_status         = case
                               when missing_person_pins.quality_reviewed_at is not null then missing_person_pins.quality_status
                               else excluded.quality_status
                             end,
    quality_flags          = array(
                               select distinct flag from unnest(
                                 coalesce(missing_person_pins.quality_flags, '{}') || coalesce(excluded.quality_flags, '{}')
                               ) as x(flag)
                             ),
    ingested_at            = now(),
    expires_at             = now() + interval '30 days',
    updated_at             = now()
  returning id into rec_id;

  select quality_status, quality_flags into out_quality_status, out_quality_flags
    from public.missing_person_pins where id = rec_id;

  if out_quality_status = 'accepted' then
    with exact_edges as (
      select p.id, 'cedula'::text as reason
      from public.missing_person_pins p
      where v_cedula_norm is not null
        and p.cedula_normalized = v_cedula_norm
        and p.id <> rec_id
        and p.retracted_at is null
        and p.duplicate_of is null
        and p.expires_at > now()
        and p.quality_status = 'accepted'
      union all
      select p.id, 'photo'::text as reason
      from public.missing_person_pins p
      where v_photo_phash is not null
        and p.photo_phash = v_photo_phash
        and p.id <> rec_id
        and p.retracted_at is null
        and p.duplicate_of is null
        and p.expires_at > now()
        and p.quality_status = 'accepted'
    )
    select
      coalesce(array_agg(distinct e.id), '{}'::uuid[]),
      coalesce(array_agg(distinct e.reason), '{}'::text[])
    into v_identifier_edges, v_identifier_reason
    from exact_edges e
    where e.id <> all (coalesce((select split_from from public.missing_person_pins where id = rec_id), '{}'::uuid[]));

    if cardinality(v_identifier_edges) > 0 then
      update public.missing_person_pins p
        set possible_duplicate_ids = array(
              select distinct edge_id
              from unnest(coalesce(p.possible_duplicate_ids, '{}') || v_identifier_edges) as x(edge_id)
              where edge_id <> p.id and edge_id <> all (coalesce(p.split_from, '{}'))
            ),
            cluster_reason = array(
              select distinct reason
              from unnest(coalesce(p.cluster_reason, '{}') || v_identifier_reason) as x(reason)
            ),
            updated_at = now()
        where p.id = rec_id;

      foreach v_edge in array v_identifier_edges loop
        perform public.append_duplicate_edge(v_edge, rec_id);
        update public.missing_person_pins p
          set cluster_reason = array(
                select distinct reason
                from unnest(coalesce(p.cluster_reason, '{}') || v_identifier_reason) as x(reason)
              ),
              updated_at = now()
          where p.id = v_edge;
      end loop;
    end if;
  end if;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'missing_ingest');
  return jsonb_build_object('ok', true, 'id', rec_id,
                            'action', case when existed then 'updated' else 'inserted' end,
                            'quality_status', out_quality_status,
                            'quality_flags', coalesce(out_quality_flags, '{}'::text[]),
                            'identifier_matches', coalesce(cardinality(v_identifier_edges), 0));
end; $$;

revoke execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[], text, text[]) from public;
grant execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[], text, text[]) to anon, authenticated;

-- Partner-owned status lookup. The API route passes the already-authenticated
-- key id and a partner externalId; this returns that source row plus accepted
-- advisory duplicates and hard-merge survivor rows, redacted to public-safe
-- fields. The caller computes the cluster status summary in TypeScript.
create or replace function public.partner_missing_person_status(
  p_key_id uuid,
  p_external_record_id text
) returns table(
  relation text,
  id uuid,
  display_name text,
  estado text,
  municipio text,
  status missing_status,
  source external_source,
  external_url text,
  age_estimate smallint,
  cedula_confirmed boolean,
  cluster_id uuid,
  cluster_size int,
  is_multi_person boolean,
  last_seen_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  quality_status text
)
language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'partner-' || p_key_id::text || ':' || nullif(trim(coalesce(p_external_record_id, '')), '');
  v_base_id uuid;
  v_duplicate_of uuid;
begin
  if nullif(trim(coalesce(p_external_record_id, '')), '') is null then
    return;
  end if;

  select p.id, p.duplicate_of into v_base_id, v_duplicate_of
    from public.missing_person_pins p
    where p.pfif_person_record_id = v_key
    limit 1;

  if v_base_id is null then
    return;
  end if;

  return query
    with base as (
      select p.*
      from public.missing_person_pins p
      where p.id = v_base_id
    ),
    wanted as (
      select v_base_id as id, 'self'::text as relation, 0 as priority
      union all
      select v_duplicate_of, 'merged_into'::text, 1
      where v_duplicate_of is not null
      union all
      select unnest(coalesce((select possible_duplicate_ids from base), '{}'::uuid[])), 'duplicate'::text, 2
      union all
      select p.id, 'duplicate'::text, 3
      from public.missing_person_pins p
      where v_base_id = any(coalesce(p.possible_duplicate_ids, '{}'::uuid[]))
    ),
    ranked as (
      select distinct on (w.id) w.id, w.relation, w.priority
      from wanted w
      where w.id is not null
      order by w.id, w.priority
    )
    select
      r.relation,
      p.id,
      p.display_name,
      p.estado,
      p.municipio,
      p.status,
      p.source,
      p.external_url,
      p.age_estimate,
      (p.cedula_normalized is not null and not p.cedula_conflict) as cedula_confirmed,
      p.cluster_id,
      coalesce(array_length(p.possible_duplicate_ids, 1), 0) as cluster_size,
      p.is_multi_person,
      p.last_seen_at,
      p.source_updated_at,
      p.created_at,
      p.updated_at,
      p.quality_status
    from ranked r
    join public.missing_person_pins p on p.id = r.id
    where p.retracted_at is null
      and p.expires_at > now()
      and (
        p.id = v_base_id
        or (p.duplicate_of is null and p.quality_status = 'accepted')
      )
    order by r.priority, p.updated_at desc;
end; $$;

revoke execute on function public.partner_missing_person_status(uuid, text) from public;
grant execute on function public.partner_missing_person_status(uuid, text) to anon, authenticated;
