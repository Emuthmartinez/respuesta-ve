// GET /api/v1/openapi — the OpenAPI 3.1 contract. Agents and partners consume
// this to discover the dedup/matching API.
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const PERSON_INPUT = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200, description: 'Full name as reported.' },
    age: { type: 'integer', minimum: 0, maximum: 130, nullable: true },
    estado: { type: 'string', maxLength: 80, nullable: true },
    municipio: { type: 'string', maxLength: 120, nullable: true },
    cedula: { type: 'string', maxLength: 20, nullable: true, description: 'Venezuelan national ID. Used ONLY as a match key — never returned.' },
    photoPhash: { type: 'string', pattern: '^[0-9a-fA-F]{16}$', nullable: true, description: '16-hex dHash of the photo (computed by the caller).' },
    status: { type: 'string', enum: ['missing', 'found_safe', 'found_injured', 'deceased', 'unknown'], nullable: true },
    lastSeenAt: { type: 'string', maxLength: 40, nullable: true, description: 'When the person was last seen.' },
    sourceUpdatedAt: { type: 'string', maxLength: 40, nullable: true, description: 'Timestamp of this status/update in your source system. Existing rows only change status when this is newer.' },
  },
} as const;

const MATCH_OUT = {
  type: 'object',
  description: 'A redacted registry record — public metadata only. Never includes cédula digits, reporter contact, or photos.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', nullable: true },
    estado: { type: 'string', nullable: true },
    municipio: { type: 'string', nullable: true },
    status: { type: 'string' },
    source: { type: 'string' },
    externalUrl: { type: 'string', nullable: true, description: 'Link back to the source record.' },
    age: { type: 'integer', nullable: true },
    cedulaConfirmed: { type: 'boolean', description: 'Whether the record carries a (non-conflicting) cédula. The digits are never exposed.' },
    clusterId: { type: 'string', nullable: true },
    clusterSize: { type: 'integer' },
    isMultiPerson: { type: 'boolean' },
    lastSeenAt: { type: 'string', nullable: true },
    sourceUpdatedAt: { type: 'string', nullable: true },
    updatedAt: { type: 'string', nullable: true, description: 'Respuesta VE public-projection update time; use as the changes-feed cursor.' },
    score: { type: 'number', description: '0–1 match score vs the input.' },
    method: { type: 'string', enum: ['cedula', 'photo', 'fuzzy', 'cedula_conflict', 'cedula_typo', 'cedula_mismatch', 'photo_conflict', 'multi_person', 'none'] },
    confidence: { type: 'string', enum: ['confirmed', 'possible', 'review', 'none'] },
  },
} as const;

const STATUS_SUMMARY = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['missing', 'found_safe', 'found_injured', 'deceased', 'unknown'] },
    hasConflict: { type: 'boolean', description: 'True when the cluster mixes open and resolved source reports.' },
    size: { type: 'integer' },
    openCount: { type: 'integer' },
    resolvedCount: { type: 'integer' },
    suggestedAction: { type: 'string', enum: ['keep_search_open', 'review_resolution', 'mark_resolved', 'review_conflict'] },
    lastUpdatedAt: { type: 'string', nullable: true },
    sourceUpdatedAt: { type: 'string', nullable: true },
    sources: { type: 'array', items: { type: 'string' } },
  },
} as const;

const ENTITY_CHANNEL_INPUT = {
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  anyOf: [{ required: ['url'] }, { required: ['displayText'] }],
  properties: {
    type: { type: 'string', enum: ['donation_url', 'volunteer_form', 'supply_dropoff', 'website', 'phone_public', 'whatsapp_public', 'email_public', 'social', 'other'] },
    label: { type: 'string', maxLength: 120, nullable: true },
    url: { type: 'string', format: 'uri', pattern: '^https?://', maxLength: 500, nullable: true },
    displayText: { type: 'string', maxLength: 200, nullable: true },
    instructions: { type: 'string', maxLength: 500, nullable: true },
    isPrimary: { type: 'boolean', default: false },
  },
} as const;

const ENTITY_NEED_INPUT = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: ['medical_supplies', 'beds', 'blood', 'water', 'food', 'shelter', 'volunteers', 'transport', 'fuel', 'power', 'communications', 'sanitation', 'funds', 'other'], default: 'other' },
    title: { type: 'string', maxLength: 160 },
    description: { type: 'string', maxLength: 700, nullable: true },
    urgency: { type: 'string', enum: ['critical', 'high', 'normal', 'low'], default: 'normal' },
    status: { type: 'string', enum: ['open', 'in_progress', 'fulfilled', 'cancelled', 'expired'], default: 'open' },
    quantity: { type: 'number', exclusiveMinimum: 0, nullable: true },
    unit: { type: 'string', maxLength: 60, nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

const ENTITY_CHANNEL_OUT = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string' },
    label: { type: 'string', nullable: true },
    url: { type: 'string', format: 'uri', nullable: true },
    displayText: { type: 'string', nullable: true },
    instructions: { type: 'string', nullable: true },
    isPrimary: { type: 'boolean' },
    sourceUpdatedAt: { type: 'string', nullable: true },
    updatedAt: { type: 'string' },
  },
} as const;

const ENTITY_NEED_OUT = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    category: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    urgency: { type: 'string' },
    status: { type: 'string' },
    quantity: { type: 'number', nullable: true },
    unit: { type: 'string', nullable: true },
    sourceUpdatedAt: { type: 'string', nullable: true },
    expiresAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const ENTITY_AUDIENCE_SCOPES = ['in_venezuela', 'outside_venezuela', 'both'] as const;

const ENTITY_INPUT = {
  type: 'object',
  required: ['kind', 'name'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['hospital', 'clinic', 'field_clinic', 'shelter', 'donation_center', 'supply_hub', 'pharmacy', 'water_point', 'official_channel', 'organization', 'community_group', 'other'] },
    name: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 900, nullable: true },
    estado: { type: 'string', maxLength: 80, nullable: true },
    municipio: { type: 'string', maxLength: 120, nullable: true },
    audienceScope: { type: 'string', enum: ENTITY_AUDIENCE_SCOPES, nullable: true, description: 'Whether the resource serves people in Venezuela, outside Venezuela, or both.' },
    countryCode: { type: 'string', minLength: 2, maxLength: 2, nullable: true, description: 'ISO-3166 alpha-2 country code for cross-border resources such as USA acopio.' },
    lat: { type: 'number', minimum: -90, maximum: 90, nullable: true, description: 'Stored precise; public responses are fuzzed.' },
    lng: { type: 'number', minimum: -180, maximum: 180, nullable: true, description: 'Stored precise; public responses are fuzzed.' },
    address: { type: 'string', maxLength: 300, nullable: true, description: 'Coordinator-only base-table field; not returned by the public API.' },
    sourceUpdatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Timestamp in the partner source. Older updates are ignored.' },
    channels: { type: 'array', maxItems: 20, items: ENTITY_CHANNEL_INPUT, default: [] },
    needs: { type: 'array', maxItems: 50, items: ENTITY_NEED_INPUT, default: [] },
  },
} as const;

const ENTITY_OUT = {
  type: 'object',
  description: 'Verified public crisis entity with fuzzed coordinates, public contribution channels, and active needs.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    kind: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    estado: { type: 'string', nullable: true },
    municipio: { type: 'string', nullable: true },
    lat: { type: 'number', nullable: true },
    lng: { type: 'number', nullable: true },
    source: { type: 'string' },
    sourceUrl: { type: 'string', format: 'uri' },
    lastVerifiedAt: { type: 'string', nullable: true },
    sourceUpdatedAt: { type: 'string', nullable: true },
    updatedAt: { type: 'string' },
    audienceScope: { type: 'string', enum: ENTITY_AUDIENCE_SCOPES, nullable: true },
    countryCode: { type: 'string', nullable: true },
    channels: { type: 'array', items: ENTITY_CHANNEL_OUT },
    needs: { type: 'array', items: ENTITY_NEED_OUT },
  },
} as const;

const PUBLIC_INTAKE_REQUEST = {
  description: 'Any JSON value or raw text/CSV/url-list payload. Operators review this restricted queue before creating canonical records. Recommended JSON wrappers may include sourceRecordId, contentFingerprint, processingHints, and canonicalCandidates so operators can dedupe/clean and promote via /persons or /entities without losing source provenance.',
  oneOf: [
    { type: 'object', additionalProperties: true },
    { type: 'array', items: true },
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
  ],
} as const;

const PUBLIC_INTAKE_RECEIPT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: true },
    id: { type: 'string', format: 'uuid' },
    eventId: { type: 'string' },
    source: { type: 'string' },
    status: { type: 'string', enum: ['received_for_review', 'triaged', 'promoted', 'ignored', 'spam'] },
    submittedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    payloadFormat: { type: 'string', enum: ['json', 'csv', 'url_list', 'text', 'unknown'] },
    submissionKind: { type: 'string', enum: ['person', 'entity', 'need', 'status', 'media', 'url_list', 'mixed', 'unknown'] },
    payloadSizeChars: { type: 'integer' },
    urlCount: { type: 'integer' },
    warnings: { type: 'array', items: { type: 'string' } },
    recommendedAction: { type: 'string', enum: ['operator_triage', 'scrape_urls', 'review_person', 'review_entity', 'review_need', 'ignore'] },
    processedAt: { type: 'string', format: 'date-time', nullable: true },
    processedRecord: { type: 'object', nullable: true },
    publicReviewNote: { type: 'string', nullable: true },
    pollAfterSeconds: { type: 'integer', nullable: true },
    statusUrl: { type: 'string', format: 'uri' },
    message: { type: 'string' },
    disclosure: { type: 'string', enum: ['restricted_unverified_public_submission'] },
  },
} as const;

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Respuesta VE — Humanitarian Federation API',
    version: '1.1.0',
    description:
      'Match and deduplicate missing-person records, and federate verified crisis entities for the 2026 Venezuela earthquake response. ' +
      'PII policy: cédula and photo hashes are used only to FIND matches and are never returned; responses carry only the ' +
      'public metadata the source registries already show, plus a link back to each source. Entity responses expose only verified ' +
      'public data: fuzzed coordinates, active needs, public contribution channels, and cross-border audience/country grouping where reviewed. Grouping is advisory — the API never destructively merges records. ' +
      'Status/entity sync is timestamp-aware: older partner updates cannot overwrite newer source status. Intake quality is also gated.',
    contact: { name: 'Respuesta VE', url: 'https://respuestave.org' },
    license: { name: 'Humanitarian use', url: 'https://respuestave.org' },
  },
  servers: [{ url: 'https://respuestave.org/api/v1' }, { url: 'https://respuesta-ve.e-muth-martinez.workers.dev/api/v1' }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'http', scheme: 'bearer', description: 'Partner API key: `Authorization: Bearer rvk_…` (or `x-api-key`). Per-key rate limits apply (HTTP 429 with Retry-After). Scopes: score, match, search, ingest.' },
    },
    schemas: {
      PersonInput: PERSON_INPUT,
      Match: MATCH_OUT,
      StatusSummary: STATUS_SUMMARY,
      EntityInput: ENTITY_INPUT,
      EntityChannel: ENTITY_CHANNEL_OUT,
      EntityNeed: ENTITY_NEED_OUT,
      Entity: ENTITY_OUT,
      PublicIntakeRequest: PUBLIC_INTAKE_REQUEST,
      PublicIntakeReceipt: PUBLIC_INTAKE_RECEIPT,
    },
    responses: {
      Unauthorized: { description: 'Missing/invalid key, or insufficient scope.' },
      RateLimited: { description: 'Per-key rate limit exceeded. See Retry-After.' },
      Invalid: { description: 'Validation failed.' },
    },
  },
  paths: {
    '/score': {
      post: {
        summary: 'Score a record against caller-supplied candidates (pure, no DB).',
        description: 'Runs the full engine (cédula → photo → name+age+locality). Use to dedupe your OWN batch before ingest.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['record', 'candidates'], properties: {
              record: { $ref: '#/components/schemas/PersonInput' },
              candidates: { type: 'array', minItems: 1, maxItems: 200, items: { $ref: '#/components/schemas/PersonInput' } },
            },
          } } },
        },
        responses: { '200': { description: 'Ranked candidate matches (by index).' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/match': {
      post: {
        summary: 'Match a record against the live federated index.',
        description: '"Is this person already reported?" Returns ranked redacted matches with link-backs. Index matching uses name + age + locality.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['record'], properties: {
            record: { $ref: '#/components/schemas/PersonInput' },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        } } } },
        responses: { '200': { description: 'matches: array of Match.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/persons': {
      post: {
        summary: 'Dedupe-on-ingest: federate a record into the shared index.',
        description: 'Finds likely matches, then stores via the controlled federation path (link-back required; consent/photo forced off). Idempotent per API key + externalId. Never auto-merges. Exact cédula/photo matches create advisory edges inside the DB. Low-quality records return qualityStatus="needs_review" and stay out of public search until a coordinator accepts them. Use record.sourceUpdatedAt when changing status so stale source data cannot overwrite a newer update.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['record', 'externalId', 'externalUrl'], properties: {
            record: { $ref: '#/components/schemas/PersonInput' },
            externalId: { type: 'string', maxLength: 200, description: 'Your stable id (idempotency key).' },
            externalUrl: { type: 'string', format: 'uri', maxLength: 500, description: 'Link back to the source record (REQUIRED).' },
            source: { type: 'string', description: 'IGNORED — source attribution is determined by your API key (set by a coordinator), so partners cannot impersonate a registry. Records are namespaced per key.', deprecated: true },
          },
        } } } },
        responses: { '201': { description: 'Inserted and public-search eligible.' }, '202': { description: 'Stored but held for quality review; response includes qualityStatus and qualityFlags.' }, '200': { description: 'Updated (existing externalId).' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
      get: {
        summary: 'Search the federated index (name + optional estado).',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name substring.' },
          { name: 'estado', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: { '200': { description: 'results: array of redacted records.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/persons/status': {
      get: {
        summary: 'Get the canonical status signals for your own external record.',
        description: 'Looks up the record namespaced to your API key and externalId, then returns its accepted duplicate/status signals. If another source reports the same person as found while your source remains open, cluster.suggestedAction becomes review_resolution.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'externalId', in: 'query', required: true, schema: { type: 'string', maxLength: 200 }, description: 'Your stable record id used in POST /persons.' },
        ],
        responses: { '200': { description: 'record, qualityStatus, cluster StatusSummary, and members.' }, '404': { description: 'No record for this API key + externalId.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/persons/changes': {
      get: {
        summary: 'Poll accepted public records changed since a cursor.',
        description: 'Use this to keep downstream sites current without scraping. Pass the previous nextSince value as since; responses are public-safe records ordered by updatedAt.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'since', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
        ],
        responses: { '200': { description: 'results plus nextSince cursor.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/entities': {
      post: {
        summary: 'Federate a verified crisis entity with current needs and public contribution channels.',
        description: 'Use for hospitals, clinics, shelters, supply hubs, vetted orgs, and official channels. Partners provide a sourceUrl link-back and stable externalId. Public exposure requires coordinator verification or an API key marked entity_auto_verify.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['entity', 'externalId', 'sourceUrl'], properties: {
            entity: { $ref: '#/components/schemas/EntityInput' },
            externalId: { type: 'string', maxLength: 200 },
            sourceUrl: { type: 'string', format: 'uri', pattern: '^https?://', maxLength: 500 },
          },
        } } } },
        responses: { '201': { description: 'Inserted.' }, '200': { description: 'Updated or stale_ignored.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
      get: {
        summary: 'Search verified crisis entities.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name/description substring.' },
          { name: 'kind', in: 'query', schema: { type: 'string' } },
          { name: 'estado', in: 'query', schema: { type: 'string' } },
          { name: 'audienceScope', in: 'query', schema: { type: 'string', enum: ENTITY_AUDIENCE_SCOPES } },
          { name: 'countryCode', in: 'query', schema: { type: 'string', minLength: 2, maxLength: 2 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: { '200': { description: 'results: array of Entity.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/entities/changes': {
      get: {
        summary: 'Poll verified crisis entities changed since a cursor.',
        description: 'Use this to keep downstream hospital/org/needs surfaces current without scraping.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'since', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
        ],
        responses: { '200': { description: 'results plus nextSince cursor.' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/public-intake': {
      get: {
        summary: 'Explain the public intake queue or poll receipt status.',
        description: 'Without id, returns help payload with limits and an example. With id, returns a receipt-safe processing status.',
        security: [],
        parameters: [
          { name: 'id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Receipt id from POST /public-intake.' },
        ],
        responses: { '200': { description: 'Endpoint help or PublicIntakeReceipt.' }, '404': { description: 'Receipt not found.' } },
      },
      post: {
        summary: 'Submit any public lead/data shape for restricted operator review.',
        description: 'Use this when a volunteer, Discord community, scraper, or partner needs to send data for restricted operator review. The raw payload is stored in a restricted queue. Include sourceRecordId/contentFingerprint/canonicalCandidates when available; operators use those restricted hints for dedupe and cleanup, then promote through /persons or /entities. The response is only a receipt; nothing is public or canonical until reviewed.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublicIntakeRequest' },
              examples: {
                typedEntityCandidate: {
                  summary: 'Typed candidate ready for restricted cleanup and entity promotion',
                  value: {
                    eventId: 'venezuela-earthquakes-2026',
                    source: 'mapa-emergencia-rescate',
                    sourceRecordId: 'mapa-emergencia-rescate:hospital:123',
                    contentFingerprint: 'sha256:...',
                    kind: 'entity',
                    audienceScope: 'in_venezuela',
                    processingHints: {
                      dedupeMode: 'candidate_review_not_auto_merge',
                      promotionPath: '/api/v1/entities',
                      cleanupPipeline: ['normalize_entity', 'dedupe_entity_by_name_area', 'operator_promote_safe_records'],
                    },
                    canonicalCandidates: [{
                      kind: 'entity',
                      externalId: 'mapa-emergencia-rescate:hospital:123',
                      sourceUrl: 'https://terremotovenezuela.app/hospitales/hospital-central',
                      entity: {
                        kind: 'hospital',
                        name: 'Hospital Central',
                        estado: 'Lara',
                        municipio: 'Barquisimeto',
                        audienceScope: 'in_venezuela',
                        countryCode: 'VE',
                        needs: [{ category: 'medical_supplies', title: 'Gasas', urgency: 'high' }],
                      },
                    }],
                  },
                },
              },
            },
            'text/plain': { schema: { type: 'string', maxLength: 5242880 } },
            'text/csv': { schema: { type: 'string', maxLength: 5242880 } },
          },
        },
        responses: {
          '202': { description: 'Received for review.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicIntakeReceipt' } } } },
          '400': { $ref: '#/components/responses/Invalid' },
          '413': { description: 'Payload over 5 MiB.' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/badge': {
      get: {
        summary: 'Public verification badge lookup by domain.',
        description: 'Sites can render this to show their domain is verified by Respuesta VE as a federated partner.',
        security: [],
        parameters: [
          { name: 'domain', in: 'query', required: true, schema: { type: 'string', maxLength: 253 } },
        ],
        responses: { '200': { description: 'verified true/false plus partner badge metadata when verified.' }, '400': { $ref: '#/components/responses/Invalid' } },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(SPEC, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
