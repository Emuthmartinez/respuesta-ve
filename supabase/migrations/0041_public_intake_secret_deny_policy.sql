-- =====================================================================
-- 0040 — Explicit deny policy for public intake secret verifier storage.
--
-- The table has no app-role grants, and this policy keeps RLS posture explicit
-- for advisors and future operators.
-- =====================================================================

create policy public_intake_runtime_secrets_deny_all
  on public.public_intake_runtime_secrets
  for all to anon, authenticated
  using (false)
  with check (false);
