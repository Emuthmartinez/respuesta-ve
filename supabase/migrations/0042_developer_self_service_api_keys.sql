-- =====================================================================
-- 0042 — Developer self-service API keys.
--
-- Developers can create an account, issue a limited partner key, and manage
-- only their own keys. Coordinators keep the existing global key controls.
-- Plaintext keys are generated in the browser and never stored; Postgres keeps
-- only the SHA-256 verifier and display prefix.
-- =====================================================================

alter table public.partner_api_keys
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_email text,
  add column if not exists issued_via text not null default 'coordinator';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_api_keys_issued_via_check'
      and conrelid = 'public.partner_api_keys'::regclass
  ) then
    alter table public.partner_api_keys
      add constraint partner_api_keys_issued_via_check
      check (issued_via in ('coordinator','developer_self_service'));
  end if;
end $$;

create index if not exists partner_api_keys_owner_user_id_idx
  on public.partner_api_keys (owner_user_id, created_at desc);

grant select (
  owner_user_id, owner_email, issued_via
) on public.partner_api_keys to authenticated;

drop policy if exists pak_select_owner on public.partner_api_keys;
create policy pak_select_owner on public.partner_api_keys
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

create or replace function public.list_my_api_keys()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  select jsonb_build_object(
    'ok', true,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'keyPrefix', key_prefix,
      'scopes', scopes,
      'rateLimitPerMin', rate_limit_per_min,
      'rateLimitPerDay', rate_limit_per_day,
      'enabled', enabled,
      'revokedAt', revoked_at,
      'notes', notes,
      'createdAt', created_at,
      'lastUsedAt', last_used_at
    ) order by created_at desc), '[]'::jsonb)
  ) into result
  from public.partner_api_keys
  where owner_user_id = caller;

  return result;
end; $$;

revoke execute on function public.list_my_api_keys() from public, anon;
grant execute on function public.list_my_api_keys() to authenticated;

create or replace function public.issue_developer_api_key(
  p_name text,
  p_key_hash text,
  p_key_prefix text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  active_count int;
  new_id uuid;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_key_hash');
  end if;
  if p_key_prefix is null or p_key_prefix !~ '^rvk_[0-9a-f]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_key_prefix');
  end if;
  if v_notes is not null and length(v_notes) > 500 then
    return jsonb_build_object('ok', false, 'error', 'notes_too_long');
  end if;

  select count(*) into active_count
  from public.partner_api_keys
  where owner_user_id = caller
    and issued_via = 'developer_self_service'
    and revoked_at is null;

  if active_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_keys');
  end if;

  insert into public.partner_api_keys (
    name,
    key_hash,
    key_prefix,
    scopes,
    rate_limit_per_min,
    rate_limit_per_day,
    notes,
    ingest_source,
    verified_domains,
    badge_status,
    entity_auto_verify,
    owner_user_id,
    owner_email,
    issued_via
  ) values (
    v_name,
    p_key_hash,
    p_key_prefix,
    '{score,match,search,ingest}',
    30,
    1000,
    v_notes,
    'other',
    '{}',
    'unverified',
    false,
    caller,
    caller_email,
    'developer_self_service'
  ) returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'key_collision');
end; $$;

revoke execute on function public.issue_developer_api_key(text, text, text, text) from public, anon;
grant execute on function public.issue_developer_api_key(text, text, text, text) to authenticated;

create or replace function public.revoke_my_api_key(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  update public.partner_api_keys
     set revoked_at = now(),
         enabled = false
   where id = p_id
     and owner_user_id = caller
     and issued_via = 'developer_self_service'
     and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke execute on function public.revoke_my_api_key(uuid) from public, anon;
grant execute on function public.revoke_my_api_key(uuid) to authenticated;

create or replace function public.set_my_api_key_enabled(p_id uuid, p_enabled boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  update public.partner_api_keys
     set enabled = coalesce(p_enabled, enabled)
   where id = p_id
     and owner_user_id = caller
     and issued_via = 'developer_self_service'
     and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke execute on function public.set_my_api_key_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_my_api_key_enabled(uuid, boolean) to authenticated;
