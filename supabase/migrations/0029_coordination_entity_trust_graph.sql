-- =====================================================================
-- 0029 — Federated coordination entities, needs, channels, and badges.
--
-- Missing-person status is only one stop in the tragedy journey. Hospitals,
-- clinics, shelters, supply hubs, organizations, and official contribution
-- channels also need a vetted shared source of truth. This migration adds an
-- additive graph for partner-fed entities with public-safe views and a badge
-- view for sites whose domains are verified by coordinators.
-- =====================================================================

create type public.coordination_entity_kind as enum (
  'hospital','clinic','field_clinic','shelter','donation_center','supply_hub',
  'pharmacy','water_point','official_channel','organization','community_group','other'
);

create type public.coordination_verification_status as enum (
  'needs_review','verified','inactive','rejected'
);

create type public.coordination_need_category as enum (
  'medical_supplies','beds','blood','water','food','shelter','volunteers',
  'transport','fuel','power','communications','sanitation','funds','other'
);

create type public.coordination_need_status as enum (
  'open','in_progress','fulfilled','cancelled','expired'
);

create type public.contribution_channel_type as enum (
  'donation_url','volunteer_form','supply_dropoff','website','phone_public',
  'whatsapp_public','email_public','social','other'
);

create type public.partner_badge_status as enum ('unverified','verified','suspended');

alter table public.partner_api_keys
  add column if not exists verified_domains text[] not null default '{}',
  add column if not exists badge_status public.partner_badge_status not null default 'unverified',
  add column if not exists badge_label text,
  add column if not exists badge_verified_at timestamptz,
  add column if not exists entity_auto_verify boolean not null default false;
create index if not exists partner_api_keys_verified_domains_idx
  on public.partner_api_keys using gin (verified_domains);

grant select (
  id, name, key_prefix, scopes, rate_limit_per_min, rate_limit_per_day, enabled,
  revoked_at, notes, created_at, last_used_at, ingest_source, verified_domains,
  badge_status, badge_label, badge_verified_at, entity_auto_verify
) on public.partner_api_keys to authenticated;

create table public.coordination_entities (
  id                  uuid primary key default gen_random_uuid(),
  source_key_id       uuid references public.partner_api_keys(id) on delete set null,
  federated_record_id text not null unique,
  external_record_id  text not null,
  source              external_source not null default 'other',
  source_url          text not null,
  entity_kind         public.coordination_entity_kind not null,
  name                text not null,
  description         text,
  estado              text,
  municipio           text,
  address             text,
  lat                 double precision,
  lng                 double precision,
  verification_status public.coordination_verification_status not null default 'needs_review',
  verification_notes  text,
  last_verified_at    timestamptz,
  source_updated_at   timestamptz,
  expires_at          timestamptz not null default (now() + interval '14 days'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint coordination_entities_name_len check (length(trim(name)) >= 2),
  constraint coordination_entities_coords check (
    (lat is null and lng is null)
    or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
  )
);
create index coordination_entities_kind_idx on public.coordination_entities (entity_kind);
create index coordination_entities_status_idx on public.coordination_entities (verification_status);
create index coordination_entities_updated_idx on public.coordination_entities (updated_at);
create index coordination_entities_source_key_idx on public.coordination_entities (source_key_id);
create trigger trg_coordination_entities_touch before update on public.coordination_entities
  for each row execute function public.touch_updated_at();

create table public.coordination_entity_channels (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references public.coordination_entities(id) on delete cascade,
  channel_type        public.contribution_channel_type not null,
  label               text,
  url                 text,
  display_text        text,
  instructions        text,
  is_primary          boolean not null default false,
  verification_status public.coordination_verification_status not null default 'needs_review',
  source_updated_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint coordination_channels_has_target check (url is not null or display_text is not null),
  constraint coordination_channels_public_url check (
    url is null or url ~* '^https?://'
  )
);
create index coordination_channels_entity_idx on public.coordination_entity_channels (entity_id);
create trigger trg_coordination_channels_touch before update on public.coordination_entity_channels
  for each row execute function public.touch_updated_at();

create table public.coordination_entity_needs (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references public.coordination_entities(id) on delete cascade,
  need_category     public.coordination_need_category not null default 'other',
  title             text not null,
  description       text,
  urgency           request_urgency not null default 'normal',
  status            public.coordination_need_status not null default 'open',
  quantity          numeric,
  unit              text,
  source_updated_at timestamptz,
  expires_at        timestamptz not null default (now() + interval '7 days'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint coordination_needs_title_len check (length(trim(title)) >= 2),
  constraint coordination_needs_quantity_positive check (quantity is null or quantity > 0)
);
create index coordination_needs_entity_idx on public.coordination_entity_needs (entity_id);
create index coordination_needs_updated_idx on public.coordination_entity_needs (updated_at);
create trigger trg_coordination_needs_touch before update on public.coordination_entity_needs
  for each row execute function public.touch_updated_at();

alter table public.coordination_entities enable row level security;
alter table public.coordination_entity_channels enable row level security;
alter table public.coordination_entity_needs enable row level security;
revoke all on public.coordination_entities from anon, authenticated;
revoke all on public.coordination_entity_channels from anon, authenticated;
revoke all on public.coordination_entity_needs from anon, authenticated;
grant select on public.coordination_entities to authenticated;
grant select on public.coordination_entity_channels to authenticated;
grant select on public.coordination_entity_needs to authenticated;
create policy coordination_entities_coord_select on public.coordination_entities
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));
create policy coordination_channels_coord_select on public.coordination_entity_channels
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));
create policy coordination_needs_coord_select on public.coordination_entity_needs
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));

create view public.coordination_entities_public with (security_invoker = off) as
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
    e.updated_at
  from public.coordination_entities e
  where e.verification_status = 'verified'
    and e.expires_at > now();
grant select on public.coordination_entities_public to anon, authenticated;

create view public.coordination_entity_channels_public with (security_invoker = off) as
  select
    c.id,
    c.entity_id,
    c.channel_type,
    c.label,
    c.url,
    c.display_text,
    c.instructions,
    c.is_primary,
    c.source_updated_at,
    c.created_at,
    c.updated_at
  from public.coordination_entity_channels c
  join public.coordination_entities e on e.id = c.entity_id
  where e.verification_status = 'verified'
    and e.expires_at > now()
    and c.verification_status = 'verified';
grant select on public.coordination_entity_channels_public to anon, authenticated;

create view public.coordination_entity_needs_public with (security_invoker = off) as
  select
    n.id,
    n.entity_id,
    n.need_category,
    n.title,
    n.description,
    n.urgency,
    n.status,
    n.quantity,
    n.unit,
    n.source_updated_at,
    n.expires_at,
    n.created_at,
    n.updated_at
  from public.coordination_entity_needs n
  join public.coordination_entities e on e.id = n.entity_id
  where e.verification_status = 'verified'
    and e.expires_at > now()
    and n.status in ('open','in_progress')
    and n.expires_at > now();
grant select on public.coordination_entity_needs_public to anon, authenticated;

create view public.partner_badges_public with (security_invoker = off) as
  select
    name,
    ingest_source as source,
    verified_domains,
    coalesce(badge_label, name) as badge_label,
    badge_verified_at
  from public.partner_api_keys
  where enabled
    and revoked_at is null
    and badge_status = 'verified'
    and cardinality(verified_domains) > 0;
grant select on public.partner_badges_public to anon, authenticated;

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

create or replace function public.verify_coordination_entity(
  p_entity uuid,
  p_status public.coordination_verification_status default 'verified',
  p_notes text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.coordination_entities
    set verification_status = p_status,
        verification_notes = p_notes,
        last_verified_at = case when p_status = 'verified' then now() else last_verified_at end,
        updated_at = now()
    where id = p_entity;
  get diagnostics c = row_count;
  if c > 0 then
    update public.coordination_entity_channels
      set verification_status = p_status, updated_at = now()
      where entity_id = p_entity and verification_status <> 'inactive';
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
      values ('coordination_entity', p_entity, 'verify', p_status::text, auth.uid(), p_notes);
  end if;
  return c > 0;
end; $$;
revoke execute on function public.verify_coordination_entity(uuid, public.coordination_verification_status, text) from public, anon;
grant execute on function public.verify_coordination_entity(uuid, public.coordination_verification_status, text) to authenticated;
