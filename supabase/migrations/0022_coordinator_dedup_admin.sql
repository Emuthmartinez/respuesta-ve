-- =====================================================================
-- 0022 — Coordinator surfaces for the missing-person dedup desk + the
--        partner-API key admin. The base table missing_person_pins is
--        locked from authenticated, so coordinators read management data
--        through these SECURITY DEFINER, coordinator-gated RPCs (cédula
--        masked, reporter contact / coords never exposed). Merge/split/undo
--        write paths already exist (set_duplicate_of, clear_duplicate_of,
--        split_cluster in 0017).
-- =====================================================================

-- ---- coordinator: clustered records for review ------------------------
create or replace function public.coord_missing_clusters(p_q text default null, p_limit int default 200)
returns table(
  id uuid, display_name text, age_estimate smallint, estado text, municipio text,
  status missing_status, source external_source, external_url text,
  cedula_masked text, cedula_present boolean, cluster_id uuid,
  possible_duplicate_ids uuid[], duplicate_of uuid, is_multi_person boolean,
  cedula_conflict boolean, photo_conflict boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select p.id, p.display_name, p.age_estimate, p.estado, p.municipio,
           p.status, p.source, p.external_url,
           case when p.cedula_normalized is not null
                then left(p.cedula_normalized, 1) || '•••' || right(p.cedula_normalized, 2) end,
           p.cedula_normalized is not null,
           p.cluster_id, p.possible_duplicate_ids, p.duplicate_of, p.is_multi_person,
           p.cedula_conflict, p.photo_conflict, p.created_at
    from public.missing_person_pins p
    where p.retracted_at is null
      and (coalesce(array_length(p.possible_duplicate_ids, 1), 0) > 0 or p.duplicate_of is not null)
      and (p_q is null or p.display_name ilike '%' || replace(p_q, '%', '') || '%')
    order by coalesce(array_length(p.possible_duplicate_ids, 1), 0) desc
    limit greatest(1, least(500, p_limit));
end; $$;
revoke execute on function public.coord_missing_clusters(text, int) from anon, public;
grant execute on function public.coord_missing_clusters(text, int) to authenticated;

-- ---- coordinator: cédula / photo conflict review queue ----------------
create or replace function public.coord_missing_conflicts(p_limit int default 200)
returns table(
  id uuid, display_name text, age_estimate smallint, estado text, municipio text,
  status missing_status, source external_source, external_url text,
  cedula_masked text, conflict_kind text, possible_duplicate_ids uuid[], created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select p.id, p.display_name, p.age_estimate, p.estado, p.municipio,
           p.status, p.source, p.external_url,
           case when p.cedula_normalized is not null
                then left(p.cedula_normalized, 1) || '•••' || right(p.cedula_normalized, 2) end,
           case when p.cedula_conflict and p.photo_conflict then 'cedula+photo'
                when p.cedula_conflict then 'cedula' else 'photo' end,
           p.possible_duplicate_ids, p.created_at
    from public.missing_person_pins p
    where p.retracted_at is null and p.duplicate_of is null
      and (p.cedula_conflict or p.photo_conflict)
    order by p.created_at desc
    limit greatest(1, least(500, p_limit));
end; $$;
revoke execute on function public.coord_missing_conflicts(int) from anon, public;
grant execute on function public.coord_missing_conflicts(int) to authenticated;

-- ---- coordinator: dismiss a conflict flag -----------------------------
create or replace function public.coord_clear_flags(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  update public.missing_person_pins set cedula_conflict = false, photo_conflict = false where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.coord_clear_flags(uuid) from anon, public;
grant execute on function public.coord_clear_flags(uuid) to authenticated;

-- ---- coordinator: merge/unmerge audit (with names) --------------------
create or replace function public.coord_merge_audit(p_limit int default 50)
returns table(
  id uuid, action text, merged_id uuid, merged_into_id uuid,
  merged_name text, into_name text, pre_status missing_status, reason_text text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then return; end if;
  return query
    select a.id, a.action, a.merged_id, a.merged_into_id,
           m.display_name, n.display_name, a.pre_status, a.reason_text, a.created_at
    from public.missing_person_merge_audit a
    left join public.missing_person_pins m on m.id = a.merged_id
    left join public.missing_person_pins n on n.id = a.merged_into_id
    order by a.created_at desc
    limit greatest(1, least(200, p_limit));
end; $$;
revoke execute on function public.coord_merge_audit(int) from anon, public;
grant execute on function public.coord_merge_audit(int) to authenticated;

-- ---- coordinator: partner-API key admin -------------------------------
create or replace function public.revoke_api_key(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  update public.partner_api_keys set revoked_at = now(), enabled = false where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.revoke_api_key(uuid) from anon, public;
grant execute on function public.revoke_api_key(uuid) to authenticated;

create or replace function public.set_api_key_enabled(p_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  -- never re-enables a permanently revoked key (verify_api_key checks revoked_at)
  update public.partner_api_keys set enabled = coalesce(p_enabled, enabled) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.set_api_key_enabled(uuid, boolean) from anon, public;
grant execute on function public.set_api_key_enabled(uuid, boolean) to authenticated;

-- ingest_source (added in 0021) wasn't in the original coordinator SELECT grant.
grant select (ingest_source) on public.partner_api_keys to authenticated;
