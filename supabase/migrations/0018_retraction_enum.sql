-- =====================================================================
-- 0018 — Add the 'retracted' moderation state (used by 0019).
-- Split into its own migration because Postgres forbids USING a newly
-- added enum value in the same transaction that adds it. 0019 (a separate
-- transaction) references 'retracted' in the retraction RPCs.
-- report_moderation_status backs buildings, donation_centers, help_requests,
-- skill_offers and building_photos — one addition covers them all.
-- =====================================================================
alter type public.report_moderation_status add value if not exists 'retracted';
