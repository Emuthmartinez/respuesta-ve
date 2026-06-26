-- =====================================================================
-- 0003 — Building moderation gate, abuse controls, and citizen fields.
-- Derived from the research+critique pass. P0 launch-blockers:
--   * moderation_status gate on buildings_public (no anon insert is public
--     until approved)
--   * community flagging with auto-quarantine
--   * append-only moderation audit log
--   * rate-limited server-side submission RPC
--   * storage-path injection guard on building_photos
-- =====================================================================

-- ---- moderation + abuse columns ------------------------------------
create type report_moderation_status as enum
  ('pending','approved','flagged','rejected_spam','rejected_duplicate','rejected_abusive','archived');

alter table public.buildings
  add column moderation_status report_moderation_status not null default 'pending',
  add column is_sample_data    boolean not null default false,
  add column corroboration_count integer not null default 1,
  add column flagged_count     integer not null default 0,
  add column retracted_at      timestamptz,
  add column retracted_by      uuid references auth.users(id),
  add column retraction_reason text,
  add column moderated_by      uuid references auth.users(id),
  add column moderated_at      timestamptz,
  add column moderation_reason text;
create index buildings_moderation_idx on public.buildings (moderation_status);

-- ---- citizen-reportable damage fields (what a non-engineer can see) --
alter table public.buildings
  add column construction_type        text,
  add column construction_era         text,   -- COVENIN era: pre_1967 / 1967_2001 / 2001_2019 / post_2019 / unknown
  add column floors_above_ground      smallint,
  add column occupancy_type           text,
  add column hazard_flags             text[],
  add column people_trapped_evidence  text,   -- none/sounds_heard/visual/communication/unknown
  add column last_contact_time        timestamptz,
  add column collapse_mode            text,   -- INSARAG: none/partial_floor/pancake/soft_story/facade/lean/roof_only
  add column access_status            text,
  add column evacuated                boolean,
  add column estimated_occupants_at_time integer,
  add column utilities_cut            text[],
  add column landmark_description     text,
  add column source_channel           text not null default 'web_form',
  add column offline_sync_id          text unique;  -- PWA background-sync idempotency key

-- ---- rebuild public view WITH the moderation + retraction gate ------
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
    verified, corroboration_count, created_at, updated_at
  from public.buildings
  where duplicate_of is null
    and retracted_at is null
    and moderation_status = 'approved';
grant select on public.buildings_public to anon, authenticated;

-- Approve the seed sample rows so the dev map is populated for testing,
-- but flag them so they are trivially purged before launch.
update public.buildings
  set moderation_status = 'approved', is_sample_data = true
  where description like '[MUESTRA]%';

create or replace function public.assert_no_sample_data() returns void
  language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.buildings where is_sample_data) then
    raise exception 'Sample data still present — run: delete from public.buildings where is_sample_data;';
  end if;
end; $$;

-- ---- community flagging + auto-quarantine ---------------------------
create type flag_reason as enum ('spam','duplicate','inaccurate','abusive','out_of_area','other');
create table public.report_flags (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references public.buildings(id) on delete cascade,
  flagged_by_uid uuid references auth.users(id) default auth.uid(),
  reason         flag_reason not null default 'other',
  notes          text,
  created_at     timestamptz not null default now()
);
create index report_flags_building_idx on public.report_flags (building_id);

create or replace function public.increment_building_flag_count() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.buildings
    set flagged_count = flagged_count + 1,
        moderation_status = case
          when flagged_count + 1 >= 3 and moderation_status = 'approved' then 'flagged'
          else moderation_status end
  where id = new.building_id;
  return new;
end; $$;
create trigger trg_report_flag_count after insert on public.report_flags
  for each row execute function public.increment_building_flag_count();
revoke execute on function public.increment_building_flag_count() from public, anon, authenticated;

alter table public.report_flags enable row level security;
revoke all on public.report_flags from anon, authenticated;
grant insert (building_id, reason, notes) on public.report_flags to anon, authenticated;
create policy report_flags_insert_anyone on public.report_flags
  for insert to anon, authenticated with check (true);
-- No SELECT grant: only the service role / moderator dashboard reads flags.

-- ---- append-only moderation audit log -------------------------------
create table public.moderation_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     uuid not null,
  action        text not null,
  previous_status text,
  new_status    text,
  moderator_id  uuid references auth.users(id) default auth.uid(),
  reason        text,
  created_at    timestamptz not null default now()
);
alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;
grant insert (entity_type, entity_id, action, previous_status, new_status, reason)
  on public.moderation_log to authenticated;
create policy moderation_log_insert_responder on public.moderation_log
  for insert to authenticated with check (public.is_verified_responder(auth.uid()));
-- Append-only by design: no UPDATE/DELETE policy exists.

-- ---- building_photos: path-injection guard + moderation ------------
alter table public.building_photos
  add constraint building_photos_path_check check (storage_path like 'building-photos/%'),
  add column moderation_status report_moderation_status not null default 'pending';

-- ---- rate-limited server-side submission ----------------------------
create table public.submission_throttle (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  kind       text not null default 'building_report',
  created_at timestamptz not null default now()
);
create index submission_throttle_lookup on public.submission_throttle (ip_hash, kind, created_at);

-- Called by the /api/report route (which hashes the client IP server-side).
-- SECURITY DEFINER so it can enforce moderation_status + read the throttle
-- table the public cannot see. Returns a small JSON result.
create or replace function public.submit_building_report(
  p_ip_hash text,
  p_lat double precision, p_lng double precision,
  p_estado text default null, p_municipio text default null, p_parroquia text default null,
  p_address text default null, p_description text default null,
  p_damage_level damage_level default 'unknown', p_people_status people_status default 'unknown',
  p_people_count_estimate int default null, p_reporter_contact text default null,
  p_construction_type text default null, p_floors smallint default null,
  p_occupancy_type text default null, p_hazard_flags text[] default null,
  p_collapse_mode text default null, p_access_status text default null,
  p_evacuated boolean default null, p_landmark text default null,
  p_source_channel text default 'web_form'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recent_count int;
  new_id uuid;
begin
  if p_lat is null or p_lng is null
     or p_lat < 0 or p_lat > 16 or p_lng < -74 or p_lng > -59 then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  select count(*) into recent_count from public.submission_throttle
    where ip_hash = p_ip_hash and kind = 'building_report'
      and created_at > now() - interval '1 hour';
  if recent_count >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.buildings (
    lat, lng, estado, municipio, parroquia, address, description,
    damage_level, people_status, people_count_estimate, reporter_contact,
    construction_type, floors_above_ground, occupancy_type, hazard_flags,
    collapse_mode, access_status, evacuated, landmark_description,
    source_channel, moderation_status
  ) values (
    p_lat, p_lng, p_estado, p_municipio, p_parroquia, p_address, p_description,
    coalesce(p_damage_level,'unknown'), coalesce(p_people_status,'unknown'),
    p_people_count_estimate, p_reporter_contact,
    p_construction_type, p_floors, p_occupancy_type, p_hazard_flags,
    p_collapse_mode, p_access_status, p_evacuated, p_landmark,
    coalesce(p_source_channel,'web_form'), 'pending'
  ) returning id into new_id;

  insert into public.submission_throttle (ip_hash, kind) values (p_ip_hash, 'building_report');
  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end; $$;
revoke execute on function public.submit_building_report from public;
grant execute on function public.submit_building_report to anon, authenticated;
