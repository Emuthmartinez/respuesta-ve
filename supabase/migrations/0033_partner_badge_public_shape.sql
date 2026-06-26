-- =====================================================================
-- 0033 — Keep public badge responses free of internal partner-key ids.
-- =====================================================================

drop view if exists public.partner_badges_public;

create view public.partner_badges_public with (security_invoker = off) as
  select
    name,
    ingest_source as source,
    verified_domains,
    coalesce(badge_label, name) as badge_label,
    badge_verified_at
  from public.partner_api_keys
  where enabled
    and revoked_at is null
    and badge_status = 'verified'
    and cardinality(verified_domains) > 0;

grant select on public.partner_badges_public to anon, authenticated;
