# Respuesta VE — Dedup & Matching API

Externalizes the missing-person dedup engine so other registries and AI agents
can ask *"is this person already reported?"* and federate records as they ingest.

- **Base:** `https://respuestave.org/api/v1`
- **Spec:** `GET /api/v1/openapi` (OpenAPI 3.1) · **Discovery:** `GET /api/v1`
- **Auth:** `Authorization: Bearer <key>` (or `x-api-key`). Per-key rate limits →
  `429` + `Retry-After`. Remaining quota in `X-RateLimit-Remaining-Minute/Day`.
- **PII:** cédula and photo hashes are **match-only, never returned**. Responses
  carry only the public metadata the source registries already show, plus a
  link back to each source. The API never destructively merges records.
- **Status sync:** send `record.sourceUpdatedAt` when changing status. Older or
  untimestamped updates cannot overwrite a newer source status on an existing
  row, which keeps stale re-ingests from reopening or closing searches.
- **Quality gate:** suspicious intake (initials-only, placeholder/test names,
  fictional/meme names, missing link-backs, or weak identity records) is stored
  with `qualityStatus: "needs_review"` and excluded from public search/match
  until a coordinator accepts it.

## Endpoints

| Method | Path | Scope | Purpose |
|---|---|---|---|
| POST | `/score` | `score` | Pure scoring of a record vs. caller-supplied candidates (no DB). Full engine: cédula → photo → name+age+locality. |
| POST | `/match` | `match` | Match a record against the live federated index (name+age+locality). |
| POST | `/persons` | `ingest` | Dedupe-on-ingest: find matches, then federate the record (link-back required, idempotent per `source`+`externalId`). |
| GET | `/persons/status?externalId=` | `search` | Fetch your record plus duplicate/status signals from other accepted sources. |
| GET | `/persons/changes?since=` | `search` | Poll accepted public records changed since your last cursor. |
| GET | `/persons?q=&estado=` | `search` | Search the index. |

### Example — match

```bash
curl -s https://respuestave.org/api/v1/match \
  -H "Authorization: Bearer $RVK" -H 'Content-Type: application/json' \
  -d '{"record":{"name":"Andrés Poleo","estado":"La Guaira","age":24}}'
```

```json
{ "ok": true, "count": 1, "matches": [
  { "id": "…", "name": "Andrés Eduardo Poleo", "estado": "La Guaira",
    "status": "missing", "source": "desaparecidosterremotovenezuela",
    "externalUrl": "https://desaparecidosterremotovenezuela.com",
    "cedulaConfirmed": false, "clusterSize": 24,
    "score": 0.92, "method": "fuzzy", "confidence": "possible" } ] }
```

### Example — submit/update status

```bash
curl -s https://respuestave.org/api/v1/persons \
  -H "Authorization: Bearer $RVK" -H 'Content-Type: application/json' \
  -d '{
    "externalId":"site-b-123",
    "externalUrl":"https://site-b.example/personas/123",
    "record":{
      "name":"Andrés Poleo",
      "estado":"La Guaira",
      "status":"found_safe",
      "sourceUpdatedAt":"2026-06-26T18:30:00Z"
    }
  }'
```

### Example — reconcile your own row

```bash
curl -s "https://respuestave.org/api/v1/persons/status?externalId=site-b-123" \
  -H "Authorization: Bearer $RVK"
```

If another source has resolved a likely duplicate while your copy is still open,
`cluster.suggestedAction` returns `review_resolution`; do not auto-close without
human review unless your policy accepts that confidence.

### Example — incremental sync

```bash
curl -s "https://respuestave.org/api/v1/persons/changes?since=2026-06-26T00:00:00Z&limit=100" \
  -H "Authorization: Bearer $RVK"
```

## Issuing keys (coordinators)

Keys are generated client-side; only the SHA-256 hash is stored. Use the helper:

```bash
node scripts/api/issue-key.mjs "Venezuela Te Busca" --scopes score,match,search,ingest --source venezuelatebusca --per-min 120 --per-day 20000
```

It prints the plaintext key **once** and the `issue_api_key(...)` SQL/RPC call to
register the hash (run it as a coordinator). Store the key securely — it can't be
recovered, only revoked (`update partner_api_keys set revoked_at = now() where id=…`).

## MCP (agents)

A stdio MCP server in [`mcp-server/`](../../mcp-server) exposes `match_person`,
`score_persons`, `search_persons`, `submit_person`, `get_person_status`, and
`list_person_changes` over this API. See its README.
