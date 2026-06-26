// Offline unit tests for the partner-API logic (no DB, no server).
// Run: node lib/api/api.test.mjs
import assert from 'node:assert';
import { redact, MISSING_STATUSES } from './redact.ts';
import { PersonInput, IngestRequest, toMatchable } from './schemas.ts';
import { scoreAgainst } from './matching.ts';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.message}`); } };

// ── redaction: only public fields, never PII ──
const FULL_ROW = {
  id: 'r1', display_name: 'Ana Díaz', estado: 'Lara', municipio: 'Barquisimeto',
  status: 'missing', source: 'desaparecidosterremotovenezuela', external_url: 'https://x.test',
  age_estimate: 30, cedula_confirmed: true, cluster_id: 'c1', cluster_size: 3, is_multi_person: false,
  last_seen_at: null,
  // hostile extras that MUST NOT pass through:
  cedula_normalized: 'V12345678', photo_phash: '2160c2c66c6ce9db', reporter_contact: '0412-1234567', lat: 10.1, lng: -66.9,
};
t('redact exposes only the public shape', () => {
  const out = redact(FULL_ROW);
  assert.deepEqual(Object.keys(out).sort(), [
    'age', 'cedulaConfirmed', 'clusterId', 'clusterSize', 'estado', 'externalUrl',
    'id', 'isMultiPerson', 'lastSeenAt', 'municipio', 'name', 'source', 'status',
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
t('toMatchable ignores caller-claimed isMultiPerson', () => {
  assert.equal(toMatchable({ name: 'A, B y C' }).isMultiPerson, false);
});

// ── schema validation: the first security layer ──
t('PersonInput requires a name', () => assert.equal(PersonInput.safeParse({ age: 5 }).success, false));
t('PersonInput rejects unknown keys (strict)', () =>
  assert.equal(PersonInput.safeParse({ name: 'X', evil: 1 }).success, false));
t('PersonInput rejects bad photoPhash', () =>
  assert.equal(PersonInput.safeParse({ name: 'X', photoPhash: 'nothex' }).success, false));
t('PersonInput rejects oversized name', () =>
  assert.equal(PersonInput.safeParse({ name: 'a'.repeat(500) }).success, false));
t('IngestRequest requires a valid externalUrl', () =>
  assert.equal(IngestRequest.safeParse({ record: { name: 'X' }, externalId: '1', externalUrl: 'not-a-url' }).success, false));
t('IngestRequest accepts a valid record', () =>
  assert.equal(IngestRequest.safeParse({ record: { name: 'X' }, externalId: '1', externalUrl: 'https://x.test/1' }).success, true));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
