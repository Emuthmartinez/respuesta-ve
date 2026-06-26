// GET /api/v1 — discovery (no auth). Points agents/partners at the spec.
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    name: 'Respuesta VE — Missing-Person Dedup & Matching API',
    version: '1.0.0',
    openapi: '/api/v1/openapi',
    endpoints: {
      score: 'POST /api/v1/score — pure scoring on caller-supplied records',
      match: 'POST /api/v1/match — match against the live federated index',
      ingest: 'POST /api/v1/persons — dedupe-on-ingest + federate (link-back required)',
      search: 'GET /api/v1/persons?q=&estado= — search the index',
    },
    auth: 'Authorization: Bearer <api-key>  (or x-api-key). Per-key rate limits; 429 + Retry-After when exceeded.',
    scopes: ['score', 'match', 'search', 'ingest'],
    pii_policy: 'Cédula and photo hashes are used only to find matches and are NEVER returned. Responses carry public metadata + link-backs only. Grouping is advisory; records are never destructively merged.',
  });
}
