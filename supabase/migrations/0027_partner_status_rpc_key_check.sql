-- =====================================================================
-- 0027 — Require partner-key proof for direct status RPC reads.
--
-- The API route already authenticates and rate-limits partner keys before
-- calling this RPC. Because the RPC must be executable with the anon Supabase
-- key, also require the route to pass the SHA-256 key hash so direct callers
-- cannot probe status rows with only a key UUID and external record id.
-- =====================================================================

drop function if exists public.partner_missing_person_status(uuid, text);

create or replace function public.partner_missing_person_status(
  p_key_id uuid,
  p_key_hash text,
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

  if not exists (
    select 1
    from public.partner_api_keys k
    where k.id = p_key_id
      and k.key_hash = p_key_hash
      and k.enabled
      and k.revoked_at is null
      and 'search' = any(k.scopes)
  ) then
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

revoke execute on function public.partner_missing_person_status(uuid, text, text) from public;
grant execute on function public.partner_missing_person_status(uuid, text, text) to anon, authenticated;
