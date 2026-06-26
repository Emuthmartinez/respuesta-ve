# Respuesta VE As A Platform Instance

Respuesta VE is the first deployed instance of the public Humanitarian
Federation Platform.

- Instance repo: `Emuthmartinez/respuesta-ve`
- Platform repo: `Emuthmartinez/humanitarian-federation-platform`
- Public site: `https://respuestave.org`
- Public API base: `https://respuestave.org/api/v1`
- Event id: `venezuela-earthquakes-2026`

## Boundary

| Responsibility | This repo | Platform repo |
|---|---|---|
| Venezuela-specific public app | Owns | References as example |
| Supabase migrations, RLS, RPCs | Owns | Documents patterns |
| Partner `/api/v1/*` deployment | Owns | Defines reusable contract |
| Redaction/matching/trust primitives | Proves in production | Owns generic package |
| Verified partner badge semantics | Implements | Defines |
| Multi-disaster roadmap | Contributes | Owns |

## Public Manifest

The root `federation.instance.json` file contains only public metadata. It is
safe to commit and safe for partner sites to read. Do not add credentials,
coordinator account details, private database ids, or incident-response contact
information to that file.

## Current Implementation

Respuesta VE currently implements:

- source-aware missing-person records and status sync
- candidate duplicate scoring and coordinator merge/split review
- coordination entities for hospitals, shelters, supply hubs, organizations,
  official channels, public channels, and needs
- verified partner badge lookups
- redacted public reads and private write paths

Generic changes should land in the platform repo first when they are not tied
to Venezuela-specific copy, routing, migrations, or operations.
