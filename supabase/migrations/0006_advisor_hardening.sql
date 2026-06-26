-- =====================================================================
-- 0006 — Close advisor findings from 0003-0005.
-- Remaining intentional findings (documented):
--   * 3 SECURITY DEFINER public views (the fuzzing/privacy keystone)
--   * submit_building_report / get_inspection_request_status callable by anon
--     (the controlled public write/read entry points)
--   * claim/triage/arrive/release/close callable by authenticated
--     (each self-checks is_verified_responder / coordinator inside)
-- =====================================================================

-- submission_throttle is touched ONLY by the submit_building_report definer
-- function. Enable RLS with no policies so no role can read/write it directly.
alter table public.submission_throttle enable row level security;
revoke all on public.submission_throttle from anon, authenticated;

-- Trigger functions must never be callable as RPCs.
revoke execute on function public.link_assessment_to_request() from public, anon, authenticated;
revoke execute on function public.sync_building_inspection_on_request() from public, anon, authenticated;

-- Bound the flag-insert check (clears the always-true warning).
drop policy report_flags_insert_anyone on public.report_flags;
create policy report_flags_insert_anyone on public.report_flags
  for insert to anon, authenticated with check (building_id is not null);
