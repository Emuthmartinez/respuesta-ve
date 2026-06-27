# Respuesta VE

A Spanish-first, mobile-first crisis-response PWA for the June 2026 Venezuela
earthquakes — the **damage-map + coordination layer** other tools lack:
crowdsourced building-damage reports, an inspection-request → claim → ATC-20
placard flow for verified responders, a federated missing-persons search, a
donation directory, a skills↔needs marketplace, and a misinformation board.

Live: **[respuestave.org](https://respuestave.org)**

Respuesta VE is the first live instance of the public
**Humanitarian Federation Platform**:
[github.com/Emuthmartinez/humanitarian-federation-platform](https://github.com/Emuthmartinez/humanitarian-federation-platform).
This repo owns the Venezuela-specific site, deployment, moderation flows, and
Supabase schema. The platform repo owns reusable federation contracts, redaction
and matching primitives, trust/badge semantics, and instance guidance for any
humanitarian crisis.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase keys + server secrets
pnpm dev                           # http://localhost:3000
```

The app runs without Supabase configured (it falls back to sample data), so you
can start the dev server before provisioning.

## Collaborate

This project is meant to interoperate with other Venezuela-response efforts, not
replace them. If you run a missing-persons registry, damage map, donation list,
or responder coordination tool, open a **Collaboration / integration** issue and
tell us what data you can exchange and what privacy constraints you need.

- Missing-persons federation uses source link-backs and advisory duplicate
  signals; coordinators review merges, and the app never auto-merges records.
- Public map/API surfaces must not expose precise coordinates, private contact
  info, cedula values, or raw photos from federated records.
- Good first contributions are usually documentation, translation, accessibility,
  API-client examples, source adapters, and small UI fixes.
- Generic platform contracts, new disaster-agnostic adapter designs, and badge
  semantics belong in the platform repo first, then this instance can adopt
  them.

For repo setup and safety rules, see [CONTRIBUTING.md](CONTRIBUTING.md). For
private vulnerability reports, see [SECURITY.md](SECURITY.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase
(Postgres 17 + RLS) · MapLibre/OSM · Zod. Deployed on **Cloudflare Workers** via
OpenNext (`pnpm run deploy`).

## Docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — what the platform is, the privacy
  model, and the data model.
- **[docs/PLATFORM_INSTANCE.md](docs/PLATFORM_INSTANCE.md)** — how this repo
  relates to the generic Humanitarian Federation Platform.
- **[AGENTS.md](AGENTS.md)** — conventions, build/test commands, and the
  security/RLS/i18n patterns to follow when changing code (for humans and AI
  agents alike).
- **[docs/STATUS.md](docs/STATUS.md)** — what's shipped, launch gates, and the
  remaining-work backlog.
- **[docs/PUBLICATION_CHECKLIST.md](docs/PUBLICATION_CHECKLIST.md)** — final
  checks before flipping the GitHub repository to public.

## Privacy & safety

Precise coordinates and contact info are stored but **never** exposed publicly —
the public reads only fuzzed `*_public` views. Community damage reports and
responder placards are **coordination aids, not official certifications**; the UI
always directs users to Protección Civil / Bomberos for authoritative decisions.

## License

MIT. See [LICENSE](LICENSE).
