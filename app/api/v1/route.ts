// GET /api/v1 — discovery. Points agents/partners at the spec.
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    name: 'Respuesta VE — Humanitarian Federation API',
    version: '1.2.0',
    openapi: '/api/v1/openapi',
    endpoints: {
      score: 'POST /api/v1/score — pure scoring on caller-supplied records',
      match: 'POST /api/v1/match — match against the live federated index',
      ingest: 'POST /api/v1/persons — dedupe-on-ingest + federate (link-back required)',
      status: 'GET /api/v1/persons/status?externalId= — canonical status signals for your own record',
      changes: 'GET /api/v1/persons/changes?since= — changed accepted records for sync',
      search: 'GET /api/v1/persons?q=&estado= — search the index',
      entities: 'POST/GET /api/v1/entities — federate/search verified hospitals, shelters, orgs, needs, and channels',
      entityChanges: 'GET /api/v1/entities/changes?since= — changed verified crisis entities for sync',
      badge: 'GET /api/v1/badge?domain= — public partner verification badge lookup',
      publicIntake: 'POST /api/v1/public-intake — intake queue for JSON/text/CSV/url-list data that operators should review',
    },
    auth: 'Partner endpoints use Authorization: Bearer <api-key> (or x-api-key). See the OpenAPI spec for endpoint-specific access.',
    scopes: ['score', 'match', 'search', 'ingest'],
    pii_policy: 'Cédula and photo hashes are used only to find matches and are NEVER returned. Entity responses carry verified public metadata, fuzzed coordinates, needs, public channels, audience/country grouping, and link-backs only. Grouping is advisory; records are never destructively merged. Status sync is timestamp-aware to avoid stale overwrites.',
  });
}
