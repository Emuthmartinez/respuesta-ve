-- =====================================================================
-- 0010 — Provisional placement axis  ("Reportes por confirmar" layer)
--
-- Adds a SECOND axis, orthogonal to moderation_status:
--   moderation_status = "should this report exist?"  (coordinator gate)
--   location_status    = "do we know WHERE to draw it?" (placement gate)
--
-- Leads scanned from social media (X/Twitter) name a building + locality
-- but carry NO precise coordinates. They are inserted snapped to the
-- LOCALITY CENTROID with location_status='provisional' and surface only in
-- the separate "Reportes por confirmar" layer (off by default). They
-- GRADUATE to 'confirmed' (default layer) when either:
--   (a) N=3 crowd confirmations agree AND their proposed coords converge
--       (<=150 m spread — a wrong pin on a rescue map is a life-safety bug,
--        so "3 people agree AND their coordinates cluster" > "3 clicks"), or
--   (b) one verified responder / coordinator confirms (instant, precise).
--
-- Graduation lives in an AUDITABLE RPC (not a DB trigger) so a human can
-- inspect it and, later, re-provisional a bad graduation.
--
-- Design pressure-tested via llm-council: Ushahidi orthogonal-axis model,
-- Waze-style IP dedup, convergence check, locality-centroid fuzz.
-- =====================================================================

-- ---- placement axis on buildings -----------------------------------
-- DEFAULT 'confirmed' so every EXISTING row (approved news_scrape + samples,
-- which already carry real coords) stays in the default map untouched.
alter table public.buildings
  add column location_status text not null default 'confirmed'
    check (location_status in ('provisional','confirmed')),
  add column location_radius_m integer,            -- placement uncertainty (m); null = precise
  add column location_confirmation_count integer not null default 0,
  add column located_at timestamptz,               -- when it graduated
  add column located_by uuid references auth.users(id);
create index buildings_location_status_idx on public.buildings (location_status);

comment on column public.buildings.location_status is
  'Placement axis, orthogonal to moderation_status. provisional = snapped to locality centroid, shown only in the "Por confirmar" layer; confirmed = placed, shown on the default map.';

-- ---- crowd / authoritative location confirmations ------------------
create table public.location_confirmations (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references public.buildings(id) on delete cascade,
  ip_hash       text,                              -- crowd dedup (null for responder/coordinator)
  confirmed_by  uuid references auth.users(id),    -- set for responder/coordinator path
  source_type   text not null default 'crowd'
                  check (source_type in ('crowd','responder','coordinator','authoritative')),
  proposed_lat  double precision not null,
  proposed_lng  double precision not null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (building_id, ip_hash)                    -- one crowd vote per IP per building
);
create index location_confirmations_building_idx on public.location_confirmations (building_id);

alter table public.location_confirmations enable row level security;
revoke all on public.location_confirmations from anon, authenticated;
-- Writes flow ONLY through confirm_building_location() (definer). Coordinators
-- read the audit trail; no direct anon/auth write grants.
grant select on public.location_confirmations to authenticated;
create policy location_confirmations_select_coordinator on public.location_confirmations
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- =====================================================================
-- PUBLIC VIEWS  ·  split default (confirmed) vs provisional layer
-- =====================================================================

-- ---- default layer: CONFIRMED placements only ----------------------
drop view if exists public.buildings_public;
create view public.buildings_public with (security_invoker = off) as
  select
    id,
    public.fuzz_coord(lat) as lat,
    public.fuzz_coord(lng) as lng,
    estado, municipio, parroquia,
    damage_level, people_status, inspection_status, official_placard,
    construction_type, floors_above_ground, occupancy_type,
    hazard_flags, collapse_mode, access_status,
    verified, corroboration_count,
    location_status, location_radius_m, location_confirmation_count,
    created_at, updated_at
  from public.buildings
  where duplicate_of is null
    and retracted_at is null
    and moderation_status = 'approved'
    and location_status   = 'confirmed';
grant select on public.buildings_public to anon, authenticated;

-- ---- provisional layer: "Reportes por confirmar" -------------------
-- Same fuzzing; coords are already locality-centroid, so these read as AREA
-- pins, not fake-precise building pins. Hidden by default in the UI.
create view public.buildings_provisional_public with (security_invoker = off) as
  select
    id,
    public.fuzz_coord(lat) as lat,
    public.fuzz_coord(lng) as lng,
    estado, municipio, parroquia,
    damage_level, people_status, inspection_status, official_placard,
    construction_type, floors_above_ground, occupancy_type,
    hazard_flags, collapse_mode, access_status,
    verified, corroboration_count,
    location_status, location_radius_m, location_confirmation_count,
    source_channel,
    created_at, updated_at
  from public.buildings
  where duplicate_of is null
    and retracted_at is null
    and moderation_status = 'approved'
    and location_status   = 'provisional';
grant select on public.buildings_provisional_public to anon, authenticated;

-- =====================================================================
-- GRADUATION RPC  ·  auditable, not a trigger
-- Called by /api/confirm-location (which hashes the client IP server-side).
-- =====================================================================
create or replace function public.confirm_building_location(
  p_building_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_ip_hash text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b        record;
  v_source text := 'crowd';
  n        int;
  c_lat    double precision;
  c_lng    double precision;
  max_m    double precision;
  graduate boolean := false;
  final_lat double precision;
  final_lng double precision;
begin
  -- bounds (Venezuela) — same envelope as submit_building_report
  if p_lat is null or p_lng is null
     or p_lat < 0 or p_lat > 16 or p_lng < -74 or p_lng > -59 then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  select id, moderation_status, location_status into b
    from public.buildings where id = p_building_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Only an APPROVED, still-PROVISIONAL pin can be confirmed. (Pending pins
  -- are invisible to the crowd, so this also closes the "confirm a hidden
  -- pin" hole.)
  if b.moderation_status <> 'approved' or b.location_status <> 'provisional' then
    return jsonb_build_object('ok', false, 'error', 'not_confirmable');
  end if;

  -- trust tier (anon -> auth.uid() is null -> both helpers return false)
  if public.is_responder_coordinator(auth.uid()) then v_source := 'coordinator';
  elsif public.is_verified_responder(auth.uid())  then v_source := 'responder';
  else v_source := 'crowd';
  end if;

  if v_source = 'crowd' and p_ip_hash is null then
    return jsonb_build_object('ok', false, 'error', 'ip_required');
  end if;

  insert into public.location_confirmations
    (building_id, ip_hash, confirmed_by, source_type, proposed_lat, proposed_lng, note)
  values
    (p_building_id,
     case when v_source = 'crowd' then p_ip_hash else null end,
     case when v_source = 'crowd' then null else auth.uid() end,
     v_source, p_lat, p_lng, p_note)
  on conflict (building_id, ip_hash) do update
     set proposed_lat = excluded.proposed_lat,
         proposed_lng = excluded.proposed_lng,
         created_at   = now();

  if v_source in ('coordinator','responder','authoritative') then
    -- trusted actor → instant graduation at their precise coords
    graduate := true;
    final_lat := p_lat;
    final_lng := p_lng;
  else
    -- crowd consensus: >=3 confirmations whose coords converge (<=150 m)
    select count(*), avg(proposed_lat), avg(proposed_lng)
      into n, c_lat, c_lng
      from public.location_confirmations
      where building_id = p_building_id and source_type = 'crowd';

    select coalesce(max(
             sqrt( power((proposed_lat - c_lat) * 111320, 2)
                 + power((proposed_lng - c_lng) * 111320 * cos(radians(c_lat)), 2) )
           ), 0)
      into max_m
      from public.location_confirmations
      where building_id = p_building_id and source_type = 'crowd';

    if n >= 3 and max_m <= 150 then
      graduate  := true;
      final_lat := c_lat;   -- consensus centroid
      final_lng := c_lng;
    end if;
  end if;

  if graduate then
    update public.buildings
       set lat = final_lat,
           lng = final_lng,
           location_status   = 'confirmed',
           location_radius_m = case when v_source = 'crowd' then 150 else 40 end,
           location_confirmation_count =
             (select count(*) from public.location_confirmations where building_id = p_building_id),
           located_at = now(),
           located_by = auth.uid(),
           updated_at = now()
     where id = p_building_id;
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'source', v_source);
  end if;

  update public.buildings
     set location_confirmation_count =
           (select count(*) from public.location_confirmations where building_id = p_building_id),
         updated_at = now()
   where id = p_building_id;

  select count(*) into n from public.location_confirmations
    where building_id = p_building_id and source_type = 'crowd';
  return jsonb_build_object('ok', true, 'status', 'provisional', 'confirmations', n, 'needed', 3);
end; $$;

revoke execute on function public.confirm_building_location(uuid,double precision,double precision,text,text) from public;
grant  execute on function public.confirm_building_location(uuid,double precision,double precision,text,text) to anon, authenticated;
