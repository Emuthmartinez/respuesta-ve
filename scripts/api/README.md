# Respuesta VE — Humanitarian Federation API

Externalizes the missing-person dedup engine and the verified coordination-entity
graph so other registries, websites, and AI agents can read/write through one
trusted backend instead of fragmenting into stale crisis data silos.

- **Base:** `https://respuestave.org/api/v1`
- **Spec:** `GET /api/v1/openapi` (OpenAPI 3.1) · **Discovery:** `GET /api/v1`
- **Auth:** `Authorization: Bearer <key>` (or `x-api-key`). Per-key rate limits →
  `429` + `Retry-After`. Remaining quota in `X-RateLimit-Remaining-Minute/Day`.
- **No-key dropbox:** `POST /api/v1/public-intake` accepts public JSON, text,
  CSV, URL-list leads, and small typed-file envelopes up to 5 MiB for restricted
  operator review. The receipt includes `statusUrl` for polling.
- **PII:** cédula and photo hashes are **match-only, never returned**. Missing
  person responses carry only the public metadata the source registries already
  show, plus a link back to each source. Entity responses carry verified public
  metadata, fuzzed coordinates, public contribution channels, active needs, and
  link-backs. The API never destructively merges records.
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
| POST | `/entities` | `ingest` | Federate hospitals, clinics, shelters, supply hubs, orgs, needs, and public channels. |
| GET | `/entities?q=&kind=&estado=` | `search` | Search verified crisis entities. |
| GET | `/entities/changes?since=` | `search` | Poll verified public entities changed since your last cursor. |
| POST | `/public-intake` | public | No-key review queue for any public lead/data shape. |
| GET | `/badge?domain=` | public | Check whether a domain is a verified federation partner. |

### Example — no-key public intake

Anyone can send a lead, URL list, scraped text, spreadsheet row, or arbitrary JSON
shape to the restricted review queue without an API key:

```bash
curl -X POST https://respuestave.org/api/v1/public-intake \
  -H 'content-type: application/json' \
  -d '{
    "source": "discord",
    "kind": "url_list",
    "data": ["https://example.org/report/123"],
    "note": "Any public lead or scrape target that operators should review"
  }'
```

The endpoint also accepts `text/plain` and `text/csv` bodies up to 5 MiB. It
returns only a receipt (`status: received_for_review`) plus `statusUrl`; raw
payloads, contact fields, notes, and URLs remain in the restricted operator queue
and are not published by the API.

Poll the returned `statusUrl` until `status` changes:

```bash
curl -s "https://respuestave.org/api/v1/public-intake?id=<receipt-id>"
```

Once operators promote a submission into canonical records, partners fetch the
normalized public data with cursor polling:

```bash
curl -s "https://respuestave.org/api/v1/persons/changes?since=2026-06-27T00:00:00Z" \
  -H "Authorization: Bearer $RVK"

curl -s "https://respuestave.org/api/v1/entities/changes?since=2026-06-27T00:00:00Z" \
  -H "Authorization: Bearer $RVK"
```

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

### Example — submit a crisis entity

Use this for hospitals, clinics, shelters, supply hubs, donation centers,
verified organizations, and official public channels. Public exposure requires
coordinator verification unless your key is explicitly marked for entity
auto-verification.

```bash
curl -s https://respuestave.org/api/v1/entities \
  -H "Authorization: Bearer $RVK" -H 'Content-Type: application/json' \
  -d '{
    "externalId":"hospital-central-123",
    "sourceUrl":"https://site-b.example/hospitales/123",
    "entity":{
      "kind":"hospital",
      "name":"Hospital Central",
      "description":"Hospital receiving earthquake injuries",
      "estado":"Lara",
      "municipio":"Barquisimeto",
      "lat":10.067,
      "lng":-69.347,
      "sourceUpdatedAt":"2026-06-26T18:30:00Z",
      "channels":[
        {"type":"website","url":"https://site-b.example/hospitales/123","isPrimary":true},
        {"type":"supply_dropoff","displayText":"Entrada de emergencias, 8am-6pm"}
      ],
      "needs":[
        {"category":"medical_supplies","title":"Gasas y solución salina","urgency":"high"},
        {"category":"blood","title":"Donantes O+","urgency":"critical","expiresAt":"2026-06-28T00:00:00Z"}
      ]
    }
  }'
```

The response returns the canonical entity id, whether the source row was inserted,
updated, or ignored as stale, and the verification status. Public reads show only
verified, unexpired entity projections.

### Example — search and sync entities

```bash
curl -s "https://respuestave.org/api/v1/entities?kind=hospital&estado=Lara&limit=25" \
  -H "Authorization: Bearer $RVK"

curl -s "https://respuestave.org/api/v1/entities/changes?since=2026-06-26T00:00:00Z&limit=100" \
  -H "Authorization: Bearer $RVK"
```

### Example — partner badge lookup

```bash
curl -s "https://respuestave.org/api/v1/badge?domain=site-b.example"
```

Verified badges are coordinator-managed on the partner key. A site cannot claim
badge trust by sending its own domain in an entity payload.

## Issuing keys (coordinators)

Keys are generated client-side; only the SHA-256 hash is stored. Use the helper:

```bash
node scripts/api/issue-key.mjs "Venezuela Te Busca" --scopes score,match,search,ingest --source venezuelatebusca --per-min 120 --per-day 20000
```

It prints the plaintext key **once** and the `issue_api_key(...)` SQL/RPC call to
register the hash (run it as a coordinator). Store the key securely — it can't be
recovered, only revoked (`update partner_api_keys set revoked_at = now() where id=…`).

Entity auto-verification, verified domains, and badge labels are coordinator-set
trust fields on `partner_api_keys`. Do not expose those settings to partners as
self-service request fields.

## MCP (agents)

A stdio MCP server in [`mcp-server/`](../../mcp-server) exposes `match_person`,
`score_persons`, `search_persons`, `submit_person`, `get_person_status`, and
`list_person_changes`, plus `submit_entity`, `search_entities`,
`list_entity_changes`, and `verify_badge` over this API. See its README.
