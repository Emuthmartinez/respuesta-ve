# Respuesta VE ingest worker

Separate Cloudflare Worker for scheduled damage-lead ingestion. It is not part
of the main Next.js deploy.

**Always-on hourly ingestion** (`cron: 0 * * * *`). Sources:
- **GDELT** news (no key).
- **xpoz social** — Twitter keyword scan via the xpoz MCP server over plain
  HTTPS (`mcp.xpoz.ai/mcp`, Bearer auth); active only when `XPOZ_ACCESS_KEY` is
  set. This is the laptop-independent equivalent of the Mac orchestrator's
  social leg (`.claude/skills/respuesta-ingest/scripts/social.mjs`).

All leads insert as `moderation_status='pending'` for coordinator review. The
Worker is the always-on *baseline*; the Mac orchestrator adds video, the LLM
judge, and the fast-lane auto-publish when the laptop is awake.

Verify: `GET /debug` → `{news_items, social_items, xpoz_key_set, ...}`.

## Required bindings

- `DEDUP` - KV namespace binding in `wrangler.jsonc`.
- `SUPABASE_URL` - runtime env value for the target Supabase project.
- `SUPABASE_ANON_KEY` - runtime env value; RLS/RPCs still enforce privilege.
- `RUN_TOKEN` - secret for the manual `/run?token=...` endpoint.
- `XPOZ_ACCESS_KEY` - secret enabling the social scan. The durable, non-expiring
  xpoz access key (xpoz dashboard, or `getUserAccessKey`). Without it, only
  GDELT runs. Set with `wrangler secret put XPOZ_ACCESS_KEY`.
- `X_BEARER` - optional secret for the legacy X API v2 path, disabled unless set.

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
wrangler secret put XPOZ_ACCESS_KEY # enables the social scan
wrangler secret put X_BEARER        # optional, legacy X API path
```

If the team chooses to store `SUPABASE_URL` or `SUPABASE_ANON_KEY` as non-secret
Cloudflare vars instead, keep the live values in the dashboard/environment and
not in tracked `wrangler.jsonc`.
