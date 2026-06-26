# Respuesta VE ingest worker

Separate Cloudflare Worker for scheduled damage-lead ingestion. It is not part
of the main Next.js deploy.

## Required bindings

- `DEDUP` - KV namespace binding in `wrangler.jsonc`.
- `SUPABASE_URL` - runtime env value for the target Supabase project.
- `SUPABASE_ANON_KEY` - runtime env value; RLS/RPCs still enforce privilege.
- `RUN_TOKEN` - secret for the manual `/run?token=...` endpoint.
- `X_BEARER` - optional secret for X scanning, currently disabled unless set.

## Local development

Create `ingest-worker/.dev.vars` locally. It is ignored by git.

```sh
SUPABASE_URL=
SUPABASE_ANON_KEY=
RUN_TOKEN=
X_BEARER=
```

## Production configuration

Keep live values out of the repo. Set them in Cloudflare before deploying:

```sh
cd ingest-worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put RUN_TOKEN
wrangler secret put X_BEARER # optional
```

If the team chooses to store `SUPABASE_URL` or `SUPABASE_ANON_KEY` as non-secret
Cloudflare vars instead, keep the live values in the dashboard/environment and
not in tracked `wrangler.jsonc`.
