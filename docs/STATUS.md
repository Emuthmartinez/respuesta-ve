# Status & Remaining Work

Snapshot as of **2026-06-26**. This is the living backlog: what's shipped, what
gates a wider public launch, and what's deliberately deferred. Update it when you
land or re-scope an item. Architecture lives in
[`ARCHITECTURE.md`](../ARCHITECTURE.md); agent conventions in
[`AGENTS.md`](../AGENTS.md).

## Shipped & live

Deployed to Cloudflare Workers (`respuesta-ve`), serving respuestave.org +
respondeve.org + terremotovenezuela.org + `*.workers.dev`. DB migrations through
`0027`. (The ownership/retraction feature is `0018`, `0019`, `0023`; the
partner-API + coordinator dedup-desk feature landed concurrently as
`0020`–`0022`; the partner status/sync API is `0026`–`0027`.)

- Public **damage map** (lazy-loaded + 3G list view), anonymous **report form**,
  drag-to-confirm **provisional placement**, density layers.
- **Inspection** flow: request → triage → atomic claim → arrival → ATC-20
  assessment → placard, all via SECURITY DEFINER RPCs.
- **Responder** registration, credential upload, coordinator verification, tiers,
  instant suspension.
- **Federated missing-persons** search over ~11.6k real records with a
  multi-signal dedup engine (cédula / photo dHash / fuzzy name), "Identificados"
  vs "Agrupación aproximada" sections.
- **Donation directory** (orgs + in-person centers), **skills↔needs marketplace**
  (coordinator-mediated intros), **misinformation disclosure** board.
- **Universal management-token ownership + soft-retraction** across every
  citizen-creatable entity, with life-safety guards and a coordinator
  retraction-confirmation queue. (`0018`, `0019`, `0023`; see AGENTS.md.)
- **Partner API** (`/api/v1/*` dedup/matching/status sync + OpenAPI), a public
  Developer API page, API-key management (`/voluntarios/api-keys`), and a
  standalone `mcp-server/` — landed concurrently (`0020`–`0022`, status/sync in
  `0026`–`0027`).
- **Coordinator missing-person dedup desk** (`MissingDedupDesk`): review
  clusters, merge/split/undo, and a cédula/photo **conflict review queue**
  (`coord_missing_clusters` / `coord_missing_conflicts`, `0022`).
- Coordinator dashboards: moderation, responder verification, donation-center +
  org approval, skills-matching desk, retraction/cancellation queue.
- Bilingual ES/EN public surfaces, light/dark mode, localized page metadata.
- Automated multi-surface ingestion (separate `ingest-worker` + the
  `respuesta-ingest` skill) with an LLM bounded-annotator layer.

## Launch gates (do before wider public launch)

- [ ] **Supabase Auth redirect allowlist** — Dashboard → Authentication → URL
      Configuration: set Site URL and add redirect URLs for every custom domain
      (`https://respuestave.org/**`, etc.). Required for magic-link / Google
      login to work in production. No MCP/CLI for this — dashboard only.
- [ ] **Map tiles** — swap `NEXT_PUBLIC_MAP_STYLE` to a MapTiler/Protomaps style;
      raw OSM tiles are dev-only under OSM's tile-usage policy.
- [ ] **`INGEST_TOKEN` Worker secret** — the personas ingest route
      (`/api/personas/ingest`) is token-gated; production needs the secret set
      via `wrangler secret put` (currently only a dev value in `.env.local`).
- [ ] **`ingest-worker` `RUN_TOKEN`** is committed in cleartext in
      `ingest-worker/wrangler.jsonc` — fine while the repo is private, but migrate
      to `wrangler secret` before the repo goes public.
- [ ] **`X_BEARER` secret** on `ingest-worker` if/when enabling X scanning
      (pre-wired, currently disabled).

## Deferred — from the ownership/retraction security review (low severity)

These were confirmed real but accepted as low-risk for launch; revisit under load.

- [ ] **Rate-limit the public token lookup** (`lookup_submission` /
      `/gestionar/[token]`). Currently unthrottled; mitigated by 192-bit tokens and
      indexed point lookups. Add a light per-IP cap (middleware or in-RPC throttle).
- [ ] **`submission_throttle` TTL sweep** — no cleanup job. IP-keying bounds growth,
      but add a `pg_cron` `DELETE ... where created_at < now() - interval '2 hours'`.
- [ ] **Coordinator alert on trapped→flagged** — when a possibly-trapped building is
      community-flagged, there's no notification path (a coordinator must poll
      `moderation_log`). Wire an email/webhook once notifications exist.

## Deferred — longer-term backlog

- [ ] **Provisional-placement lifecycle**: 72h orphan-provisional TTL sweep;
      temporal decay on stale location confirmations; a coordinator
      "re-provisional" RPC to reverse a bad graduation.
- [ ] **Stale-claim reclaim** — `pg_cron` job to release inspection claims left
      `claimed`/`in_progress` for >4h.
- [ ] **PWA offline sync** — submit offline → background-sync on reconnect
      (idempotency key `offline_sync_id` already exists on `buildings`).
- [ ] **Notifications** — WhatsApp / SMS / email (e.g. "your report was verified",
      coordinator alerts).
- [ ] **Missing-persons backfill** — resume the gentle harvest for the remaining
      ~45k records (reCAPTCHA score-throttles past ~page 585; back off respectfully).
- [ ] **Scheduled ingestion** — wire a local cron / routine to run the
      `respuesta-ingest` skill on a cadence.
- [ ] **Misinformation trust policy** — `isLikelyMisinformation()` is a TODO stub
      awaiting a denylist / trust-scoring decision (a life-safety tradeoff: false
      positives could suppress real reports).
- [ ] **Naming / positioning** — "Respuesta VE" is a placeholder; final
      name/brand still open.

## Notes for whoever picks this up

- The coordinator account `e.muth.martinez@gmail.com` is pre-provisioned (verified
  senior, `is_coordinator = true`).
- Before sharing any URL, confirm no sample/test rows are public:
  `delete from public.buildings where is_sample_data;`
- After any schema change, run the Supabase advisors and confirm only the
  documented-intentional findings remain (see AGENTS.md → Database & migrations).
