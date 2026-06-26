# Plataforma de Respuesta — Terremoto Venezuela 2026

A unified crisis-response platform for the June 2026 Venezuela earthquakes
(7.2 + 7.5 twin quakes; La Guaira, Caracas, Miranda, Aragua, Carabobo,
Trujillo). Spanish-first, mobile-first PWA.

## What this is (and isn't)

It is **the damage + coordination layer** that existing tools lack:

1. **Damage map** — crowdsourced building damage reports with severity, a
   density heatmap, and filters by state/severity.
2. **Inspection coordination** — people who are locked out of / unsure about a
   building can request a credentialed inspection; verified engineers claim
   requests and post ATC‑20-style placards (green / yellow / red).
3. **Responder platform** — structural/civil engineers, architects,
   search-and-rescue, medical, and civil-protection volunteers register,
   upload credentials, get verified, and act.
4. **Missing persons — FEDERATED, not duplicated.** We link out to and
   aggregate existing registries (e.g. venezuelatebusca.com) and the open
   **PFIF / Google Person Finder** standard. Map pins show "last seen here"
   and link to the authoritative entry. We do **not** become a competing silo.

## Privacy model (non-negotiable)

Precise coordinates are stored but **never** exposed publicly. The public reads
only `*_public` views, which round coordinates to ~110 m (3 decimal places)
via `public.fuzz_coord()`. Precise coordinates are readable only by **verified
responders** and the service role. This protects trapped/vulnerable people from
looters and exploitation while still enabling rescue. See `0001_init.sql`
(and the moderation/privacy/inspection gates in `0003`–`0005`).

## Not official certification

Community damage reports and even responder placards are **coordination aids**,
not official structural certifications. UI must always direct users to
**Protección Civil / Bomberos** for authoritative decisions.

## Stack

- **Next.js 16** (App Router, PWA) + **React 19** + **Tailwind 4**
- **Supabase** — Postgres 17 + **PostGIS**, Auth, Realtime, Storage
- **MapLibre GL** + OpenStreetMap tiles (`react-map-gl/maplibre`)
- **Zod** for input validation

## Data model

| Table | Purpose |
|---|---|
| `buildings` | Damage reports + inspection state + official placard. Precise `location`. |
| `building_photos` | Photos attached to a building (private bucket). |
| `responders` | Verified-responder profiles (1:1 with `auth.users`). |
| `assessments` | Engineer placards; a trigger reflects the latest onto the building. |
| `missing_person_pins` | Federated "last seen" pins linking to external registries. |
| `buildings_public` / `missing_person_pins_public` | Fuzzed public projections. |

## Roadmap

- **P0** Public damage map + report form (anonymous reporting allowed).
- **P1** Missing-persons federation (ingest + link-out, PFIF feed).
- **P2** Responder auth, verification, inspection request → claim → placard.
- **P3** Heatmap of damage density; state-level dashboards.
- **P4** Offline-tolerant PWA (submit offline, sync on reconnect); abuse
  controls (rate limiting, dedup, moderation queue).

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase keys
pnpm dev
```

Database changes live in `supabase/migrations/`. They are **not** applied to a
remote project until reviewed and coordinated with the live deployment owner.
