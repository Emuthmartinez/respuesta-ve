-- =====================================================================
-- 0037 — First-class audience/country fields for coordination entities.
--
-- Public intake already preserves outside-country resource context in the
-- restricted queue. This migration lets reviewed entities expose that context
-- through the canonical entity/search/change feeds.
-- =====================================================================

alter table public.coordination_entities
  add column if not exists audience_scope text,
  add column if not exists country_code text;

alter table public.coordination_entities
  drop constraint if exists coordination_entities_audience_scope;
alter table public.coordination_entities
  add constraint coordination_entities_audience_scope check (
    audience_scope is null
    or audience_scope in ('in_venezuela', 'outside_venezuela', 'both')
  );

alter table public.coordination_entities
  drop constraint if exists coordination_entities_country_code;
alter table public.coordination_entities
  add constraint coordination_entities_country_code check (
    country_code is null
    or country_code ~ '^[A-Z]{2}$'
  );

create index if not exists coordination_entities_audience_country_idx
  on public.coordination_entities (audience_scope, country_code);

create or replace view public.coordination_entities_public with (security_invoker = off) as
  select
    e.id,
    e.entity_kind,
    e.name,
    e.description,
    e.estado,
    e.municipio,
    public.fuzz_coord(e.lat) as lat,
    public.fuzz_coord(e.lng) as lng,
    e.source,
    e.source_url,
    e.last_verified_at,
    e.source_updated_at,
    e.created_at,
    e.updated_at,
    e.audience_scope,
    e.country_code
  from public.coordination_entities e
  where e.verification_status = 'verified'
    and e.expires_at > now();
grant select on public.coordination_entities_public to anon, authenticated;

create or replace function public.submit_coordination_entity(
  p_key_id uuid,
  p_key_hash text,
  p_external_record_id text,
  p_source_url text,
  p_entity_kind public.coordination_entity_kind,
  p_name text,
  p_audience_scope text,
  p_country_code text,
  p_description text default null,
  p_estado text default null,
  p_municipio text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address text default null,
  p_source_updated_at timestamptz default null,
  p_channels jsonb default '[]'::jsonb,
  p_needs jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
  v_entity_id uuid;
  v_audience_scope text := nullif(trim(coalesce(p_audience_scope, '')), '');
  v_country_code text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
begin
  if v_audience_scope is not null and v_audience_scope not in ('in_venezuela', 'outside_venezuela', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_audience_scope');
  end if;
  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_country_code');
  end if;

  v_result := public.submit_coordination_entity(
    p_key_id,
    p_key_hash,
    p_external_record_id,
    p_source_url,
    p_entity_kind,
    p_name,
    p_description,
    p_estado,
    p_municipio,
    p_lat,
    p_lng,
    p_address,
    p_source_updated_at,
    p_channels,
    p_needs
  );

  if coalesce((v_result->>'ok')::boolean, false)
     and v_result->>'id' is not null
     and coalesce(v_result->>'action', '') <> 'stale_ignored' then
    v_entity_id := (v_result->>'id')::uuid;
    update public.coordination_entities
      set audience_scope = v_audience_scope,
          country_code = v_country_code,
          updated_at = now()
      where id = v_entity_id;
  end if;

  return v_result;
end; $$;

revoke execute on function public.submit_coordination_entity(
  uuid, text, text, text, public.coordination_entity_kind, text, text, text, text,
  text, text, double precision, double precision, text, timestamptz, jsonb, jsonb
) from public;
grant execute on function public.submit_coordination_entity(
  uuid, text, text, text, public.coordination_entity_kind, text, text, text, text,
  text, text, double precision, double precision, text, timestamptz, jsonb, jsonb
) to anon, authenticated;
