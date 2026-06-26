// Offline unit tests for the missing-person entity-resolution engine.
// Run: node lib/missing-persons.test.mjs
// Pure + deterministic — no network, no DB. Cases are drawn from REAL patterns
// in the desaparecidos feed (Andrés Poleo ×22, María Rodríguez over-merge,
// Ángel/Aris family surname, group photos) plus adversarial vetoes.
import assert from 'node:assert';
import {
  normalizeCedula, maskCedula, spanishPhonetic, detectMultiPerson,
  scoreRecords, clusterByDuplicateEdges, clusterDisplayStatus, clusterHasStatusConflict,
  weightedNameSimilarity, identificationTier, assessMissingRecordQuality,
} from './missing-persons.ts';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.message}`); } };
const R = (displayName, age, estado, municipio, extra = {}) =>
  ({ displayName, age, estado, municipio, cedulaNorm: null, photoPhash: null, isMultiPerson: false, ...extra });
const related = (a, b) => scoreRecords(a, b).related && scoreRecords(a, b).confidence !== 'review';

// ── normalizeCedula: V/E prefix is identity-significant (council guard) ──
t('cédula strips punctuation, keeps V prefix', () => assert.equal(normalizeCedula('V-8.765.432'), 'V8765432'));
t('cédula keeps E prefix', () => assert.equal(normalizeCedula('e8765432'), 'E8765432'));
t('cédula prefix-less kept', () => assert.equal(normalizeCedula('8765432'), '8765432'));
t('cédula rejects garbage', () => assert.equal(normalizeCedula('abc'), null));
t('maskCedula hides the digits', () => assert.equal(maskCedula('V-8.765.432'), 'V-••••••32'));

// ── phonetics ──
t('phonetic folds b/v', () => assert.equal(spanishPhonetic('blanco'), spanishPhonetic('vlanco')));
t('phonetic folds z/s', () => assert.equal(spanishPhonetic('gonzalez'), spanishPhonetic('gonsalez')));

// ── multi-person detection ──
t('multi-person: comma + y list', () => assert.equal(detectMultiPerson('José Pérez, Alicia Magallanes y Mathias Medina'), true));
t('multi-person: padre/hijo', () => assert.equal(detectMultiPerson('Javier Bermúdez (Padre) e Isrrael Bermúdez (Hijo)'), true));
t('single person is not multi', () => assert.equal(detectMultiPerson('Andrés Eduardo Poleo'), false));

// ── intake quality gate: garbage is quarantined before public/API search ──
const Q = (displayName, extra = {}) => assessMissingRecordQuality({
  displayName, age: 30, estado: 'La Guaira', municipio: 'Catia la Mar',
  sourceUrl: 'https://desaparecidosterremotovenezuela.com/1', ...extra,
});
t('quality accepts a normal linked identity record', () =>
  assert.equal(Q('Ana Julia Araujo Chacon').status, 'accepted'));
t('quality quarantines fictional/meme names', () => {
  const q = Q('Minion Dave', { age: 11 });
  assert.equal(q.status, 'needs_review');
  assert.ok(q.flags.includes('fictional_or_meme'));
});
t('quality quarantines initials-only records', () => {
  const q = Q('MG', { age: 80 });
  assert.equal(q.status, 'needs_review');
  assert.ok(q.flags.includes('initials_only'));
});
t('quality quarantines weak single-token records without a strong id', () => {
  const q = Q('Ana', { estado: null, municipio: null, age: null });
  assert.equal(q.status, 'needs_review');
  assert.ok(q.flags.includes('weak_identity'));
});
t('quality allows sparse names when a cédula confirms identity', () =>
  assert.equal(Q('Ana', { estado: null, municipio: null, cedulaNorm: 'V12345678' }).status, 'accepted'));
t('quality requires a source link-back', () => {
  const q = Q('Ana Julia Araujo Chacon', { sourceUrl: null });
  assert.equal(q.status, 'needs_review');
  assert.ok(q.flags.includes('missing_link_back'));
});

// ── TRUE duplicates must group ──
t('Guillermo Leon ~ Guillermo José León Blanco', () =>
  assert.ok(related(R('Guillermo Leon', null, 'La Guaira', 'Tanaguarena'), R('Guillermo José León Blanco', null, 'La Guaira', 'Tanaguarena'))));
t('Andres Poleo ~ Andrés Eduardo Poleo (real cluster)', () =>
  assert.ok(related(R('Andres Poleo', 24, 'La Guaira', 'x'), R('Andrés Eduardo Poleo', 23, 'La Guaira', 'x'))));
t('exact same name groups', () =>
  assert.ok(related(R('Rocío Andrea Osorio Chacon', null, 'La Guaira', 'Naiguata'), R('Rocío Andrea Osorio Chacon', null, 'La Guaira', 'Naiguata'))));

// ── FALSE merges must NOT happen (the hard part) ──
t('different María Rodríguez (common name, far age) do NOT merge', () =>
  assert.ok(!related(R('María Angélica Rodríguez', 50, 'Caracas', 'Caracas'), R('María del valle Rodríguez', 60, 'Caracas', 'Caracas'))));
t('family sharing distinctive surname (Ángel/Aris Gavidia) do NOT merge', () =>
  assert.ok(!related(R('Angel Velasquez Gavidia', 21, 'La Guaira', 'x'), R('Aris Libertad Gavidia Ferrer', 44, 'La Guaira', 'x'))));
t('single common given name does NOT group', () =>
  assert.ok(!related(R('María', null, 'Caracas', null), R('María González', null, 'Caracas', null))));
t('different surnames, same given name do NOT merge', () =>
  assert.ok(!related(R('José Pérez', 30, 'Caracas', 'C'), R('José García', 30, 'Caracas', 'C'))));
t('far ages veto', () =>
  assert.ok(!related(R('Pedro Gómez', 20, 'Aragua', 'M'), R('Pedro Gómez', 65, 'Aragua', 'M'))));

// ── cédula tier ──
t('same cédula → confirmed', () => {
  const r = scoreRecords(R('Ana Diaz', 25, 'Lara', null, { cedulaNorm: 'V8765432' }), R('Ana D.', null, 'Lara', null, { cedulaNorm: 'V8765432' }));
  assert.equal(r.confidence, 'confirmed');
});
t('different cédula → hard veto', () =>
  assert.ok(!related(R('Juan Perez', 30, 'C', null, { cedulaNorm: 'V12345678' }), R('Juan Perez', 30, 'C', null, { cedulaNorm: 'V87654321' }))));
t('V vs E same digits = different people', () =>
  assert.ok(!related(R('Ana Diaz', 25, 'Lara', null, { cedulaNorm: 'V8765432' }), R('Ana Diaz', 25, 'Lara', null, { cedulaNorm: 'E8765432' }))));
t('same cédula, clashing names → review (not silent confirm)', () => {
  const r = scoreRecords(R('Ana Diaz', 25, 'Lara', null, { cedulaNorm: 'V8765432' }), R('Pedro Gomez', 60, 'Lara', null, { cedulaNorm: 'V8765432' }));
  assert.equal(r.confidence, 'review');
});

// ── photo tier: same image groups, UNLESS distinct people share it ──
const PH = '2160c2c66c6ce9db';
t('same photo + same given name → confirmed', () => {
  const r = scoreRecords(R('Nerio', null, 'x', null, { photoPhash: PH }), R('Nerio Arias', 30, 'x', null, { photoPhash: PH }));
  assert.equal(r.confidence, 'confirmed');
});
t('same photo + different names → review (group photo), NOT a merge', () => {
  const r = scoreRecords(R('Jheremy Gonzalez', 22, 'x', 'y', { photoPhash: PH }), R('Anali Diaz', 17, 'x', 'y', { photoPhash: PH }));
  assert.equal(r.confidence, 'review');
  assert.ok(!(r.confidence !== 'review' && r.related)); // never a clustering edge
});

// ── weighted name similarity ranks distinctive > common ──
t('distinctive surname scores higher than common', () =>
  assert.ok(weightedNameSimilarity('Andres Poleo', 'Andres Poleo') > weightedNameSimilarity('Maria Rodriguez', 'Maria Elena Rodriguez')));

// ── clustering: union-find never loses a record ──
t('union-find groups one-directional edges, keeps singletons', () => {
  const rows = [
    { id: 'a', possible_duplicate_ids: ['b'] },
    { id: 'b', possible_duplicate_ids: [] },
    { id: 'c', possible_duplicate_ids: [] },
  ];
  const clusters = clusterByDuplicateEdges(rows);
  assert.equal(clusters.length, 2); // {a,b} and {c}
  const total = clusters.reduce((n, c) => n + c.length, 0);
  assert.equal(total, 3); // nothing lost
});

// ── cluster status: most-urgent member wins (life-safety) ──
t('cluster with any missing reads missing', () =>
  assert.equal(clusterDisplayStatus(['found_safe', 'missing', 'found_safe']), 'missing'));
t('deceased never overrides hopeful', () =>
  assert.equal(clusterDisplayStatus(['deceased', 'found_safe']), 'found_safe'));
t('mixed status flagged', () =>
  assert.ok(clusterHasStatusConflict(['missing', 'found_safe'])));

// ── identification tier ──
t('cedula_confirmed → identified', () => assert.equal(identificationTier({ cedula_confirmed: true }), 'identified'));
t('no cédula → approximate', () => assert.equal(identificationTier({ cedula_confirmed: false }), 'approximate'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
