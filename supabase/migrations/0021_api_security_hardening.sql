-- =====================================================================
-- 0019 — Security hardening for the partner API (red-team fixes).
--
-- (1) CRITICAL: the federation throttle bypass in submit_missing_person_record
--     keyed on a CALLER-SUPPLIED string prefix ('federation-%'), so any holder
--     of the public anon key could bypass the 500/hr cap and mass-write. Replace
--     it with a SECRET token only trusted server code knows (stored in a table
--     anon/auth cannot read). Anon now hits the normal 500/hr cap.
-- (2) CRITICAL: partners could impersonate a known registry (source enum) and
--     collide on idempotency keys. Add a per-key ingest_source the coordinator
--     sets; the route uses it (never partner-supplied) and namespaces records by
--     key id (done in the route).
-- =====================================================================

-- ---- secret bypass token (server-only) -------------------------------
create table if not exists public.internal_config (
  name  text primary key,
  value text not null
);
alter table public.internal_config enable row level security;
revoke all on public.internal_config from anon, authenticated;
insert into public.internal_config (name, value)
  values ('federation_bypass_token', 'fbt_' || encode(gen_random_bytes(24), 'hex'))
  on conflict (name) do nothing;

-- ---- per-key ingest attribution (anti-impersonation) -----------------
alter table public.partner_api_keys
  add column if not exists ingest_source external_source not null default 'other';

-- ---- verify_api_key: also return the key's ingest_source -------------
create or replace function public.verify_api_key(p_key_hash text, p_scope text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k            public.partner_api_keys%rowtype;
  v_min_bucket text := 'min:' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
  v_day_bucket text := 'day:' || to_char(current_date, 'YYYYMMDD');
  v_min_count  int;
  v_day_count  int;
begin
  select * into k from public.partner_api_keys
    where key_hash = p_key_hash and enabled and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if p_scope is not null and not (p_scope = any (k.scopes)) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_scope');
  end if;
  insert into public.api_rate_counters (api_key_id, bucket, count, expires_at)
    values (k.id, v_min_bucket, 1, now() + interval '2 minutes')
    on conflict (api_key_id, bucket) do update set count = api_rate_counters.count + 1
    returning count into v_min_count;
  if v_min_count > k.rate_limit_per_min then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'scope', 'minute', 'limit', k.rate_limit_per_min, 'retry_after', 60);
  end if;
  insert into public.api_rate_counters (api_key_id, bucket, count, expires_at)
    values (k.id, v_day_bucket, 1, (current_date + 2) :: timestamptz)
    on conflict (api_key_id, bucket) do update set count = api_rate_counters.count + 1
    returning count into v_day_count;
  if v_day_count > k.rate_limit_per_day then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'scope', 'day', 'limit', k.rate_limit_per_day, 'retry_after', 3600);
  end if;
  update public.partner_api_keys set last_used_at = now() where id = k.id;
  delete from public.api_rate_counters where expires_at < now();
  return jsonb_build_object('ok', true, 'key_id', k.id, 'name', k.name, 'scopes', k.scopes,
    'ingest_source', k.ingest_source,
    'remaining_min', greatest(0, k.rate_limit_per_min - v_min_count),
    'remaining_day', greatest(0, k.rate_limit_per_day - v_day_count));
end; $$;
revoke execute on function public.verify_api_key(text, text) from public;
grant execute on function public.verify_api_key(text, text) to anon, authenticated;

-- ---- issue_api_key: accept ingest_source -----------------------------
create or replace function public.issue_api_key(
  p_name text, p_key_hash text, p_key_prefix text,
  p_scopes text[] default '{score,match,search}',
  p_rate_per_min int default 60, p_rate_per_day int default 5000, p_notes text default null,
  p_ingest_source external_source default 'other'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  insert into public.partner_api_keys (name, key_hash, key_prefix, scopes, rate_limit_per_min, rate_limit_per_day, notes, ingest_source)
    values (p_name, p_key_hash, p_key_prefix, coalesce(p_scopes,'{score,match,search}'),
            coalesce(p_rate_per_min,60), coalesce(p_rate_per_day,5000), p_notes, coalesce(p_ingest_source,'other'))
    returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end; $$;
revoke execute on function public.issue_api_key(text, text, text, text[], int, int, text, external_source) from anon, public;
grant execute on function public.issue_api_key(text, text, text, text[], int, int, text, external_source) to authenticated;

-- ---- submit_missing_person_record: SECRET-token throttle bypass ------
-- Only the change vs 0017: the bypass now requires the server secret (matched
-- against internal_config) instead of a guessable 'federation-%' prefix.
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
  v_bypass     text;
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

  -- SECRET bypass: only trusted server code knows this token (anon cannot read
  -- internal_config). Everyone else gets the 500/hr cap.
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
