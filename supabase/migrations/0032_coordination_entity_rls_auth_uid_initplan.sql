-- =====================================================================
-- 0032 — Wrap auth.uid() itself in coordination RLS initplans.
-- =====================================================================

drop policy if exists coordination_entities_coord_select on public.coordination_entities;
drop policy if exists coordination_channels_coord_select on public.coordination_entity_channels;
drop policy if exists coordination_needs_coord_select on public.coordination_entity_needs;

create policy coordination_entities_coord_select on public.coordination_entities
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));

create policy coordination_channels_coord_select on public.coordination_entity_channels
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));

create policy coordination_needs_coord_select on public.coordination_entity_needs
  for select to authenticated using ((select public.is_responder_coordinator((select auth.uid()))));
