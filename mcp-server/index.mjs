#!/usr/bin/env node
// Respuesta VE — missing-person dedup/matching MCP server.
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
};
const pickPerson = (a) => ({ name: a.name, age: a.age, estado: a.estado, municipio: a.municipio, cedula: a.cedula, photoPhash: a.photoPhash, status: a.status });

const server = new McpServer({ name: 'respuesta-ve-dedup', version: '1.0.0' });

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

await server.connect(new StdioServerTransport());
