// Offline unit tests for the partner-API logic (no DB, no server).
// Run: node lib/api/api.test.mjs
import assert from 'node:assert';
import { redact, MISSING_STATUSES } from './redact.ts';
import { PersonInput, IngestRequest, CoordinationEntityInput, EntityQuery, EntityUpsertRequest, toMatchable } from './schemas.ts';
import { scoreAgainst } from './matching.ts';
import { summarizeStatus } from './status.ts';
import { normalizeDomain, redactEntity } from './entities.ts';
import { buildPublicIntakeSubmission } from './public-intake.ts';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.message}`); } };

// ── redaction: only public fields, never PII ──
const FULL_ROW = {
  id: 'r1', display_name: 'Ana Díaz', estado: 'Lara', municipio: 'Barquisimeto',
  status: 'missing', source: 'desaparecidosterremotovenezuela', external_url: 'https://x.test',
  age_estimate: 30, cedula_confirmed: true, cluster_id: 'c1', cluster_size: 3, is_multi_person: false,
  last_seen_at: null, source_updated_at: '2026-06-26T18:30:00Z', updated_at: '2026-06-26T18:31:00Z',
  // hostile extras that MUST NOT pass through:
  cedula_normalized: 'V12345678', photo_phash: '2160c2c66c6ce9db', reporter_contact: '0412-1234567', lat: 10.1, lng: -66.9,
};
t('redact exposes only the public shape', () => {
  const out = redact(FULL_ROW);
  assert.deepEqual(Object.keys(out).sort(), [
    'age', 'cedulaConfirmed', 'clusterId', 'clusterSize', 'estado', 'externalUrl',
    'id', 'isMultiPerson', 'lastSeenAt', 'municipio', 'name', 'source', 'sourceUpdatedAt',
    'status', 'updatedAt',
  ].sort());
});
t('redact never leaks cédula / phash / contact / coords', () => {
  const json = JSON.stringify(redact(FULL_ROW));
  for (const leak of ['V12345678', '2160c2c66c6ce9db', '0412-1234567', '10.1', '-66.9']) {
    assert.ok(!json.includes(leak), `leaked: ${leak}`);
  }
});
t('cedulaConfirmed is a boolean badge, not the number', () => {
  assert.strictEqual(redact(FULL_ROW).cedulaConfirmed, true);
});

// ── toMatchable: normalizes cédula (V/E), never echoes it ──
t('toMatchable normalizes cédula prefix', () => {
  assert.equal(toMatchable({ name: 'X', cedula: 'V-12.345.678' }).cedulaNorm, 'V12345678');
});
t('toMatchable computes multi-person from the name', () => {
  assert.equal(toMatchable({ name: 'A, B y C' }).isMultiPerson, true);
});

// ── schema validation: the first security layer ──
t('PersonInput requires a name', () => assert.equal(PersonInput.safeParse({ age: 5 }).success, false));
t('PersonInput rejects unknown keys (strict)', () =>
  assert.equal(PersonInput.safeParse({ name: 'X', evil: 1 }).success, false));
t('PersonInput rejects bad photoPhash', () =>
  assert.equal(PersonInput.safeParse({ name: 'X', photoPhash: 'nothex' }).success, false));
t('PersonInput rejects oversized name', () =>
  assert.equal(PersonInput.safeParse({ name: 'a'.repeat(500) }).success, false));
t('PersonInput accepts sourceUpdatedAt for status sync', () =>
  assert.equal(PersonInput.safeParse({ name: 'X', status: 'found_safe', sourceUpdatedAt: '2026-06-26T18:30:00Z' }).success, true));
t('IngestRequest requires a valid externalUrl', () =>
  assert.equal(IngestRequest.safeParse({ record: { name: 'X' }, externalId: '1', externalUrl: 'not-a-url' }).success, false));
t('IngestRequest accepts a valid record', () =>
  assert.equal(IngestRequest.safeParse({ record: { name: 'X' }, externalId: '1', externalUrl: 'https://x.test/1' }).success, true));

t('CoordinationEntityInput accepts a hospital with channel and need', () =>
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'hospital',
    name: 'Hospital Central',
    estado: 'Lara',
    lat: 10.067,
    lng: -69.347,
    sourceUpdatedAt: '2026-06-26T18:30:00Z',
    channels: [{ type: 'website', url: 'https://hospital.test', isPrimary: true }],
    needs: [{ category: 'medical_supplies', title: 'Gasas', urgency: 'high', expiresAt: '2026-06-28T00:00:00Z' }],
  }).success, true));
t('CoordinationEntityInput accepts outside-country acopio metadata', () => {
  const parsed = CoordinationEntityInput.safeParse({
    kind: 'donation_center',
    name: 'Centro de acopio Doral',
    estado: 'Estados Unidos',
    municipio: 'Doral, FL',
    audienceScope: 'outside_venezuela',
    countryCode: 'us',
    channels: [{ type: 'supply_dropoff', displayText: 'Recibe insumos medicos y agua' }],
    needs: [{ category: 'medical_supplies', title: 'Primeros auxilios' }],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.countryCode, 'US');
});
t('CoordinationEntityInput rejects invalid audience scope and country code', () => {
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'donation_center',
    name: 'Centro de acopio',
    audienceScope: 'global',
  }).success, false);
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'donation_center',
    name: 'Centro de acopio',
    countryCode: 'USA',
  }).success, false);
});
t('CoordinationEntityInput rejects lat without lng', () =>
  assert.equal(CoordinationEntityInput.safeParse({ kind: 'hospital', name: 'Hospital Central', lat: 10.067 }).success, false));
t('CoordinationEntityInput rejects lng without lat', () =>
  assert.equal(CoordinationEntityInput.safeParse({ kind: 'hospital', name: 'Hospital Central', lng: -69.347 }).success, false));
t('CoordinationEntityInput rejects channels without a public target', () =>
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'hospital', name: 'Hospital Central', channels: [{ type: 'website', label: 'Official' }],
  }).success, false));
t('CoordinationEntityInput rejects non-http channel URLs', () =>
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'hospital', name: 'Hospital Central', channels: [{ type: 'website', url: 'ftp://hospital.test' }],
  }).success, false));
t('CoordinationEntityInput rejects nonpositive need quantities', () =>
  assert.equal(CoordinationEntityInput.safeParse({
    kind: 'hospital', name: 'Hospital Central', needs: [{ category: 'medical_supplies', title: 'Gasas', quantity: -1 }],
  }).success, false));
t('CoordinationEntityInput rejects bad source timestamps', () =>
  assert.equal(CoordinationEntityInput.safeParse({ kind: 'hospital', name: 'Hospital Central', sourceUpdatedAt: 'not-a-date' }).success, false));
t('EntityUpsertRequest requires a valid sourceUrl', () =>
  assert.equal(EntityUpsertRequest.safeParse({
    externalId: 'hospital-1',
    entity: { kind: 'hospital', name: 'Hospital Central' },
    sourceUrl: 'not-a-url',
  }).success, false));
t('EntityUpsertRequest rejects non-http sourceUrl', () =>
  assert.equal(EntityUpsertRequest.safeParse({
    externalId: 'hospital-1',
    entity: { kind: 'hospital', name: 'Hospital Central' },
    sourceUrl: 'ftp://hospital.test/1',
  }).success, false));
t('EntityQuery accepts audience and country filters', () => {
  const parsed = EntityQuery.safeParse({ audienceScope: 'outside_venezuela', countryCode: 'us' });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.countryCode, 'US');
});

t('public intake accepts arbitrary data and extracts review hints', () => {
  const payload = {
    source: 'discord',
    kind: 'mixed',
    contact: '+58 412 000 0000',
    data: [{ url: 'https://example.org/report/1', note: 'Hospital needs water' }],
    tags: ['discord', 'urgent', 'urgent'],
  };
  const submission = buildPublicIntakeSubmission(payload, JSON.stringify(payload), 'application/json');
  assert.equal(submission.source, 'discord');
  assert.equal(submission.submissionKind, 'mixed');
  assert.equal(submission.contactPrivate, '+58 412 000 0000');
  assert.deepEqual(submission.urlsToReview, ['https://example.org/report/1']);
  assert.deepEqual(submission.tags, ['discord', 'urgent']);
  assert.ok(submission.warnings.includes('contact_stored_private'));
});

t('public intake preserves typed file envelopes for operator processing', () => {
  const payload = {
    source: 'mapa-emergencia-rescate',
    kind: 'entity',
    files: [{
      name: 'hospitales.csv',
      type: 'text/csv',
      text: 'name,state\nHospital Central,Lara',
    }],
  };
  const submission = buildPublicIntakeSubmission(payload, JSON.stringify(payload), 'application/json');
  assert.equal(submission.payloadFormat, 'json');
  assert.equal(submission.submissionKind, 'entity');
  assert.deepEqual(submission.tags, []);
  assert.equal(JSON.stringify(submission.payload).includes('hospitales.csv'), true);
});

t('public intake defaults unknown payloads into the review queue', () => {
  const body = 'lo vi en https://example.org/feed';
  const submission = buildPublicIntakeSubmission(body, body, 'text/plain');
  assert.equal(submission.source, 'anonymous-public-intake');
  assert.equal(submission.payloadFormat, 'url_list');
  assert.equal(submission.submissionKind, 'url_list');
  assert.deepEqual(submission.urlsToReview, ['https://example.org/feed']);
});

t('normalizeDomain canonicalizes verified partner domains', () => {
  assert.equal(normalizeDomain('https://www.Site-B.Example/path?q=1'), 'site-b.example');
  assert.equal(normalizeDomain('site-b.example/somewhere'), 'site-b.example');
});
t('normalizeDomain rejects invalid domains', () => {
  assert.equal(normalizeDomain('localhost:3000'), null);
  assert.equal(normalizeDomain('not a domain'), null);
});

t('redactEntity exposes only the public coordination entity shape', () => {
  const out = redactEntity({
    id: 'e1',
    entity_kind: 'hospital',
    name: 'Hospital Central',
    description: 'Open emergency intake',
    estado: 'Lara',
    municipio: 'Barquisimeto',
    lat: 10.067,
    lng: -69.347,
    source: 'other',
    source_url: 'https://hospital.test/1',
    last_verified_at: '2026-06-26T18:35:00Z',
    source_updated_at: '2026-06-26T18:30:00Z',
    created_at: '2026-06-26T18:31:00Z',
    updated_at: '2026-06-26T18:36:00Z',
    audience_scope: 'outside_venezuela',
    country_code: 'US',
    address: 'private base-table field',
    key_hash: 'secret',
    verification_notes: 'private note',
  }, [{
    id: 'c1',
    entity_id: 'e1',
    channel_type: 'website',
    label: 'Official',
    url: 'https://hospital.test/1',
    display_text: null,
    instructions: null,
    is_primary: true,
    source_updated_at: '2026-06-26T18:30:00Z',
    created_at: '2026-06-26T18:31:00Z',
    updated_at: '2026-06-26T18:36:00Z',
  }], [{
    id: 'n1',
    entity_id: 'e1',
    need_category: 'medical_supplies',
    title: 'Gasas',
    description: null,
    urgency: 'high',
    status: 'open',
    quantity: null,
    unit: null,
    source_updated_at: '2026-06-26T18:30:00Z',
    expires_at: '2026-06-28T00:00:00Z',
    created_at: '2026-06-26T18:31:00Z',
    updated_at: '2026-06-26T18:36:00Z',
  }]);
  assert.deepEqual(Object.keys(out).sort(), [
    'audienceScope', 'channels', 'countryCode', 'description', 'estado', 'id', 'kind', 'lastVerifiedAt', 'lat', 'lng',
    'municipio', 'name', 'needs', 'source', 'sourceUpdatedAt', 'sourceUrl', 'updatedAt',
  ].sort());
  assert.equal(out.audienceScope, 'outside_venezuela');
  assert.equal(out.countryCode, 'US');
  const json = JSON.stringify(out);
  for (const leak of ['private base-table field', 'secret', 'private note']) {
    assert.ok(!json.includes(leak), `leaked: ${leak}`);
  }
});

// ── scoreAgainst: engine ranking + vetoes apply ──
t('scoreAgainst ranks the real duplicate first, drops the impostor', () => {
  const rec = toMatchable({ name: 'Andrés Poleo', estado: 'La Guaira', age: 24 });
  const cands = [
    toMatchable({ name: 'Pedro Gómez', estado: 'Aragua' }),          // 0: unrelated
    toMatchable({ name: 'Andrés Eduardo Poleo', estado: 'La Guaira', age: 23 }), // 1: dup
    toMatchable({ name: 'Andrea Poleo', estado: 'La Guaira', age: 25 }),         // 2: diff given name
  ];
  const ranked = scoreAgainst(rec, cands);
  assert.ok(ranked.length >= 1, 'expected a match');
  assert.equal(ranked[0].index, 1, 'the real duplicate should rank first');
  assert.ok(!ranked.some((m) => m.index === 0), 'unrelated must not match');
  assert.ok(!ranked.some((m) => m.index === 2), 'different given name must not match');
});
t('different cédula vetoes even with same name', () => {
  const rec = toMatchable({ name: 'Juan Perez', cedula: 'V11111111' });
  const ranked = scoreAgainst(rec, [toMatchable({ name: 'Juan Perez', cedula: 'V22222222' })]);
  assert.equal(ranked.length, 0);
});

t('MISSING_STATUSES is the expected set', () =>
  assert.deepEqual([...MISSING_STATUSES], ['missing', 'found_safe', 'found_injured', 'deceased', 'unknown']));

t('summarizeStatus flags another-source resolution for an open own record', () => {
  const own = redact({ ...FULL_ROW, id: 'own', status: 'missing', source: 'other', updated_at: '2026-06-26T18:00:00Z' });
  const other = redact({ ...FULL_ROW, id: 'other', status: 'found_safe', source: 'venezuelatebusca', updated_at: '2026-06-26T18:10:00Z' });
  const summary = summarizeStatus([own, other], 'own');
  assert.equal(summary.status, 'missing');
  assert.equal(summary.hasConflict, true);
  assert.equal(summary.suggestedAction, 'review_resolution');
  assert.equal(summary.resolvedCount, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
