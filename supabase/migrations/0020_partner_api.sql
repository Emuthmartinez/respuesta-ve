-- =====================================================================
-- 0018 — Partner API: hashed API keys + atomic per-key rate limiting.
--
-- Externalizes the dedup/matching engine to other registries & agents. Keys are
-- HASHED at rest (sha256 hex); the plaintext is shown once at issuance and never
-- stored. verify_api_key() does auth + scope check + sliding-window rate limit
-- in ONE round-trip (the Cloudflare Worker has no local state). All objects are
-- locked away from anon/authenticated — only the SECURITY DEFINER RPC touches
-- them — so a leaked anon key can't read the key table or forge usage.
-- =====================================================================

create table if not exists public.partner_api_keys (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,                       -- partner / integration name
  key_hash             text not null unique,                -- sha256(plaintext) hex
  key_prefix           text not null,                       -- first chars, for display only
  scopes               text[] not null default '{score,match,search}',
  rate_limit_per_min   int not null default 60,
  rate_limit_per_day   int not null default 5000,
  enabled              boolean not null default true,
  revoked_at           timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  last_used_at         timestamptz
);
alter table public.partner_api_keys enable row level security;
revoke all on public.partner_api_keys from anon, authenticated;
-- coordinators may read key metadata (never the hash is sensitive, but lock SELECT anyway)
grant select (id, name, key_prefix, scopes, rate_limit_per_min, rate_limit_per_day, enabled, revoked_at, notes, created_at, last_used_at)
  on public.partner_api_keys to authenticated;
create policy pak_select_coordinator on public.partner_api_keys
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- Per-key rate buckets (minute + day). Bounded: rows expire and are swept.
create table if not exists public.api_rate_counters (
  api_key_id  uuid not null references public.partner_api_keys(id) on delete cascade,
  bucket      text not null,                                 -- 'min:<ts>' | 'day:<date>'
  count       int not null default 0,
  expires_at  timestamptz not null,
  primary key (api_key_id, bucket)
);
alter table public.api_rate_counters enable row level security;
revoke all on public.api_rate_counters from anon, authenticated;
create index if not exists arc_expires_idx on public.api_rate_counters (expires_at);

-- ---- verify + rate-limit in one atomic call --------------------------
-- Returns {ok, key_id, name, scopes} on success, or {ok:false, error, retry_after}.
-- error ∈ invalid_key | insufficient_scope | rate_limited.
create or replace function public.verify_api_key(p_key_hash text, p_scope text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k            public.partner_api_keys%rowtype;
  v_min_bucket text := 'min:' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
  v_day_bucket text := 'day:' || to_char(current_date, 'YYYYMMDD');
  v_min_count  int;
  v_day_count  int;
begin
  select * into k from public.partner_api_keys
    where key_hash = p_key_hash and enabled and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;

  if p_scope is not null and not (p_scope = any (k.scopes)) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_scope');
  end if;

  -- minute window
  insert into public.api_rate_counters (api_key_id, bucket, count, expires_at)
    values (k.id, v_min_bucket, 1, now() + interval '2 minutes')
    on conflict (api_key_id, bucket) do update set count = api_rate_counters.count + 1
    returning count into v_min_count;
  if v_min_count > k.rate_limit_per_min then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'scope', 'minute',
      'limit', k.rate_limit_per_min, 'retry_after', 60);
  end if;

  -- day window
  insert into public.api_rate_counters (api_key_id, bucket, count, expires_at)
    values (k.id, v_day_bucket, 1, (current_date + 2) :: timestamptz)
    on conflict (api_key_id, bucket) do update set count = api_rate_counters.count + 1
    returning count into v_day_count;
  if v_day_count > k.rate_limit_per_day then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'scope', 'day',
      'limit', k.rate_limit_per_day, 'retry_after', 3600);
  end if;

  update public.partner_api_keys set last_used_at = now() where id = k.id;

  -- opportunistic sweep of expired buckets (cheap, bounded)
  delete from public.api_rate_counters where expires_at < now();

  return jsonb_build_object('ok', true, 'key_id', k.id, 'name', k.name, 'scopes', k.scopes,
    'remaining_min', greatest(0, k.rate_limit_per_min - v_min_count),
    'remaining_day', greatest(0, k.rate_limit_per_day - v_day_count));
end; $$;
revoke execute on function public.verify_api_key(text, text) from public;
grant execute on function public.verify_api_key(text, text) to anon, authenticated;

-- ---- coordinator-only: issue a key (caller passes the pre-computed hash) ----
-- The plaintext is generated + shown client-side; only its hash reaches the DB.
create or replace function public.issue_api_key(
  p_name text, p_key_hash text, p_key_prefix text,
  p_scopes text[] default '{score,match,search}',
  p_rate_per_min int default 60, p_rate_per_day int default 5000, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_responder_coordinator(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_coordinator');
  end if;
  insert into public.partner_api_keys (name, key_hash, key_prefix, scopes, rate_limit_per_min, rate_limit_per_day, notes)
    values (p_name, p_key_hash, p_key_prefix, coalesce(p_scopes,'{score,match,search}'),
            coalesce(p_rate_per_min,60), coalesce(p_rate_per_day,5000), p_notes)
    returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end; $$;
revoke execute on function public.issue_api_key(text, text, text, text[], int, int, text) from anon, public;
grant execute on function public.issue_api_key(text, text, text, text[], int, int, text) to authenticated;
