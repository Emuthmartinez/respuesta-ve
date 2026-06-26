-- =====================================================================
-- 0016 — Missing-person DEDUP & GROUPING engine (schema + view + audit).
--
-- Realises the user ask: dedupe + group the federated registry "without
-- losing records", with a section for UNIQUELY IDENTIFIED people (cédula) vs
-- those grouped only APPROXIMATELY. Designed via a 5-lens council + 2 red-team
-- passes. Governing rule (the life-safety asymmetry): cluster generously,
-- suppress/merge conservatively — a wrong merge can HIDE someone still trapped.
--
-- All changes ADDITIVE. No column dropped, no record ever deleted by dedup.
-- Grouping is presentational (cluster_id / possible_duplicate_ids); the only
-- destructive merge is duplicate_of, which stays coordinator-gated + reversible
-- (RPCs in 0017). The matching logic lives in lib/missing-persons.ts.
-- =====================================================================

alter table public.missing_person_pins
  -- Prefix-PRESERVING normalized cédula (V8765432 ≠ E8765432 — citizen vs
  -- foreigner are different people). The deterministic identity key.
  add column if not exists cedula_normalized text,
  -- Perceptual image fingerprint (16-hex dHash). Computed ONLY by the local
  -- ingest routine (ImageMagick). Never exposed publicly (not in any *_public
  -- view; base-table SELECT is already revoked from anon/authenticated). Used
  -- to group "same photo → same person".
  add column if not exists photo_phash text,
  -- Spanish-phonetic blocking key (folded first|last name token) for O(n)-ish
  -- candidate generation at 57k scale.
  add column if not exists name_phonetic text,
  -- True when the report names ≥2 people ("A, B y C") — never matched as one
  -- identity; shown as a group report.
  add column if not exists is_multi_person boolean not null default false,
  -- Connected-component id from union-find over confirmed+possible edges. Lets
  -- the search group scattered hits by a single key instead of shipping every
  -- row to the client. NULL = singleton / not yet clustered.
  add column if not exists cluster_id uuid,
  -- Which signals drove this record's strongest edge: subset of {cedula,name,photo}.
  -- Persisted so the coordinator merge flow can tell a cédula-confirmed cluster
  -- from a fuzzy one without re-running the scorer.
  add column if not exists cluster_reason text[],
  -- Same cédula but clashing names → set on the CHALLENGER (later-ingested) only;
  -- routes it to coordinator review and out of the "identified" section.
  add column if not exists cedula_conflict boolean not null default false,
  -- Same photo but clashing names (possible group photo / reused image).
  add column if not exists photo_conflict boolean not null default false,
  -- Pairs a coordinator split apart; never re-link these on re-ingest.
  add column if not exists split_from uuid[],
  -- Flagged for the nightly re-score (e.g. after an unmerge).
  add column if not exists needs_rescore boolean not null default false;

comment on column public.missing_person_pins.cedula_normalized is
  'Prefix-preserving cédula (V/E + digits). DETERMINISTIC identity key. V8765432 and E8765432 are DIFFERENT people. Server-only (never in *_public).';
comment on column public.missing_person_pins.photo_phash is
  'dHash of the source photo (16-hex). Server-only matching field — never publicly exposed; we never re-host the photo itself.';
comment on column public.missing_person_pins.cluster_id is
  'Union-find component id grouping the same person''s scattered records. Presentational only — clustering NEVER deletes or hides a record.';

-- ---- public view: add identity tier + cluster grouping, drop score ----
-- cedula_confirmed splits the two sections the user asked for. cluster_id +
-- cluster_size let the UI collapse "posible misma persona". dedupe_score is
-- REMOVED from the public projection (cross-registry correlation surface);
-- photo_phash / cedula_normalized / name_phonetic / conflict flags stay server-only.
drop view if exists public.missing_person_pins_public;
create view public.missing_person_pins_public with (security_invoker = off) as
  select
    id, display_name,
    public.fuzz_coord(last_seen_lat) as lat,
    public.fuzz_coord(last_seen_lng) as lng,
    estado, municipio, status, source, external_url,
    case when consent_given then photo_url else null end as photo_url,
    age_estimate,
    possible_duplicate_ids,
    cluster_id,
    is_multi_person,
    (cedula_normalized is not null and not cedula_conflict) as cedula_confirmed,
    coalesce(array_length(possible_duplicate_ids, 1), 0) as cluster_size,
    last_seen_at, created_at
  from public.missing_person_pins
  where retracted_at is null
    and duplicate_of is null
    and expires_at > now();
grant select on public.missing_person_pins_public to anon, authenticated;

-- ---- merge audit (immutable) -----------------------------------------
-- set_duplicate_of (0017) inserts here BEFORE writing duplicate_of, so every
-- destructive merge / reversal is accountable and re-buildable.
create table if not exists public.missing_person_merge_audit (
  id             uuid primary key default gen_random_uuid(),
  merged_id      uuid not null references public.missing_person_pins(id),
  merged_into_id uuid references public.missing_person_pins(id),
  action         text not null check (action in ('merge','unmerge')),
  actor_id       uuid references auth.users(id),
  reason_text    text,
  pre_status     missing_status,
  cluster_reason text[],
  created_at     timestamptz not null default now()
);
alter table public.missing_person_merge_audit enable row level security;
revoke all on public.missing_person_merge_audit from anon, authenticated;
grant select on public.missing_person_merge_audit to authenticated;
create policy mpma_select_coordinator on public.missing_person_merge_audit
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- ---- dedup split exceptions (authoritative "not the same person") -----
-- When a coordinator splits a wrong grouping, the pair is recorded here and
-- never re-linked on re-ingest. This is what makes "grouping is reversible
-- without losing records" true.
create table if not exists public.missing_person_dedup_exceptions (
  id          uuid primary key default gen_random_uuid(),
  id_a        uuid not null references public.missing_person_pins(id),
  id_b        uuid not null references public.missing_person_pins(id),
  split_by    uuid references auth.users(id),
  split_at    timestamptz not null default now(),
  reason_text text,
  unique (id_a, id_b)
);
alter table public.missing_person_dedup_exceptions enable row level security;
revoke all on public.missing_person_dedup_exceptions from anon, authenticated;
grant select on public.missing_person_dedup_exceptions to authenticated;
create policy mpde_select_coordinator on public.missing_person_dedup_exceptions
  for select to authenticated using (public.is_responder_coordinator(auth.uid()));

-- ---- indexes (blocking + housekeeping) -------------------------------
-- trigram search for name lookup at 57k scale (extension first, then the index).
create extension if not exists pg_trgm;

create index if not exists mpp_cedula_normalized_idx
  on public.missing_person_pins (cedula_normalized)
  where cedula_normalized is not null and retracted_at is null and duplicate_of is null;
create index if not exists mpp_name_phonetic_idx
  on public.missing_person_pins (name_phonetic, estado)
  where retracted_at is null and duplicate_of is null;
create index if not exists mpp_cluster_id_idx
  on public.missing_person_pins (cluster_id)
  where cluster_id is not null and retracted_at is null and duplicate_of is null;
create index if not exists mpp_display_name_trgm_idx
  on public.missing_person_pins using gin (lower(display_name) gin_trgm_ops);
