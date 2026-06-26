#!/usr/bin/env node
// Respuesta VE — humanitarian federation MCP server.
// Exposes the partner API as agent tools over stdio. Configure with env:
//   RVK_API_KEY   (required) partner API key (rvk_…)
//   RVK_API_BASE  (optional) default https://respuestave.org/api/v1
//
// PII note: this server forwards only what the API returns — cédula/photo are
// match-only and never come back. It never logs request bodies.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = (process.env.RVK_API_BASE || 'https://respuestave.org/api/v1').replace(/\/+$/, '');
const API_KEY = process.env.RVK_API_KEY;
if (!API_KEY) { console.error('RVK_API_KEY is required'); process.exit(1); }

async function call(method, path, { body, query } = {}) {
  const url = new URL(API_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { ok: false, error: 'bad_response', status: res.status, body: text.slice(0, 200) }; }
  if (res.status === 429) json = { ...json, hint: `Rate limited. Retry-After: ${res.headers.get('Retry-After') || '?'}s` };
  return json;
}
const result = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const PERSON = {
  name: z.string().describe('Full name as reported.'),
  age: z.number().int().min(0).max(130).optional(),
  estado: z.string().optional(),
  municipio: z.string().optional(),
  cedula: z.string().optional().describe('Venezuelan national ID — match-only, never returned.'),
  photoPhash: z.string().regex(/^[0-9a-fA-F]{16}$/).optional().describe('16-hex dHash of the photo.'),
  status: z.enum(['missing', 'found_safe', 'found_injured', 'deceased', 'unknown']).optional(),
  lastSeenAt: z.string().optional().describe('When the person was last seen.'),
  sourceUpdatedAt: z.string().optional().describe('Timestamp of this status/update in your source system.'),
};
const pickPerson = (a) => ({
  name: a.name,
  age: a.age,
  estado: a.estado,
  municipio: a.municipio,
  cedula: a.cedula,
  photoPhash: a.photoPhash,
  status: a.status,
  lastSeenAt: a.lastSeenAt,
  sourceUpdatedAt: a.sourceUpdatedAt,
});

const ENTITY_KINDS = [
  'hospital', 'clinic', 'field_clinic', 'shelter', 'donation_center', 'supply_hub',
  'pharmacy', 'water_point', 'official_channel', 'organization', 'community_group', 'other',
];
const NEED_CATEGORIES = [
  'medical_supplies', 'beds', 'blood', 'water', 'food', 'shelter', 'volunteers',
  'transport', 'fuel', 'power', 'communications', 'sanitation', 'funds', 'other',
];
const NEED_STATUSES = ['open', 'in_progress', 'fulfilled', 'cancelled', 'expired'];
const CHANNEL_TYPES = [
  'donation_url', 'volunteer_form', 'supply_dropoff', 'website', 'phone_public',
  'whatsapp_public', 'email_public', 'social', 'other',
];
const URGENCIES = ['critical', 'high', 'normal', 'low'];
const isTimestamp = (value) => Number.isFinite(Date.parse(value));
const httpUrl = (max) => z.string().url().max(max)
  .refine((value) => /^https?:\/\//i.test(value), 'must use http or https');

const CHANNEL = z.object({
  type: z.enum(CHANNEL_TYPES),
  label: z.string().max(120).optional(),
  url: httpUrl(500).optional(),
  displayText: z.string().max(200).optional(),
  instructions: z.string().max(500).optional(),
  isPrimary: z.boolean().optional(),
}).refine((v) => v.url || v.displayText, {
  message: 'url or displayText is required',
});
const NEED = z.object({
  category: z.enum(NEED_CATEGORIES).optional(),
  title: z.string().max(160),
  description: z.string().max(700).optional(),
  urgency: z.enum(URGENCIES).optional(),
  status: z.enum(NEED_STATUSES).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(60).optional(),
  expiresAt: z.string().refine(isTimestamp, 'must be a valid timestamp').optional(),
});
const ENTITY = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().max(200),
  description: z.string().max(900).optional(),
  estado: z.string().max(80).optional(),
  municipio: z.string().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().max(300).optional(),
  sourceUpdatedAt: z.string().refine(isTimestamp, 'must be a valid timestamp').optional(),
  channels: z.array(CHANNEL).max(20).optional(),
  needs: z.array(NEED).max(50).optional(),
}).refine((v) => (v.lat == null && v.lng == null) || (v.lat != null && v.lng != null), {
  message: 'lat and lng must be provided together',
});

const server = new McpServer({ name: 'respuesta-ve-federation', version: '1.1.0' });

server.registerTool('match_person', {
  description: 'Check whether a missing person is already in the Respuesta VE federated registry. Returns ranked matches (public metadata + source link-backs). Use before creating a new report to avoid duplicates.',
  inputSchema: { ...PERSON, limit: z.number().int().min(1).max(50).optional() },
}, async (a) => result(await call('POST', '/match', { body: { record: pickPerson(a), limit: a.limit ?? 20 } })));

server.registerTool('score_persons', {
  description: 'Score one record against a list of candidate records using the dedup engine (cédula → photo → name+age+locality). Pure — nothing is stored. Use to dedupe your own batch.',
  inputSchema: { record: z.object(PERSON), candidates: z.array(z.object(PERSON)).min(1).max(200) },
}, async (a) => result(await call('POST', '/score', { body: { record: a.record, candidates: a.candidates } })));

server.registerTool('search_persons', {
  description: 'Search the Respuesta VE federated missing-person index by name and/or estado. Returns redacted public records.',
  inputSchema: { q: z.string().optional(), estado: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
}, async (a) => result(await call('GET', '/persons', { query: { q: a.q, estado: a.estado, limit: a.limit ?? 20 } })));

server.registerTool('submit_person', {
  description: 'Federate a missing-person record into the shared index (dedupe-on-ingest). Requires a link back to your source record. Idempotent per (source, externalId). Never auto-merges.',
  inputSchema: { ...PERSON, externalId: z.string().describe('Your stable record id.'), externalUrl: z.string().url().describe('Link back to your record (required).'), source: z.enum(['venezuelatebusca', 'desaparecidosterremotovenezuela', 'desaparecidosvenezuela', 'pfif_feed', 'other']).optional() },
}, async (a) => result(await call('POST', '/persons', { body: { record: pickPerson(a), externalId: a.externalId, externalUrl: a.externalUrl, source: a.source ?? 'other' } })));

server.registerTool('get_person_status', {
  description: 'Get canonical status signals for a record you submitted earlier. Use when another site may have marked the same person found and your source needs to reconcile.',
  inputSchema: { externalId: z.string().describe('Your stable record id used with submit_person.') },
}, async (a) => result(await call('GET', '/persons/status', { query: { externalId: a.externalId } })));

server.registerTool('list_person_changes', {
  description: 'Poll accepted public missing-person records changed since a cursor. Use nextSince from the previous response as the next since value.',
  inputSchema: { since: z.string().describe('ISO timestamp cursor.'), limit: z.number().int().min(1).max(500).optional() },
}, async (a) => result(await call('GET', '/persons/changes', { query: { since: a.since, limit: a.limit ?? 100 } })));

server.registerTool('submit_entity', {
  description: 'Federate a verified crisis entity such as a hospital, shelter, supply hub, organization, public contribution channel, and current needs. Requires a sourceUrl link-back and stable externalId. Public exposure depends on coordinator verification or trusted-key auto-verification.',
  inputSchema: {
    entity: ENTITY,
    externalId: z.string().max(200).describe('Your stable source record id.'),
    sourceUrl: httpUrl(500).describe('Link back to the source entity record.'),
  },
}, async (a) => result(await call('POST', '/entities', {
  body: { entity: a.entity, externalId: a.externalId, sourceUrl: a.sourceUrl },
})));

server.registerTool('search_entities', {
  description: 'Search verified public crisis entities by text, kind, and/or estado. Returns fuzzed coordinates, public channels, active needs, and source link-backs.',
  inputSchema: {
    q: z.string().min(2).max(120).optional(),
    kind: z.enum(ENTITY_KINDS).optional(),
    estado: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
}, async (a) => result(await call('GET', '/entities', {
  query: { q: a.q, kind: a.kind, estado: a.estado, limit: a.limit ?? 25 },
})));

server.registerTool('list_entity_changes', {
  description: 'Poll verified public crisis entities changed since a cursor. Use nextSince from the previous response as the next since value.',
  inputSchema: { since: z.string().describe('ISO timestamp cursor.'), limit: z.number().int().min(1).max(500).optional() },
}, async (a) => result(await call('GET', '/entities/changes', {
  query: { since: a.since, limit: a.limit ?? 100 },
})));

server.registerTool('verify_badge', {
  description: 'Check whether a domain is verified by Respuesta VE as a federated partner. Use before displaying a partner badge.',
  inputSchema: { domain: z.string().min(3).max(253) },
}, async (a) => result(await call('GET', '/badge', { query: { domain: a.domain } })));

await server.connect(new StdioServerTransport());
