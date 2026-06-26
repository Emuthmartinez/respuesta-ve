-- =====================================================================
-- 0008 — Lock down which responder columns a user may self-set (prevents
-- self-verification), and add the coordinator moderation RPC.
-- =====================================================================

-- A registrant may set only profile fields — never verification/tier/etc.
revoke insert, update on public.responders from authenticated;

grant insert (
  id, full_name, credential_type, credential_number, credential_issuing_body,
  organization, phone, whatsapp_number, cedula_identidad, current_estado,
  operating_estado, specialty, activation_code,
  credential_doc_path, credential_doc_secondary_path, selfie_with_doc_path
) on public.responders to authenticated;

grant update (
  full_name, credential_number, credential_issuing_body, organization, phone,
  whatsapp_number, current_estado, operating_estado, specialty, available,
  credential_doc_path, credential_doc_secondary_path, selfie_with_doc_path
) on public.responders to authenticated;

-- Coordinator approves/rejects building reports (the moderation gate's input).
create or replace function public.moderate_building(
  p_building uuid, p_status report_moderation_status, p_reason text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_responder_coordinator(auth.uid()) then return false; end if;
  update public.buildings
    set moderation_status = p_status, moderated_by = auth.uid(),
        moderated_at = now(), moderation_reason = p_reason, updated_at = now()
    where id = p_building;
  get diagnostics c = row_count;
  if c > 0 then
    insert into public.moderation_log (entity_type, entity_id, action, new_status, moderator_id, reason)
      values ('building', p_building, 'moderate', p_status::text, auth.uid(), p_reason);
  end if;
  return c > 0;
end; $$;
revoke execute on function public.moderate_building(uuid, report_moderation_status, text) from public, anon;
grant execute on function public.moderate_building(uuid, report_moderation_status, text) to authenticated;
