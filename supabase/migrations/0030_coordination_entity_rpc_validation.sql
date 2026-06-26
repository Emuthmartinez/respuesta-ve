-- =====================================================================
-- 0030 — Harden coordination entity validation after the initial graph
--        migration landed.
--
-- Postgres CHECK constraints treat UNKNOWN as passing, so the coordinate
-- constraint must explicitly require lat/lng to arrive as a pair. The RPC also
-- returns controlled validation errors for lng-only coordinates and nonpositive
-- need quantities instead of relying on table constraints.
-- =====================================================================

alter table public.coordination_entities
  drop constraint if exists coordination_entities_coords;

alter table public.coordination_entities
  add constraint coordination_entities_coords check (
    (lat is null and lng is null)
    or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coordination_needs_quantity_positive'
      and conrelid = 'public.coordination_entity_needs'::regclass
  ) then
    alter table public.coordination_entity_needs
      add constraint coordination_needs_quantity_positive check (quantity is null or quantity > 0);
  end if;
end $$;

create or replace function public.submit_coordination_entity(
  p_key_id uuid,
  p_key_hash text,
  p_external_record_id text,
  p_source_url text,
  p_entity_kind public.coordination_entity_kind,
  p_name text,
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
  k public.partner_api_keys%rowtype;
  v_record_id text := 'partner-' || p_key_id::text || ':' || nullif(trim(coalesce(p_external_record_id, '')), '');
  v_entity_id uuid;
  v_prev_source_updated_at timestamptz;
  v_existed boolean := false;
  v_status public.coordination_verification_status;
  v_action text := 'inserted';
  ch jsonb;
  nd jsonb;
  v_channel_status public.coordination_verification_status;
  v_need_expires_at timestamptz;
begin
  select * into k from public.partner_api_keys
    where id = p_key_id and key_hash = p_key_hash and enabled and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if not ('ingest' = any(k.scopes)) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_scope');
  end if;
  if v_record_id is null then
    return jsonb_build_object('ok', false, 'error', 'external_record_id_required');
  end if;
  if p_source_url is null or p_source_url !~* '^https?://' then
    return jsonb_build_object('ok', false, 'error', 'source_url_required');
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180)) then
    return jsonb_build_object('ok', false, 'error', 'bad_coords');
  end if;
  if p_channels is null or jsonb_typeof(p_channels) <> 'array' or jsonb_array_length(p_channels) > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_channels');
  end if;
  if p_needs is null or jsonb_typeof(p_needs) <> 'array' or jsonb_array_length(p_needs) > 50 then
    return jsonb_build_object('ok', false, 'error', 'invalid_needs');
  end if;

  for ch in select * from jsonb_array_elements(p_channels) loop
    if (ch->>'type') is null or (ch->>'type') not in ('donation_url','volunteer_form','supply_dropoff','website','phone_public','whatsapp_public','email_public','social','other') then
      return jsonb_build_object('ok', false, 'error', 'invalid_channel_type');
    end if;
    if nullif(trim(coalesce(ch->>'url', '')), '') is null and nullif(trim(coalesce(ch->>'displayText', '')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'channel_target_required');
    end if;
    if nullif(trim(coalesce(ch->>'url', '')), '') is not null and (ch->>'url') !~* '^https?://' then
      return jsonb_build_object('ok', false, 'error', 'bad_channel_url');
    end if;
    if ch ? 'isPrimary' and jsonb_typeof(ch->'isPrimary') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'invalid_channel_primary');
    end if;
  end loop;

  for nd in select * from jsonb_array_elements(p_needs) loop
    if (nd->>'category') is null or (nd->>'category') not in ('medical_supplies','beds','blood','water','food','shelter','volunteers','transport','fuel','power','communications','sanitation','funds','other') then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_category');
    end if;
    if nullif(trim(coalesce(nd->>'title', '')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'need_title_required');
    end if;
    if nullif(nd->>'urgency', '') is not null and (nd->>'urgency') not in ('critical','high','normal','low') then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_urgency');
    end if;
    if nullif(nd->>'status', '') is not null and (nd->>'status') not in ('open','in_progress','fulfilled','cancelled','expired') then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_status');
    end if;
    if nd ? 'quantity' and jsonb_typeof(nd->'quantity') <> 'number' then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_quantity');
    end if;
    if nd ? 'quantity' and (nd->>'quantity')::numeric <= 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_quantity');
    end if;
    if nd ? 'expiresAt' and jsonb_typeof(nd->'expiresAt') <> 'string' then
      return jsonb_build_object('ok', false, 'error', 'invalid_need_expires_at');
    end if;
    if nullif(nd->>'expiresAt', '') is not null then
      begin
        v_need_expires_at := (nd->>'expiresAt')::timestamptz;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_need_expires_at');
      end;
    end if;
  end loop;

  select id, source_updated_at into v_entity_id, v_prev_source_updated_at
    from public.coordination_entities where federated_record_id = v_record_id;
  v_existed := v_entity_id is not null;
  if v_entity_id is not null
     and (
       (v_prev_source_updated_at is not null and p_source_updated_at is null)
       or (v_prev_source_updated_at is not null and p_source_updated_at <= v_prev_source_updated_at)
     ) then
    return jsonb_build_object('ok', true, 'id', v_entity_id, 'action', 'stale_ignored');
  end if;

  v_status := case when k.entity_auto_verify then 'verified'::public.coordination_verification_status else 'needs_review'::public.coordination_verification_status end;

  insert into public.coordination_entities (
    source_key_id, federated_record_id, external_record_id, source, source_url,
    entity_kind, name, description, estado, municipio, lat, lng, address,
    verification_status, last_verified_at, source_updated_at, expires_at
  ) values (
    p_key_id, v_record_id, trim(p_external_record_id), k.ingest_source, p_source_url,
    p_entity_kind, trim(p_name), p_description, p_estado, p_municipio, p_lat, p_lng, p_address,
    v_status, case when v_status = 'verified' then now() else null end, p_source_updated_at,
    now() + interval '14 days'
  )
  on conflict (federated_record_id) do update set
    source = excluded.source,
    source_url = excluded.source_url,
    entity_kind = excluded.entity_kind,
    name = excluded.name,
    description = excluded.description,
    estado = excluded.estado,
    municipio = excluded.municipio,
    lat = excluded.lat,
    lng = excluded.lng,
    address = excluded.address,
    verification_status = case
      when coordination_entities.verification_status = 'verified' and not k.entity_auto_verify then coordination_entities.verification_status
      else excluded.verification_status
    end,
    last_verified_at = case
      when excluded.verification_status = 'verified' then coalesce(coordination_entities.last_verified_at, now())
      else coordination_entities.last_verified_at
    end,
    source_updated_at = excluded.source_updated_at,
    expires_at = now() + interval '14 days',
    updated_at = now()
  returning id into v_entity_id;
  if v_existed then
    v_action := 'updated';
  end if;

  v_channel_status := v_status;
  update public.coordination_entity_channels
    set verification_status = 'inactive', updated_at = now()
    where entity_id = v_entity_id;
  for ch in select * from jsonb_array_elements(p_channels) loop
    insert into public.coordination_entity_channels (
      entity_id, channel_type, label, url, display_text, instructions, is_primary,
      verification_status, source_updated_at
    ) values (
      v_entity_id,
      (ch->>'type')::public.contribution_channel_type,
      nullif(trim(coalesce(ch->>'label', '')), ''),
      nullif(trim(coalesce(ch->>'url', '')), ''),
      nullif(trim(coalesce(ch->>'displayText', '')), ''),
      nullif(trim(coalesce(ch->>'instructions', '')), ''),
      coalesce((nullif(ch->>'isPrimary', ''))::boolean, false),
      v_channel_status,
      p_source_updated_at
    );
  end loop;

  update public.coordination_entity_needs
    set status = 'cancelled', updated_at = now()
    where entity_id = v_entity_id and status in ('open','in_progress');
  for nd in select * from jsonb_array_elements(p_needs) loop
    v_need_expires_at := null;
    if nullif(nd->>'expiresAt', '') is not null then
      v_need_expires_at := (nd->>'expiresAt')::timestamptz;
    end if;
    insert into public.coordination_entity_needs (
      entity_id, need_category, title, description, urgency, status, quantity, unit,
      source_updated_at, expires_at
    ) values (
      v_entity_id,
      (nd->>'category')::public.coordination_need_category,
      trim(nd->>'title'),
      nullif(trim(coalesce(nd->>'description', '')), ''),
      coalesce((nullif(nd->>'urgency', ''))::request_urgency, 'normal'::request_urgency),
      coalesce((nullif(nd->>'status', ''))::public.coordination_need_status, 'open'::public.coordination_need_status),
      nullif(nd->>'quantity', '')::numeric,
      nullif(trim(coalesce(nd->>'unit', '')), ''),
      p_source_updated_at,
      coalesce(v_need_expires_at, now() + interval '7 days')
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'id', v_entity_id,
    'action', v_action,
    'verification_status', v_status,
    'channels', jsonb_array_length(p_channels),
    'needs', jsonb_array_length(p_needs)
  );
end; $$;

revoke execute on function public.submit_coordination_entity(
  uuid, text, text, text, public.coordination_entity_kind, text, text, text, text,
  double precision, double precision, text, timestamptz, jsonb, jsonb
) from public;
grant execute on function public.submit_coordination_entity(
  uuid, text, text, text, public.coordination_entity_kind, text, text, text, text,
  double precision, double precision, text, timestamptz, jsonb, jsonb
) to anon, authenticated;
