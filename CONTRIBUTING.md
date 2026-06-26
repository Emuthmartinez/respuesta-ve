# Contributing to Respuesta VE

Gracias for helping. This is crisis-response software, so the bar is simple:
move fast only when the change is safe for people using it under stress.

## Before opening an issue

- Do not post private contact info, precise coordinates, cedula values, raw
  photos of missing-person records, access tokens, or database details in a
  public issue.
- Use the collaboration template when you represent another registry, map, aid
  group, or responder workflow.
- Use the data/privacy template for public-data corrections, but keep sensitive
  details out of GitHub. Share only public link-backs or coarse location context.

## Local setup

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

The app can run without Supabase configured and will fall back to sample data.
If you need live data access, coordinate first; the public repo should not carry
service-role keys or personal operator details.

## Quality checks

Run the checks that match your change:

```bash
pnpm lint
pnpm typecheck
pnpm test:logic
pnpm build
```

The offline logic tests import TypeScript modules directly; use Node 22+ for
`pnpm test:logic`.

Database/RLS changes need rolled-back SQL tests and Supabase advisor review. See
`AGENTS.md` for the exact migration/RPC/security rules.

## Pull requests

- Keep PRs focused and describe the public-safety or coordination benefit.
- Preserve anonymous reporting; never add auth friction to life-safety reports.
- Public reads must use `*_public` views or already-redacted API responses.
- Citizen-submitted content is untrusted. Validate inputs and avoid silent
  success-shaped fallbacks.
- For Next.js code, read the relevant guide under `node_modules/next/dist/docs/`
  and mirror existing App Router patterns in this repo.

## Good first work

Good first issues are usually docs, translation, accessibility, API examples,
small UI polish, or adapters for public data sources with clear link-backs.
Anything that changes moderation, responder access, public privacy, or crisis
triage deserves design review before implementation.

## Platform vs instance work

Use this repo for Venezuela-specific app work: routes, copy, Supabase
migrations, moderation, responder workflows, and deployment. Use
`Emuthmartinez/humanitarian-federation-platform` for generic federation
contracts, reusable redaction/matching/trust helpers, badge semantics, and
multi-disaster instance guidance.
