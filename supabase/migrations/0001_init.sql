-- =====================================================================
-- Plataforma de Respuesta — Terremoto Venezuela 2026
-- Unified schema: damage map · building inspections · responder
-- verification · federated missing-person pins.
--
-- PRIVACY MODEL (decided with the team):
--   * Precise lat/lng are stored on the base tables.
--   * The PUBLIC only ever reads *_public VIEWS, which fuzz coordinates
--     to ~block level via public.fuzz_coord().
--   * Precise coordinates are readable ONLY by VERIFIED responders
--     (and the service role for moderation/imports).
--
-- v1 uses plain lat/lng doubles (no PostGIS) for maximum portability.
-- Spatial radius/correlation features will add PostGIS in a later migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type damage_level as enum (
  'unknown', 'no_visible_damage', 'minor', 'moderate', 'severe', 'collapsed'
);
create type placard as enum (
  'none', 'green_inspected', 'yellow_restricted', 'red_unsafe'
);
create type people_status as enum (
  'unknown', 'none_reported', 'possible', 'confirmed_trapped'
);
create type inspection_status as enum (
  'not_requested', 'requested', 'claimed', 'assessed'
);
create type responder_credential as enum (
  'structural_engineer', 'civil_engineer', 'architect',
  'search_and_rescue', 'medical', 'firefighter', 'civil_protection', 'other'
);
create type verification_status as enum ('pending', 'verified', 'rejected');
create type missing_status as enum (
  'missing', 'found_safe', 'found_injured', 'deceased', 'unknown'
);
create type external_source as enum (
  'internal', 'venezuelatebusca', 'google_person_finder', 'other'
);

-- ---------------------------------------------------------------------
-- Privacy keystone: coordinate fuzzing (~110 m). Pure arithmetic — no
-- PostGIS — so it resolves for every role. Increase decimals for more
-- precision, decrease for more privacy.  POLICY KNOB.
-- ---------------------------------------------------------------------
create or replace function public.fuzz_coord(c double precision)
returns double precision language sql immutable as $$
  select round(c::numeric, 3)::double precision;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---------------------------------------------------------------------
-- responders  ·  1:1 with auth.users
-- ---------------------------------------------------------------------
create table public.responders (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  credential_type     responder_credential not null,
  credential_number   text,
  organization        text,
  phone               text,
  verification        verification_status not null default 'pending',
  credential_doc_path text,
  verified_by         uuid references auth.users(id),
  verified_at         timestamptz,
  created_at          timestamptz not null default now()
);

create or replace function public.is_verified_responder(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.responders r
    where r.id = uid and r.verification = 'verified'
  );
$$;

-- ---------------------------------------------------------------------
-- buildings  ·  core of the damage map + inspection coordination
-- ---------------------------------------------------------------------
create table public.buildings (
  id                uuid primary key default gen_random_uuid(),
  lat               double precision not null,   -- PRECISE (responder-only)
  lng               double precision not null,
  estado            text,
  municipio         text,
  parroquia         text,
  address           text,
  description       text,
  damage_level      damage_level  not null default 'unknown',
  people_status     people_status not null default 'unknown',
  people_count_estimate int,
  inspection_status inspection_status not null default 'not_requested',
  official_placard  placard not null default 'none',
  reported_by       uuid references auth.users(id) on delete set null,
  reporter_contact  text,                        -- PRIVATE
  verified          boolean not null default false,
  duplicate_of      uuid references public.buildings(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index buildings_estado_idx on public.buildings (estado);
create index buildings_damage_idx on public.buildings (damage_level);
create index buildings_people_idx on public.buildings (people_status);
create index buildings_latlng_idx on public.buildings (lat, lng);
create trigger trg_buildings_touch before update on public.buildings
  for each row execute function public.touch_updated_at();

create table public.building_photos (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index building_photos_building_idx on public.building_photos (building_id);

-- ---------------------------------------------------------------------
-- assessments  ·  authored only by VERIFIED responders
-- ---------------------------------------------------------------------
create table public.assessments (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references public.buildings(id) on delete cascade,
  responder_id     uuid not null references public.responders(id),
  placard          placard not null,
  safe_to_enter    boolean,
  structural_notes text,
  created_at       timestamptz not null default now()
);
create index assessments_building_idx on public.assessments (building_id);

create or replace function public.sync_building_from_assessment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.buildings
    set official_placard = new.placard,
        inspection_status = 'assessed',
        updated_at = now()
  where id = new.building_id;
  return new;
end;
$$;
create trigger trg_sync_building_assessment after insert on public.assessments
  for each row execute function public.sync_building_from_assessment();

-- ---------------------------------------------------------------------
-- missing_person_pins  ·  FEDERATED (we link out, we don't own the registry)
-- ---------------------------------------------------------------------
create table public.missing_person_pins (
  id                uuid primary key default gen_random_uuid(),
  display_name      text,
  last_seen_lat     double precision,
  last_seen_lng     double precision,
  last_seen_at      timestamptz,
  estado            text,
  municipio         text,
  status            missing_status not null default 'missing',
  source            external_source not null default 'internal',
  external_url      text,
  photo_url         text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_mpp_touch before update on public.missing_person_pins
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- PUBLIC VIEWS  ·  fuzzed projections (definer views bypass base RLS)
-- =====================================================================
create view public.buildings_public with (security_invoker = off) as
  select
    id,
    public.fuzz_coord(lat) as lat,
    public.fuzz_coord(lng) as lng,
    estado, municipio, parroquia,
    damage_level, people_status, inspection_status, official_placard,
    verified, created_at, updated_at
  from public.buildings
  where duplicate_of is null;

create view public.missing_person_pins_public with (security_invoker = off) as
  select
    id, display_name,
    public.fuzz_coord(last_seen_lat) as lat,
    public.fuzz_coord(last_seen_lng) as lng,
    estado, municipio, status, source, external_url, photo_url,
    last_seen_at, created_at
  from public.missing_person_pins;

-- =====================================================================
-- ROW LEVEL SECURITY + GRANTS
-- =====================================================================
alter table public.buildings           enable row level security;
alter table public.building_photos      enable row level security;
alter table public.responders           enable row level security;
alter table public.assessments          enable row level security;
alter table public.missing_person_pins  enable row level security;

-- ---- buildings ------------------------------------------------------
revoke all on public.buildings from anon, authenticated;
grant insert (lat, lng, estado, municipio, parroquia, address, description,
              damage_level, people_status, people_count_estimate, reporter_contact)
  on public.buildings to anon, authenticated;
grant select on public.buildings to authenticated;
grant update (inspection_status, people_status, verified) on public.buildings to authenticated;

create policy buildings_insert_anyone on public.buildings
  for insert to anon, authenticated with check (true);
create policy buildings_select_responders on public.buildings
  for select to authenticated using (public.is_verified_responder(auth.uid()));
create policy buildings_update_responders on public.buildings
  for update to authenticated
  using (public.is_verified_responder(auth.uid()))
  with check (public.is_verified_responder(auth.uid()));

-- ---- public views ---------------------------------------------------
grant select on public.buildings_public           to anon, authenticated;
grant select on public.missing_person_pins_public to anon, authenticated;

-- ---- missing_person_pins -------------------------------------------
revoke all on public.missing_person_pins from anon, authenticated;
grant insert (display_name, last_seen_lat, last_seen_lng, last_seen_at, estado,
              municipio, status, source, external_url, photo_url, notes)
  on public.missing_person_pins to anon, authenticated;
create policy mpp_insert_anyone on public.missing_person_pins
  for insert to anon, authenticated with check (true);

-- ---- building_photos -----------------------------------------------
revoke all on public.building_photos from anon, authenticated;
grant insert (building_id, storage_path) on public.building_photos to anon, authenticated;
grant select on public.building_photos to authenticated;
create policy photos_insert_anyone on public.building_photos
  for insert to anon, authenticated with check (true);
create policy photos_select_responders on public.building_photos
  for select to authenticated using (public.is_verified_responder(auth.uid()));

-- ---- responders -----------------------------------------------------
grant select, insert, update on public.responders to authenticated;
create policy responders_self_select on public.responders
  for select to authenticated using (id = auth.uid());
create policy responders_self_insert on public.responders
  for insert to authenticated with check (id = auth.uid());
create policy responders_self_update on public.responders
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---- assessments ----------------------------------------------------
grant select, insert on public.assessments to authenticated;
create policy assessments_insert_verified on public.assessments
  for insert to authenticated
  with check (public.is_verified_responder(auth.uid()) and responder_id = auth.uid());
create policy assessments_select_responders on public.assessments
  for select to authenticated using (public.is_verified_responder(auth.uid()));

-- =====================================================================
-- STORAGE BUCKETS (private)
-- =====================================================================
insert into storage.buckets (id, name, public)
  values ('building-photos', 'building-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('responder-docs', 'responder-docs', false) on conflict (id) do nothing;

-- =====================================================================
-- SAMPLE ROWS  ·  clearly marked, DELETE before going public:
--   delete from public.buildings where description like '[MUESTRA]%';
-- =====================================================================
insert into public.buildings (lat, lng, estado, municipio, parroquia, damage_level, people_status, inspection_status, official_placard, verified, description) values
  (10.602, -66.933, 'La Guaira', 'Vargas', 'Maiquetía', 'collapsed', 'confirmed_trapped', 'requested', 'none', true, '[MUESTRA] edificio residencial'),
  (10.613, -66.916, 'La Guaira', 'Vargas', 'Playa Grande', 'severe', 'possible', 'requested', 'none', true, '[MUESTRA] torre de apartamentos'),
  (10.506, -66.914, 'Distrito Capital', 'Libertador', 'El Recreo', 'moderate', 'none_reported', 'claimed', 'yellow_restricted', true, '[MUESTRA] oficina'),
  (10.491, -66.853, 'Miranda', 'Sucre', 'Petare', 'minor', 'none_reported', 'not_requested', 'none', false, '[MUESTRA] vivienda'),
  (10.234, -67.595, 'Aragua', 'Girardot', 'Maracay', 'severe', 'possible', 'requested', 'red_unsafe', true, '[MUESTRA] centro comercial'),
  (10.171, -68.005, 'Carabobo', 'Valencia', 'San José', 'moderate', 'unknown', 'not_requested', 'none', false, '[MUESTRA] escuela');
