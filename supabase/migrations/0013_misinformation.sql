-- =====================================================================
-- 0013 — Misinformation tracking for the Venezuela 2026 earthquake
--        response platform.
--
-- Captures fact-checked / debunked claims surfaced by the automated
-- ingest pipeline (respuesta-ingest skill) or reported manually.
--
-- Objects created:
--   * enum misinfo_verdict  — severity of the false claim
--   * enum misinfo_status   — moderation lifecycle
--   * table public.misinformation_reports
--   * view  public.misinformation_reports_public  (published rows only)
--   * RLS + coordinator policies
--   * RPC  public.submit_misinformation_report()
--     — SECURITY DEFINER, throttled via submission_throttle (kind='misinfo'),
--       mirrors submit_building_report shape
--   * RPC  public.moderate_misinformation_report()
--     — SECURITY DEFINER, coordinator-only, writes to moderation_log
--       (mirrors moderate_building from 0009); raw UPDATE not granted
-- =====================================================================

-- ---- idempotent enum guards -----------------------------------------
-- Use DO-block guards so re-running the migration in a dev reset won't
-- fail. (This is the standard Postgres pattern; the repo runs migrations
-- sequentially so guards are safety-net only.)

DO $$ BEGIN
  create type misinfo_verdict as enum ('false','misleading','unverified','satire');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  create type misinfo_status as enum ('pending','published','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- misinformation_reports -----------------------------------------
create table if not exists public.misinformation_reports (
  id            uuid primary key default gen_random_uuid(),

  -- the claim being assessed (required)
  claim         text not null,

  -- fact-check verdict
  verdict       misinfo_verdict not null default 'unverified',

  -- human-readable explanation of why the claim is false / misleading
  explanation   text not null,

  -- optional canonical debunk URL (e.g. Efecto Cocuyo fact-check article)
  debunk_url    text,

  -- the URL where the misinformation was observed (tweet, article, etc.)
  source_url    text not null,

  -- free-text place reference (e.g. 'Caraballeda', 'Edificio Petunia')
  related_place text,

  -- how dangerous / viral this claim is
  severity      text not null default 'medium'
                  check (severity in ('low', 'medium', 'high')),

  -- moderation lifecycle
  status        misinfo_status not null default 'pending',

  -- audit fields (mirroring buildings / donation_centers)
  suggested_by  uuid references auth.users(id),
  moderated_by  uuid references auth.users(id),
  moderated_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists misinfo_reports_status_idx
  on public.misinformation_reports (status);
create index if not exists misinfo_reports_verdict_idx
  on public.misinformation_reports (verdict);
create index if not exists misinfo_reports_severity_idx
  on public.misinformation_reports (severity);

create trigger trg_misinfo_touch
  before update on public.misinformation_reports
  for each row execute function public.touch_updated_at();

-- ---- public view (published rows only) ------------------------------
-- Mirrors the repo convention (buildings_public, organizations_public):
-- security_invoker = off → the view runs as its OWNER and bypasses RLS, so the
-- WHERE clause is the sole public filter. Everyone (anon + authenticated) reads
-- published rows through this view; the base table stays gated to coordinators.
-- (An earlier draft used security_invoker = on, which broke: a logged-in
-- NON-coordinator would be RLS-filtered to an empty list even for published
-- rows. The definer view avoids that.)
drop view if exists public.misinformation_reports_public;
create view public.misinformation_reports_public
  with (security_invoker = off) as
  select
    id,
    claim,
    verdict,
    explanation,
    debunk_url,
    source_url,
    related_place,
    severity,
    created_at
  from public.misinformation_reports
  where status = 'published';

grant select on public.misinformation_reports_public to anon, authenticated;

-- ---- RLS on base table ----------------------------------------------
alter table public.misinformation_reports enable row level security;
revoke all on public.misinformation_reports from anon, authenticated;

-- No base-table grant to anon: the public reads ONLY via the definer view above.
-- Coordinators read ALL rows (pending/published/rejected) for triage. Any
-- SECURITY DEFINER function that queries this table must re-check
-- is_responder_coordinator() explicitly inside the function body.
grant select on public.misinformation_reports to authenticated;
create policy misinfo_select_coordinator on public.misinformation_reports
  for select to authenticated
  using (public.is_responder_coordinator(auth.uid()));

-- Coordinators moderate via the moderate_misinformation_report() RPC below.
-- Raw UPDATE is intentionally NOT granted to any role; all state transitions
-- go through the audited RPC (mirrors moderate_building from 0009).

-- ---- submission RPC -------------------------------------------------
-- Mirrors submit_building_report / submit_organization shape exactly:
--   * SECURITY DEFINER (can write to the throttle table)
--   * validates claim is non-empty
--   * rate-limits via submission_throttle (kind = 'misinfo')
--   * inserts as status = 'pending'
--   * returns {ok, id, status} JSON

create or replace function public.submit_misinformation_report(
  p_ip_hash     text,
  p_claim       text,
  p_verdict     misinfo_verdict    default 'unverified',
  p_explanation text               default '',
  p_source_url  text               default null,
  p_debunk_url  text               default null,
  p_related_place text             default null,
  p_severity    text               default 'medium'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
  new_id uuid;
begin
  -- Basic validation
  if p_claim is null or length(trim(p_claim)) < 5 then
    return jsonb_build_object('ok', false, 'error', 'claim_required');
  end if;

  if p_source_url is null or length(trim(p_source_url)) < 7 then
    return jsonb_build_object('ok', false, 'error', 'source_url_required');
  end if;

  if p_severity not in ('low', 'medium', 'high') then
    return jsonb_build_object('ok', false, 'error', 'invalid_severity');
  end if;

  -- Rate limit: max 5 misinfo reports per IP per hour
  select count(*) into recent
    from public.submission_throttle
    where ip_hash = p_ip_hash
      and kind = 'misinfo'
      and created_at > now() - interval '1 hour';

  if recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- Insert as pending
  insert into public.misinformation_reports (
    claim, verdict, explanation, source_url, debunk_url,
    related_place, severity, status, suggested_by
  ) values (
    trim(p_claim),
    coalesce(p_verdict, 'unverified'),
    coalesce(trim(p_explanation), ''),
    trim(p_source_url),
    nullif(trim(coalesce(p_debunk_url, '')), ''),
    nullif(trim(coalesce(p_related_place, '')), ''),
    coalesce(p_severity, 'medium'),
    'pending',
    auth.uid()
  )
  returning id into new_id;

  -- Record throttle entry
  insert into public.submission_throttle (ip_hash, kind)
    values (p_ip_hash, 'misinfo');

  return jsonb_build_object('ok', true, 'id', new_id, 'status', 'pending');
end;
$$;

-- Revoke from public first (definer pattern), then grant to callers.
revoke execute on function public.submit_misinformation_report(
  text, text, misinfo_verdict, text, text, text, text, text
) from public;
grant execute on function public.submit_misinformation_report(
  text, text, misinfo_verdict, text, text, text, text, text
) to anon, authenticated;

-- ---- moderation RPC -------------------------------------------------
-- Mirrors moderate_building (0009) and promote_organization (0011):
--   * SECURITY DEFINER so it can write to moderation_log
--   * validates caller is a coordinator before any mutation
--   * updates status/moderation fields atomically with audit log entry
--   * raw UPDATE on the base table is NOT granted to any role

create or replace function public.moderate_misinformation_report(
  p_report uuid,
  p_status misinfo_status,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  -- Authorization: only coordinators may moderate.
  if not public.is_responder_coordinator(caller) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  -- Validate target status (pending is not a valid moderation outcome).
  if p_status not in ('published', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  -- Apply moderation decision.
  update public.misinformation_reports
     set status       = p_status,
         moderated_by = caller,
         moderated_at = now()
   where id = p_report;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Audit log entry (mirrors moderate_building from 0009 — exact column names).
  insert into public.moderation_log (
    entity_type, entity_id, action, new_status, moderator_id, reason
  ) values (
    'misinformation_report',
    p_report,
    'moderate',
    p_status::text,
    caller,
    p_reason
  );

  return jsonb_build_object('ok', true, 'id', p_report, 'status', p_status);
end;
$$;

revoke execute on function public.moderate_misinformation_report(
  uuid, misinfo_status, text
) from public;
grant execute on function public.moderate_misinformation_report(
  uuid, misinfo_status, text
) to authenticated;
