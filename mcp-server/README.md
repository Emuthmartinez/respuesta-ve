# Respuesta VE Federation — MCP server

Exposes the [humanitarian federation API](../scripts/api/README.md) as MCP tools
so AI agents can dedupe missing-person records, federate crisis entities, sync
needs, and verify partner badges through the shared Respuesta VE backend.

## Tools

- **`match_person`** — "is this person already reported?" → ranked matches with source link-backs.
- **`score_persons`** — score one record vs. a candidate list (pure; dedupe your own batch).
- **`search_persons`** — search the federated index by name / estado.
- **`submit_person`** — federate a record (dedupe-on-ingest; link-back required).
- **`get_person_status`** — reconcile your own `externalId` against accepted duplicate/status signals.
- **`list_person_changes`** — poll accepted records changed since your last sync cursor.
- **`submit_entity`** — federate a hospital, shelter, supply hub, org, public channel, and active needs.
- **`search_entities`** — search verified public entities by text, kind, and/or estado.
- **`list_entity_changes`** — poll verified entities changed since your last sync cursor.
- **`verify_badge`** — check whether a domain is a verified federation partner.

PII: cédula and photo hashes are match-only and never returned. Entity tools
return only verified public projections: fuzzed coordinates, active needs, public
channels, and source link-backs.

## Setup

```bash
cd mcp-server && npm install
```

Configure your MCP client (e.g. Claude Desktop / Code):

```json
{
  "mcpServers": {
    "respuesta-ve-federation": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/index.mjs"],
      "env": {
        "RVK_API_KEY": "rvk_your_partner_key",
        "RVK_API_BASE": "https://respuestave.org/api/v1"
      }
    }
  }
}
```

Get a key from a Respuesta VE coordinator (`scripts/api/issue-key.mjs`).
Rate limits are per key; tool results surface `429` + retry hints.

Entity auto-verification, verified domains, and badge labels are coordinator-set
trust fields. Agent callers cannot self-verify a domain by including it in a
tool call.
