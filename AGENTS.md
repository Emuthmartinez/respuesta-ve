<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see
[`README.md`](README.md) for a quick start and [`ARCHITECTURE.md`](ARCHITECTURE.md)
for the product/architecture overview. Remaining work and launch gates are in
[`docs/STATUS.md`](docs/STATUS.md).

The note above is load-bearing: this is **Next.js 16 (App Router, Turbopack)**.
When writing framework code, read the relevant guide under
`node_modules/next/dist/docs/` and, when in doubt, **mirror an existing file in
this repo** rather than inventing an API.

## Project overview

**Respuesta VE** is a Spanish-first, mobile-first crisis-response PWA for the
June 2026 Venezuela earthquakes. It is the first live instance of the public
**Humanitarian Federation Platform** and provides the **damage-map +
coordination layer** other tools lack: crowdsourced building-damage reports, an
inspection-request → claim → ATC-20 placard flow for verified responders, a
federated missing-persons search, a donation directory, a skills↔needs
marketplace, and a misinformation disclosure board.

Generic, disaster-agnostic platform contracts and helpers live in
`/Users/eduardomuthmartinez/humanitarian-federation-platform` and the public
repo `Emuthmartinez/humanitarian-federation-platform`. This repo should stay the
Venezuela instance: runtime app, Supabase schema, local copy, moderation, and
deployment.

Two principles drive almost every design decision:

1. **Life-safety first.** Friction in an emergency costs lives. Anyone can report
   anonymously — no account required. Never add a gate that blocks a person from
   reporting a collapse or a missing relative.
2. **Privacy is non-negotiable.** Precise coordinates and contact info are stored
   but **never** exposed publicly. The public only ever reads fuzzed `*_public`
   views. Protecting trapped/vulnerable people from looters outranks convenience.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4**
- **Supabase** — Postgres 17, Auth, Storage, RLS (the **anon key only** on the
  server; privilege is granted inside Postgres, not in Node — see Security)
- **MapLibre GL** + OpenStreetMap via `react-map-gl/maplibre`
- **Zod** for input validation
- **Deployed on Cloudflare Workers** via OpenNext (`@opennextjs/cloudflare`) —
  **not Vercel**
- Package manager: **pnpm**

## Dev environment

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase + REPORT_IP_SALT
pnpm dev                           # http://localhost:3000
```

`NEXT_PUBLIC_*` env vars are **build-time inlined**, so production builds must run
from a checkout with a populated `.env.local`. The app degrades gracefully when
Supabase env is absent (the browser/server clients return `null` and the UI falls
back to sample data), so `pnpm dev` works before provisioning.

## Build, lint, deploy

```bash
pnpm build        # next build (Turbopack)
pnpm lint         # eslint
npx tsc --noEmit  # fast type-check gate before a full build
pnpm run deploy   # opennextjs-cloudflare build && deploy  → Cloudflare Workers
pnpm preview      # opennextjs-cloudflare build && local preview
pnpm cf-typegen   # regenerate Cloudflare env types
```

Deploy targets the `respuesta-ve` Worker and serves several custom domains
(respuestave.org, www, respondeve.org, terremotovenezuela.org) plus the
`*.workers.dev` URL. After any deploy, smoke-test the live URL. Worker secrets
(e.g. `REPORT_IP_SALT`) are set with `wrangler secret put` — **never** committed.

## Testing instructions

There is no Jest/Vitest harness. Two patterns cover correctness:

1. **Pure-logic unit tests** run directly with Node's type-stripping:
   ```bash
   node lib/missing-persons.test.mjs   # dedup engine: ~31 offline assertions
   ```
   Keep heavy pure logic (dedup, parsing, classification) in dependency-free
   modules so they can be tested this way.

2. **Database end-to-end tests via rolled-back transactions** — the primary gate
   for RLS policies and `SECURITY DEFINER` RPCs. Wrap the scenario in a
   `DO $$ ... $$` block, assert with `if not <cond> then raise exception
   'FAIL: ...'`, and **end with `raise exception 'ALL_PASSED: ...'`** so the whole
   transaction rolls back and nothing persists. Simulate an authenticated user
   inside the block with
   `perform set_config('request.jwt.claims', json_build_object('sub','<uid>','role','authenticated')::text, true);`
   so `auth.uid()` and `is_responder_coordinator()` resolve. Run it through the
   Supabase MCP `execute_sql` (or `psql`).

Always finish a change with `npx tsc --noEmit` and `pnpm build` green. After any
DDL, run the Supabase **advisors** and confirm no *new* findings.

## Architecture & conventions (read before editing)

**Privilege model.** The server uses the Supabase **anon key only** — there is no
service-role key in request paths. All writes go through Postgres
`SECURITY DEFINER` RPCs (`submit_*`, `retract_*`, `claim_*`, `moderate_*`, …);
all privileged reads go through RLS. A definer function owned by `postgres`
bypasses RLS, which is how it writes to locked-down tables like
`submission_throttle` and `moderation_log`. New-RPC checklist: `language plpgsql
security definer set search_path = public`; validate inputs; rate-limit via
`submission_throttle`; `revoke execute ... from public;` then `grant execute ...
to anon[, authenticated]`; return a small `jsonb` `{ok, ...}`.

**Public reads = `*_public` views only.** Anon/authenticated never select base
tables for public data. Each entity has a `*_public` view that filters to the
live/approved state and fuzzes coordinates via `public.fuzz_coord()` (~110 m).
These views are intentionally `security_invoker = off`; the Supabase advisor flags
them as `security_definer_view` ERRORs — **documented-intentional, do not "fix".**
When you add a withdrawn/retracted state, ensure every relevant `*_public` view
excludes it.

**Moderation gate.** Every citizen submission inserts as `pending` and is hidden
from the public until a coordinator approves it via a coordinator-only RPC. This
gate — not auth — is the primary spam/abuse defense, which is why anonymous
submission is acceptable.

**Ownership = management token (no account).** Citizen-creatable entities mint a
one-time `randomBytes(24)` token at submit time; only its sha256 is stored as
`token_hash`. The raw token is returned once and is the submitter's only handle to
manage/retract their content at `/gestionar/<token>`. **Hash tokens in the Next
server layer** (`node:crypto`), never in the browser, and never pass a raw token
into Postgres. Deletes are **soft-retractions** (flip to a withdrawn state + write
`moderation_log`), never `DELETE`, so the audit trail survives. Life-safety
guards: a possibly-trapped building or a claimed/in-progress inspection routes a
retraction through coordinator/responder confirmation instead of hiding
immediately. `skill_offers` are the exception — account-owned (`offerer_id`).

**IP hashing.** Abuse throttling keys on a daily-rotating
`sha256(ip | YYYY-MM-DD | REPORT_IP_SALT)`. Reuse the `ipHash(req)` helper in the
API routes; never store a raw IP.

**i18n — keep the client/server split.** `lib/i18n.ts` is **client-safe**
(`Locale`, `DEFAULT_LOCALE`, `DICT`, `t`, `tr`) and must **never** import
`next/headers`. `lib/i18n-server.ts` holds `getLocale()` / `metaFor()` (server
only, reads the cookie via `next/headers`). Client components get the locale via
`useLocale()` from `lib/locale-context.tsx`. Importing `next/headers` into a
client component breaks the Turbopack build. Most forms carry a local
`const STR = { es: {...}, en: {...} } as const`; bilingual label maps in
`lib/{orgs,skills,taxonomy,responder,safety-copy}` use `{es,en}` shapes with helper
fns — render via the helper or `.es`/`.en`, never assign a `{es,en}` object where a
string is expected.

**Routes.** API handlers use `export const runtime = 'nodejs'` and `node:crypto`.
Dynamic pages await params: `({ params }: { params: Promise<{...}> })`. There is
**no `middleware.ts`** — Next 16 `proxy`/middleware is Edge-only and OpenNext needs
Node; session refresh relies on the Supabase browser client plus the
`/auth/callback` route. Don't reintroduce middleware without checking the OpenNext
constraints.

## Database & migrations

- Migrations are sequential SQL in `supabase/migrations/NNNN_name.sql`, currently
  through `0033`. They are the source of truth and are version-controlled. Pick
  the next free number; if two features land concurrently, renumber to keep the
  sequence monotonic and gap-free.
- Apply via the Supabase MCP (`apply_migration`) or the Supabase CLI; keep the
  on-disk file and the remote in sync.
- **Enum gotcha:** Postgres can't *use* a newly added enum value in the same
  transaction that adds it. Add new enum values in their own migration
  (`alter type ... add value if not exists '...'`) that commits before any
  migration references the value (see `0018` → `0019`).
- To change an RPC's signature, `drop function if exists <exact-old-signature>`
  then `create` the new one and re-`grant` — adding a parameter otherwise creates
  a confusing overload.
- After any DDL, run `get_advisors`. Expect only documented-intentional findings:
  ~9 `security_definer_view` ERRORs (the `*_public` views) and
  `*_security_definer_function_executable` WARNs (every RPC). A
  `function_search_path_mutable` finding means you forgot `set search_path = public`.

## Repository layout

```
app/                 Next.js App Router routes (pages + /api route handlers)
components/           React components (client + server)
lib/                 Domain logic, Supabase clients, i18n, pure engines
supabase/migrations/ Postgres schema (RLS, views, RPCs) — source of truth
app/api/v1/          Partner-facing public API (dedup/matching + OpenAPI)
scripts/             One-off / ingestion node scripts (excluded from tsc/build)
ingest-worker/       SEPARATE Cloudflare Worker (cron ingestion) — its own deploy
mcp-server/          SEPARATE Node package — partner MCP server (own deps/deploy)
.claude/skills/      Project skills (e.g. respuesta-ingest pipeline)
docs/                STATUS.md and other agent/human docs
```

**`ingest-worker/` and `mcp-server/` are separate packages** with their own
dependencies and deploy lifecycles — both are excluded from the main `next build`
(`tsconfig.json` `exclude`) and are **not** deployed by `pnpm run deploy`. Don't
import app code into them or vice-versa.

## Security considerations

- Treat anything a citizen submits as untrusted. Raw scraped/LLM text stays inside
  clearly bounded fields; the LLM annotation layer is a **bounded annotator**,
  never a silent write path (deterministic code is the only writer).
- Never echo raw Postgres error text to a client — return a generic error code.
- Validate ids (UUID shape) and token length in the route before hitting the RPC.
- Do not weaken the privacy model: no new public surface may expose precise
  coordinates, `reporter_contact`, `contact_private`, `cedula`, or photos of
  federated records.
- Missing-persons dedup stance is **surface, never auto-merge** — a wrong merge can
  hide a found/missing person. Only coordinators merge, and merges are reversible.

## PR / commit conventions

- Conventional-commit subjects (`feat:`, `fix:`, `i18n:`, `chore:`), often scoped
  (`feat(personas): …`).
- Only commit/push when asked. If you're on `main`, branch first.
- Before a PR: `npx tsc --noEmit` and `pnpm build` green; DB changes e2e-tested via
  rolled-back transactions and advisor-clean.
- For substantial DB or security changes, run an adversarial review (or the
  `code-review` / security skills) and fix confirmed findings before deploy.
