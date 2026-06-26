-- =====================================================================
-- Security hardening (addresses Supabase advisor findings).
-- The two SECURITY DEFINER public views are INTENTIONAL — they are the
-- privacy keystone (expose only fuzzed columns to the public). They are
-- safe by construction: they project no precise coordinates, address, or
-- contact fields. We keep them deliberately.
-- =====================================================================

-- Pin search_path on simple functions (they reference no app objects).
alter function public.fuzz_coord(double precision) set search_path = '';
alter function public.touch_updated_at() set search_path = '';

-- is_verified_responder is always called as is_verified_responder(auth.uid()):
-- a user checking their OWN responder row, which RLS already permits. So it
-- does not need SECURITY DEFINER. Drop the privilege surface.
alter function public.is_verified_responder(uuid) security invoker;
revoke execute on function public.is_verified_responder(uuid) from anon, public;
grant execute on function public.is_verified_responder(uuid) to authenticated;

-- Trigger function: must never be callable as an RPC.
revoke execute on function public.sync_building_from_assessment() from public, anon, authenticated;

-- Replace WITH CHECK (true) on public inserts with a Venezuela bounding box.
-- Keeps open crowdsourced reporting while rejecting obviously-bogus points.
drop policy buildings_insert_anyone on public.buildings;
create policy buildings_insert_anyone on public.buildings
  for insert to anon, authenticated
  with check (lat between 0 and 16 and lng between -74 and -59);

drop policy mpp_insert_anyone on public.missing_person_pins;
create policy mpp_insert_anyone on public.missing_person_pins
  for insert to anon, authenticated
  with check (
    (last_seen_lat is null or last_seen_lat between 0 and 16) and
    (last_seen_lng is null or last_seen_lng between -74 and -59)
  );

drop policy photos_insert_anyone on public.building_photos;
create policy photos_insert_anyone on public.building_photos
  for insert to anon, authenticated
  with check (building_id is not null);
