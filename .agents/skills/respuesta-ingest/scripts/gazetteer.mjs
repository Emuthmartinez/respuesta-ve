/**
 * gazetteer.mjs — place-name gazetteer for the Venezuela 2026 earthquake response pipeline.
 *
 * Ported + extended from ingest-worker/src/index.ts (GAZ, norm, matchPlaces).
 * Extensions: La Candelaria, Los Corales, Tanaguarena, Caraballeda (parroquia-level),
 *             San Bernardino (already present in worker), plus named-building extraction.
 *
 * @typedef {{ names:string[], estado:string, municipio:string, parroquia:string|null, lat:number, lng:number }} GazEntry
 */

/**
 * Full gazetteer. Entries are sorted longest-name-first inside matchPlaces so that
 * "los corales" beats "la guaira" when both strings appear in the same text.
 * @type {GazEntry[]}
 */
export const GAZ = [
  // ── Distrito Capital / Libertador ────────────────────────────────────────
  { names: ['la candelaria', 'candelaria'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'La Candelaria', lat: 10.508, lng: -66.902 },
  { names: ['san bernardino'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'San Bernardino', lat: 10.516, lng: -66.897 },
  { names: ['la pastora'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'La Pastora', lat: 10.511, lng: -66.921 },
  { names: ['pinto salinas'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'Pinto Salinas', lat: 10.504, lng: -66.887 },
  { names: ['el valle'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'El Valle', lat: 10.457, lng: -66.909 },
  { names: ['catedral', 'centro'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'Catedral', lat: 10.502, lng: -66.915 },
  { names: ['caracas'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: null, lat: 10.5, lng: -66.917 },

  // ── Miranda ──────────────────────────────────────────────────────────────
  { names: ['altamira'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Altamira', lat: 10.496, lng: -66.843 },
  { names: ['los palos grandes', 'palos grandes'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Los Palos Grandes', lat: 10.5, lng: -66.84 },
  { names: ['chacao'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Chacao', lat: 10.4975, lng: -66.853 },
  { names: ['baruta'], estado: 'Miranda', municipio: 'Baruta', parroquia: 'Baruta', lat: 10.433, lng: -66.876 },
  { names: ['el hatillo', 'hatillo'], estado: 'Miranda', municipio: 'El Hatillo', parroquia: 'El Hatillo', lat: 10.43, lng: -66.82 },
  { names: ['petare'], estado: 'Miranda', municipio: 'Sucre', parroquia: 'Petare', lat: 10.478, lng: -66.809 },
  { names: ['los teques'], estado: 'Miranda', municipio: 'Guaicaipuro', parroquia: 'Los Teques', lat: 10.344, lng: -67.041 },

  // ── La Guaira (formerly Vargas) ──────────────────────────────────────────
  // More-specific sub-sectors first so longest-match sorting works correctly.
  { names: ['los corales'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.61, lng: -66.852 },
  { names: ['tanaguarena'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.617, lng: -66.812 },
  { names: ['caraballeda'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.613, lng: -66.843 },
  { names: ['macuto'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Macuto', lat: 10.608, lng: -66.889 },
  { names: ['catia la mar'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Catia La Mar', lat: 10.597, lng: -67.029 },
  { names: ['maiquetia', 'maiquetía', 'simon bolivar', 'simón bolívar'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Maiquetía', lat: 10.601, lng: -66.991 },
  { names: ['naiguata', 'naiguatá'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Naiguatá', lat: 10.616, lng: -66.734 },
  { names: ['la guaira', 'vargas'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'La Guaira', lat: 10.602, lng: -66.934 },

  // ── Aragua ───────────────────────────────────────────────────────────────
  { names: ['maracay'], estado: 'Aragua', municipio: 'Girardot', parroquia: 'Maracay', lat: 10.247, lng: -67.596 },
  { names: ['la victoria'], estado: 'Aragua', municipio: 'José Félix Ribas', parroquia: 'La Victoria', lat: 10.227, lng: -67.333 },
  { names: ['las tejerias', 'las tejerías'], estado: 'Aragua', municipio: 'Santos Michelena', parroquia: 'Las Tejerías', lat: 10.182, lng: -67.068 },

  // ── Carabobo ─────────────────────────────────────────────────────────────
  { names: ['valencia'], estado: 'Carabobo', municipio: 'Valencia', parroquia: 'Valencia', lat: 10.162, lng: -68.008 },
  { names: ['puerto cabello'], estado: 'Carabobo', municipio: 'Puerto Cabello', parroquia: 'Puerto Cabello', lat: 10.473, lng: -68.013 },

  // ── Trujillo ─────────────────────────────────────────────────────────────
  { names: ['trujillo'], estado: 'Trujillo', municipio: 'Trujillo', parroquia: 'Trujillo', lat: 9.368, lng: -70.436 },
  { names: ['valera'], estado: 'Trujillo', municipio: 'Valera', parroquia: 'Valera', lat: 9.319, lng: -70.603 },

  // ── Falcón ───────────────────────────────────────────────────────────────
  { names: ['coro', 'santa ana de coro'], estado: 'Falcón', municipio: 'Miranda', parroquia: 'Santa Ana de Coro', lat: 11.402, lng: -69.673 },

  // ── Lara ─────────────────────────────────────────────────────────────────
  { names: ['barquisimeto'], estado: 'Lara', municipio: 'Iribarren', parroquia: 'Concepción', lat: 10.066, lng: -69.357 },

  // ── Yaracuy ──────────────────────────────────────────────────────────────
  { names: ['san felipe'], estado: 'Yaracuy', municipio: 'San Felipe', parroquia: 'San Felipe', lat: 10.338, lng: -68.745 },
];

// ── Utility ──────────────────────────────────────────────────────────────────

/**
 * Normalise a string: lowercase, strip diacritics, collapse whitespace.
 * Matches the `norm()` in ingest-worker/src/index.ts.
 * @param {string} s
 * @returns {string}
 */
export function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return ALL gazetteer entries whose name aliases appear in `text`.
 * Entries are sorted longest-matching-name-first so callers that take [0]
 * get the most-specific match (e.g. "los corales" over "la guaira").
 *
 * @param {string} text
 * @returns {GazEntry[]}
 */
export function matchPlaces(text) {
  const t = norm(text);
  const hits = GAZ.filter((entry) =>
    entry.names.some((name) => t.includes(norm(name)))
  );
  // Sort by longest matching alias descending — more specific wins.
  hits.sort((a, b) => {
    const maxLen = (entry) =>
      Math.max(...entry.names.map((n) => n.length));
    return maxLen(b) - maxLen(a);
  });
  return hits;
}

/**
 * Return the single best (most specific) gazetteer entry for `text`, or null.
 * @param {string} text
 * @returns {GazEntry|null}
 */
export function bestPlace(text) {
  const hits = matchPlaces(text);
  return hits.length > 0 ? hits[0] : null;
}

// ── Named building extraction ────────────────────────────────────────────────

/**
 * Regex patterns for Venezuelan building/structure name prefixes.
 * Captures: prefix + 1..3 Title-Case words (each starting with an uppercase letter).
 * Stops as soon as a lowercase word, punctuation, or end-of-token is reached.
 *
 * Strategy: capture only "UpperWord" tokens immediately after the prefix.
 * Each UpperWord = [A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ0-9]* (accented chars included).
 * Allows up to 3 proper-noun words so "Edificio Candelaria Center" is captured
 * but the sentence continues in lowercase and is NOT included.
 *
 * Covers real-world samples:
 *   "Edificio Petunia", "Residencias Rita", "Edificio Candelaria Center",
 *   "Torre Vista Norte", "Hotel Miramar", "Conjunto Residencial Las Américas".
 */
const UPPER_WORD = '[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ0-9]*';
// The PREFIX is case-insensitive on its first letter (real-world text says
// "edificio"/"edif"/"Residencias"), but the NAME after it must stay Title-Case
// (proper noun). We deliberately do NOT use the /i flag, because that would make
// UPPER_WORD match lowercase prose too ("edificio que colapsó" → "que colapso").
const PREFIX = '[Ee]dif(?:icio)?|[Rr]esidencias?|[Tt]orre|[Hh]otel|[Cc]onjunto(?: [Rr]esidencial)?';
const BUILDING_RE = new RegExp(
  `\\b(${PREFIX})\\s+(${UPPER_WORD}(?:\\s+${UPPER_WORD}){0,2})`,
  'g'
);

/**
 * Canonicalise the matched prefix to a stable Title-Case label so that
 * "edif", "edificio", "Edificio" all normalise to "Edificio".
 * @param {string} raw
 * @returns {string}
 */
function canonPrefix(raw) {
  const p = raw.toLowerCase();
  if (p.startsWith('edif')) return 'Edificio';
  if (p.startsWith('residencia')) return 'Residencias';
  if (p.startsWith('torre')) return 'Torre';
  if (p.startsWith('hotel')) return 'Hotel';
  if (p.startsWith('conjunto')) return p.includes('residencial') ? 'Conjunto Residencial' : 'Conjunto';
  return raw;
}

/**
 * Extract the first recognisable named building/structure from `text`.
 * Returns a normalised string like "Edificio Petunia" or null when none found.
 * Handles lowercase prefixes ("edificio Petunia") and the "edif" abbreviation.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractNamedBuilding(text) {
  // Reset lastIndex (global flag).
  BUILDING_RE.lastIndex = 0;
  const match = BUILDING_RE.exec(text);
  if (!match) return null;
  const name = match[2].replace(/\s+/g, ' ').trim();
  return `${canonPrefix(match[1])} ${name}`;
}
