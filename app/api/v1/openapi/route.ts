// GET /api/v1/openapi — the OpenAPI 3.1 contract (no auth). Agents and partners
// consume this to discover the dedup/matching API.
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
    lastSeenAt: { type: 'string', maxLength: 40, nullable: true },
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
    score: { type: 'number', description: '0–1 match score vs the input.' },
    method: { type: 'string', enum: ['cedula', 'photo', 'fuzzy', 'cedula_conflict', 'photo_conflict', 'multi_person', 'none'] },
    confidence: { type: 'string', enum: ['confirmed', 'possible', 'review', 'none'] },
  },
} as const;

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Respuesta VE — Missing-Person Dedup & Matching API',
    version: '1.0.0',
    description:
      'Match and deduplicate missing-person records against a federated index for the 2026 Venezuela earthquake response. ' +
      'PII policy: cédula and photo hashes are used only to FIND matches and are never returned; responses carry only the ' +
      'public metadata the source registries already show, plus a link back to each source. Grouping is advisory — the API ' +
      'never destructively merges records.',
    contact: { name: 'Respuesta VE', url: 'https://respuestave.org' },
    license: { name: 'Humanitarian use', url: 'https://respuestave.org' },
  },
  servers: [{ url: 'https://respuestave.org/api/v1' }, { url: 'https://respuesta-ve.e-muth-martinez.workers.dev/api/v1' }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'http', scheme: 'bearer', description: 'Partner API key: `Authorization: Bearer rvk_…` (or `x-api-key`). Per-key rate limits apply (HTTP 429 with Retry-After). Scopes: score, match, search, ingest.' },
    },
    schemas: { PersonInput: PERSON_INPUT, Match: MATCH_OUT },
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
        description: 'Finds likely matches, then stores via the controlled federation path (link-back required; consent/photo forced off). Idempotent per (source, externalId). Never auto-merges.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['record', 'externalId', 'externalUrl'], properties: {
            record: { $ref: '#/components/schemas/PersonInput' },
            externalId: { type: 'string', maxLength: 200, description: 'Your stable id (idempotency key).' },
            externalUrl: { type: 'string', format: 'uri', maxLength: 500, description: 'Link back to the source record (REQUIRED).' },
            source: { type: 'string', description: 'IGNORED — source attribution is determined by your API key (set by a coordinator), so partners cannot impersonate a registry. Records are namespaced per key.', deprecated: true },
          },
        } } } },
        responses: { '201': { description: 'Inserted.' }, '200': { description: 'Updated (existing externalId).' }, '401': { $ref: '#/components/responses/Unauthorized' }, '400': { $ref: '#/components/responses/Invalid' }, '429': { $ref: '#/components/responses/RateLimited' } },
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
  },
} as const;

export function GET() {
  return NextResponse.json(SPEC, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
