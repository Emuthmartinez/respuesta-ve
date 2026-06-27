-- =====================================================================
-- 0039 — Text-safe SHA-256 helper for public intake secret checks.
--
-- Supabase installs pgcrypto in the extensions schema, while these SECURITY
-- DEFINER RPCs run with search_path = public. Expose a public text overload
-- that delegates to the qualified pgcrypto function.
-- =====================================================================

create or replace function public.digest(data text, type text)
returns bytea
language sql immutable strict parallel safe set search_path = public as $$
  select extensions.digest(data, type);
$$;

revoke execute on function public.digest(text, text) from public;
