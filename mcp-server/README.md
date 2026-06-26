# Respuesta VE Dedup — MCP server

Exposes the [missing-person dedup/matching API](../scripts/api/README.md) as MCP
tools so AI agents can dedupe and federate records.

## Tools

- **`match_person`** — "is this person already reported?" → ranked matches with source link-backs.
- **`score_persons`** — score one record vs. a candidate list (pure; dedupe your own batch).
- **`search_persons`** — search the federated index by name / estado.
- **`submit_person`** — federate a record (dedupe-on-ingest; link-back required).
- **`get_person_status`** — reconcile your own `externalId` against accepted duplicate/status signals.
- **`list_person_changes`** — poll accepted records changed since your last sync cursor.

PII: cédula and photo hashes are match-only and never returned.

## Setup

```bash
cd mcp-server && npm install
```

Configure your MCP client (e.g. Claude Desktop / Code):

```json
{
  "mcpServers": {
    "respuesta-ve-dedup": {
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
