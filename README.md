# Respuesta VE

A Spanish-first, mobile-first crisis-response PWA for the June 2026 Venezuela
earthquakes — the **damage-map + coordination layer** other tools lack:
crowdsourced building-damage reports, an inspection-request → claim → ATC-20
placard flow for verified responders, a federated missing-persons search, a
donation directory, a skills↔needs marketplace, and a misinformation board.

Live: **[respuestave.org](https://respuestave.org)**

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase keys + REPORT_IP_SALT
pnpm dev                           # http://localhost:3000
```

The app runs without Supabase configured (it falls back to sample data), so you
can start the dev server before provisioning.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase
(Postgres 17 + RLS) · MapLibre/OSM · Zod. Deployed on **Cloudflare Workers** via
OpenNext (`pnpm run deploy`).

## Docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — what the platform is, the privacy
  model, and the data model.
- **[AGENTS.md](AGENTS.md)** — conventions, build/test commands, and the
  security/RLS/i18n patterns to follow when changing code (for humans and AI
  agents alike).
- **[docs/STATUS.md](docs/STATUS.md)** — what's shipped, launch gates, and the
  remaining-work backlog.

## Privacy & safety

Precise coordinates and contact info are stored but **never** exposed publicly —
the public reads only fuzzed `*_public` views. Community damage reports and
responder placards are **coordination aids, not official certifications**; the UI
always directs users to Protección Civil / Bomberos for authoritative decisions.
