// Integration tests for the partner API — hits the running server end-to-end:
// auth, scopes, validation, redaction, matching, ingest, rate limiting.
// Usage: API_BASE=http://localhost:3000/api/v1 node scripts/test/api-integration.mjs
import fs from 'node:fs';

const BASE = (process.env.API_BASE || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const KEYS = JSON.parse(fs.readFileSync('/tmp/test-keys.json', 'utf8'));
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name} ${extra}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, { key, body, query } = {}) {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, retryAfter: res.headers.get('Retry-After'), remMin: res.headers.get('X-RateLimit-Remaining-Minute') };
}

// ── discovery + spec (no auth) ──
ok('GET /openapi is public 200', (await req('GET', '/openapi')).status === 200);
ok('GET / discovery is public 200', (await req('GET', '')).status === 200);

// ── auth ──
ok('no key → 401', (await req('POST', '/score', { body: {} })).status === 401);
ok('bad key → 401', (await req('POST', '/score', { key: 'rvk_totally_bogus_key', body: {} })).status === 401);
ok('valid key, bad body → 400', (await req('POST', '/score', { key: KEYS.full, body: { nope: 1 } })).status === 400);

// ── scope enforcement ──
const scopeRes = await req('POST', '/match', { key: KEYS.limited, body: { record: { name: 'X' } } });
ok('score-only key on /match → 403 insufficient_scope', scopeRes.status === 403 && scopeRes.json?.error === 'insufficient_scope', JSON.stringify(scopeRes.json));

// ── score (pure) ──
const score = await req('POST', '/score', {
  key: KEYS.full,
  body: {
    record: { name: 'Andrés Poleo', estado: 'La Guaira', age: 24 },
    candidates: [{ name: 'Pedro Gómez' }, { name: 'Andrés Eduardo Poleo', estado: 'La Guaira', age: 23 }],
  },
});
ok('/score 200', score.status === 200);
ok('/score ranks the duplicate (index 1)', score.json?.matches?.[0]?.candidateIndex === 1, JSON.stringify(score.json));
ok('/score exposes rate-limit headers', score.remMin != null);

// ── match (live index) + REDACTION ──
const match = await req('POST', '/match', { key: KEYS.full, body: { record: { name: 'Andrés Poleo', estado: 'La Guaira' }, limit: 5 } });
ok('/match 200', match.status === 200);
ok('/match returns matches from the live index', (match.json?.matches?.length ?? 0) > 0, `count=${match.json?.count}`);
const matchBlob = JSON.stringify(match.json || {});
ok('/match response carries NO cédula-digit / phash fields', !/cedula_normalized|"cedula"|photo_phash|reporter_contact/.test(matchBlob));
ok('/match exposes link-back externalUrl', match.json?.matches?.some((m) => 'externalUrl' in m));
ok('/match exposes cedulaConfirmed badge (boolean)', match.json?.matches?.every((m) => typeof m.cedulaConfirmed === 'boolean'));

// ── search ──
const search = await req('GET', '/persons', { key: KEYS.full, query: { q: 'poleo', limit: 5 } });
ok('GET /persons search 200', search.status === 200 && (search.json?.results?.length ?? 0) >= 0);
ok('search requires q or estado → 400', (await req('GET', '/persons', { key: KEYS.full })).status === 400);

// ── ingest (idempotent) ──
const ingestBody = { record: { name: 'API Test Persona Zeta', estado: 'Lara', age: 40 }, externalId: 'apitest-zeta-1', externalUrl: 'https://example.test/zeta-1', source: 'other' };
const ing1 = await req('POST', '/persons', { key: KEYS.full, body: ingestBody });
ok('POST /persons ingest 200/201', ing1.status === 201 || ing1.status === 200, `status=${ing1.status} ${JSON.stringify(ing1.json)}`);
ok('ingest returns an id', !!ing1.json?.id);
const ing2 = await req('POST', '/persons', { key: KEYS.full, body: ingestBody });
ok('ingest is idempotent (same externalId → updated, same id)', ing2.json?.id === ing1.json?.id, `${ing1.json?.id} vs ${ing2.json?.id}`);
ok('ingest rejects missing externalUrl → 400', (await req('POST', '/persons', { key: KEYS.full, body: { record: { name: 'X' }, externalId: '1' } })).status === 400);

// SECURITY: cross-partner namespacing — same externalId on DIFFERENT keys must NOT collide
const cpBody = { record: { name: 'API Test CrossPartner' }, externalId: 'apitest-cp-shared', externalUrl: 'https://example.test/cp' };
const cpA = await req('POST', '/persons', { key: KEYS.full, body: cpBody });
const cpB = await req('POST', '/persons', { key: KEYS.ratelimit, body: cpBody });
ok('cross-partner: same externalId on different keys → DIFFERENT records (no overwrite)', cpA.json?.id && cpB.json?.id && cpA.json.id !== cpB.json.id, `${cpA.json?.id} vs ${cpB.json?.id}`);

// SECURITY: search enumeration guard — single-char q rejected
ok('single-char search q → 400 (enumeration guard)', (await req('GET', '/persons', { key: KEYS.full, query: { q: 'a' } })).status === 400);

// ── rate limiting (dedicated 3/min key) ──
let got429 = false, retryAfter = null;
for (let i = 0; i < 8; i++) {
  const r = await req('POST', '/score', { key: KEYS.ratelimit, body: { record: { name: 'A' }, candidates: [{ name: 'B' }] } });
  if (r.status === 429) { got429 = true; retryAfter = r.retryAfter; break; }
  await sleep(30);
}
ok('rate limit triggers 429 after the per-min budget', got429);
ok('429 carries Retry-After header', retryAfter != null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
