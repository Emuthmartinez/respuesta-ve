-- =====================================================================
-- 0024 — Missing-person intake quality gate.
--
-- External registries can contain spam, fictional names, initials-only rows,
-- or unusable records. Keep those rows for coordinator review, but exclude
-- them from the public website and partner search/match API until accepted.
-- Dedup remains separate: cédula/photo/name decide identity; quality decides
-- whether a row is safe to publish at all.
-- =====================================================================

alter table public.missing_person_pins
  add column if not exists quality_status text not null default 'accepted',
  add column if not exists quality_flags text[] not null default '{}',
  add column if not exists quality_reviewed_at timestamptz,
  add column if not exists quality_reviewed_by uuid references auth.users(id),
  add column if not exists quality_review_note text;

do $$ begin
  alter table public.missing_person_pins
    add constraint missing_person_quality_status_check
    check (quality_status in ('accepted', 'needs_review', 'rejected_spam'));
exception when duplicate_object then null; end $$;

comment on column public.missing_person_pins.quality_status is
  'Intake publication gate. Only accepted records appear in missing_person_pins_public; needs_review/rejected_spam remain coordinator-visible.';
comment on column public.missing_person_pins.quality_flags is
  'Deterministic intake flags such as initials_only, fictional_or_meme, weak_identity, missing_link_back.';

create index if not exists mpp_quality_review_idx
  on public.missing_person_pins (quality_status, created_at desc)
  where quality_status <> 'accepted' and retracted_at is null and duplicate_of is null;

-- Backfill currently-ingested obvious garbage into the review queue.
with flagged as (
  select
    id,
    array_remove(array[
      case when source <> 'internal' and nullif(trim(coalesce(external_url, '')), '') is null then 'missing_link_back' end,
      case when nullif(trim(coalesce(display_name, '')), '') is null then 'missing_name' end,
      case when length(regexp_replace(coalesce(display_name, ''), '[^[:alpha:]]', '', 'g')) between 1 and 2 then 'initials_only' end,
      case when lower(trim(coalesce(display_name, ''))) in
        ('anonimo', 'anonima', 'desconocido', 'desconocida', 'no identificado',
         'no identificada', 'sin nombre', 'sin datos', 'n/a', 'na', 'test',
         'prueba', 'asdf', 'qwerty', 'xxx') then 'placeholder_name' end,
      case when coalesce(display_name, '') ~* '(^|[^[:alpha:]])(minion|superman|batman|spiderman|hulk|goku|pikachu|mickey|barbie|shrek|minecraft|roblox)([^[:alpha:]]|$)' then 'fictional_or_meme' end,
      case when cedula_normalized is null and photo_phash is null
             and array_length(regexp_split_to_array(trim(coalesce(display_name, '')), '\s+'), 1) < 2
           then 'weak_identity' end
    ], null) as flags
  from public.missing_person_pins
  where retracted_at is null and duplicate_of is null
)
update public.missing_person_pins p
  set quality_status = 'needs_review',
      quality_flags = array(
        select distinct flag from unnest(coalesce(p.quality_flags, '{}') || flagged.flags) as x(flag)
      )
  from flagged
  where p.id = flagged.id
    and cardinality(flagged.flags) > 0
    and p.quality_status = 'accepted';

-- Public/API projection: quality_status is intentionally NOT exposed. The
-- absence of a row means "not public", not "spam accusation".
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
    last_seen_at, created_at
  from public.missing_person_pins
  where retracted_at is null
    and duplicate_of is null
    and expires_at > now()
    and quality_status = 'accepted';
grant select on public.missing_person_pins_public to anon, authenticated;

-- ---- upgraded federation ingest --------------------------------------
drop function if exists public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[]);

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
    quality_status, quality_flags,
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
    source_updated_at      = excluded.source_updated_at,
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
    expires_at             = now() + interval '30 days'
  returning id into rec_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'missing_ingest');
  select quality_status, quality_flags into out_quality_status, out_quality_flags
    from public.missing_person_pins where id = rec_id;
  return jsonb_build_object('ok', true, 'id', rec_id,
                            'action', case when existed then 'updated' else 'inserted' end,
                            'quality_status', out_quality_status,
                            'quality_flags', coalesce(out_quality_flags, '{}'::text[]));
end; $$;

revoke execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[], text, text[]) from public;
grant execute on function public.submit_missing_person_record(
  text, text, external_source, text, text, double precision, double precision,
  timestamptz, text, text, smallint, text, missing_status, text, timestamptz,
  uuid[], real, text, text, text, boolean, text[], text, text[]) to anon, authenticated;

-- ---- coordinator review queue ----------------------------------------
create or replace function public.coord_missing_quality_queue(p_limit int default 200)
returns table(
  id uuid, display_name text, age_estimate smallint, estado text, municipio text,
  status missing_status, source external_source, external_url text,
  cedula_masked text, cedula_present boolean, quality_status text,
  quality_flags text[], created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select p.id, p.display_name, p.age_estimate, p.estado, p.municipio,
           p.status, p.source, p.external_url,
           case when p.cedula_normalized is not null
                then left(p.cedula_normalized, 1) || '•••' || right(p.cedula_normalized, 2) end,
           p.cedula_normalized is not null,
           p.quality_status, p.quality_flags, p.created_at
    from public.missing_person_pins p
    where p.retracted_at is null
      and p.duplicate_of is null
      and p.quality_status = 'needs_review'
    order by p.created_at desc
    limit greatest(1, least(500, p_limit));
end; $$;
revoke execute on function public.coord_missing_quality_queue(int) from anon, public;
grant execute on function public.coord_missing_quality_queue(int) to authenticated;

create or replace function public.coord_set_missing_quality(
  p_id uuid,
  p_quality_status text,
  p_reason_text text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prev text;
begin
  if not public.is_responder_coordinator(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  if p_quality_status not in ('accepted', 'needs_review', 'rejected_spam') then
    return jsonb_build_object('ok', false, 'error', 'invalid_quality_status');
  end if;
  select quality_status into v_prev from public.missing_person_pins where id = p_id;
  if v_prev is null then
    return jsonb_build_object('ok', false, 'error', 'record_not_found');
  end if;

  update public.missing_person_pins
    set quality_status = p_quality_status,
        quality_reviewed_at = now(),
        quality_reviewed_by = v_uid,
        quality_review_note = p_reason_text
    where id = p_id;

  insert into public.moderation_log
    (entity_type, entity_id, action, previous_status, new_status, moderator_id, reason)
  values
    ('missing_person', p_id, 'quality_review', v_prev, p_quality_status, v_uid, p_reason_text);

  return jsonb_build_object('ok', true, 'id', p_id, 'quality_status', p_quality_status);
end; $$;
revoke execute on function public.coord_set_missing_quality(uuid, text, text) from anon, public;
grant execute on function public.coord_set_missing_quality(uuid, text, text) to authenticated;

-- Keep the merge/conflict desks focused on records already safe to publish.
create or replace function public.coord_missing_clusters(p_q text default null, p_limit int default 200)
returns table(
  id uuid, display_name text, age_estimate smallint, estado text, municipio text,
  status missing_status, source external_source, external_url text,
  cedula_masked text, cedula_present boolean, cluster_id uuid,
  possible_duplicate_ids uuid[], duplicate_of uuid, is_multi_person boolean,
  cedula_conflict boolean, photo_conflict boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select p.id, p.display_name, p.age_estimate, p.estado, p.municipio,
           p.status, p.source, p.external_url,
           case when p.cedula_normalized is not null
                then left(p.cedula_normalized, 1) || '•••' || right(p.cedula_normalized, 2) end,
           p.cedula_normalized is not null,
           p.cluster_id, p.possible_duplicate_ids, p.duplicate_of, p.is_multi_person,
           p.cedula_conflict, p.photo_conflict, p.created_at
    from public.missing_person_pins p
    where p.retracted_at is null
      and p.quality_status = 'accepted'
      and (coalesce(array_length(p.possible_duplicate_ids, 1), 0) > 0 or p.duplicate_of is not null)
      and (p_q is null or p.display_name ilike '%' || replace(p_q, '%', '') || '%')
    order by coalesce(array_length(p.possible_duplicate_ids, 1), 0) desc
    limit greatest(1, least(500, p_limit));
end; $$;
revoke execute on function public.coord_missing_clusters(text, int) from anon, public;
grant execute on function public.coord_missing_clusters(text, int) to authenticated;

create or replace function public.coord_missing_conflicts(p_limit int default 200)
returns table(
  id uuid, display_name text, age_estimate smallint, estado text, municipio text,
  status missing_status, source external_source, external_url text,
  cedula_masked text, conflict_kind text, possible_duplicate_ids uuid[], created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select p.id, p.display_name, p.age_estimate, p.estado, p.municipio,
           p.status, p.source, p.external_url,
           case when p.cedula_normalized is not null
                then left(p.cedula_normalized, 1) || '•••' || right(p.cedula_normalized, 2) end,
           case when p.cedula_conflict and p.photo_conflict then 'cedula+photo'
                when p.cedula_conflict then 'cedula' else 'photo' end,
           p.possible_duplicate_ids, p.created_at
    from public.missing_person_pins p
    where p.retracted_at is null and p.duplicate_of is null
      and p.quality_status = 'accepted'
      and (p.cedula_conflict or p.photo_conflict)
    order by p.created_at desc
    limit greatest(1, least(500, p_limit));
end; $$;
revoke execute on function public.coord_missing_conflicts(int) from anon, public;
grant execute on function public.coord_missing_conflicts(int) to authenticated;
