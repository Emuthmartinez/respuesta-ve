/**
 * classify.mjs — damage-level + people-status classifier for the Venezuela 2026
 * earthquake response pipeline.
 *
 * Ported + extended from ingest-worker/src/index.ts (classify()).
 * Maps Spanish/English keywords to the EXACT enum values required by lib/taxonomy.ts.
 *
 * DamageLevel  = 'collapsed'|'severe'|'moderate'|'minor'|'no_visible_damage'|'unknown'
 * PeopleStatus = 'confirmed_trapped'|'possible'|'none_reported'|'unknown'
 *
 * Design notes
 * ────────────
 * • Returns null when no damage signal is found (skip this item entirely).
 * • confirmed_trapped requires explicit language: "atrapado/a", "bajo escombros",
 *   "bajo los escombros", "trapped", "sepultado", "sepultada".
 * • possible when rescue/search is ongoing (rescate, busqueda, búsqueda, search,
 *   rescue, sobreviviente, survivor) WITHOUT the explicit trapped language.
 * • none_reported when damage is confirmed but no person-in-danger language.
 * • unknown is the conservative fallback when text is ambiguous.
 */

import { norm } from './gazetteer.mjs';

// ── Keyword lists ─────────────────────────────────────────────────────────────

/**
 * Any of these must be present for the item to be kept at all.
 * Covers the full damage spectrum.
 */
const DAMAGE_ANY = [
  // Spanish
  'colaps', 'derrumb', 'escombr', 'destru', 'agriet', 'grieta', 'desplom',
  'sepult', 'damnific', 'afectad', 'daño', 'dano', 'rajadura', 'fisura',
  'hundimiento', 'aplast', 'desaparec', 'inhabitabl', 'inhabitab',
  // English
  'collaps', 'rubble', 'destroy', 'damag', 'cracked', 'crumbl', 'sinkhole', 'crush',
  'wiped out', 'gone', 'obliterat',
];

/** Collapsed / total failure.
 *  NOTE: 'destru'/'destroy' deliberately live in DAMAGE_SEVERE, not here —
 *  "destrucción"/"destrozos" is frequently hyperbolic ("estado de destrucción
 *  del apartamento") and does not reliably mean structural collapse. Requiring
 *  the strong collapse verbs (colaps/derrumb/desplom/sepult/escombr) avoids
 *  over-grading standing-but-damaged buildings as collapsed. */
const DAMAGE_COLLAPSED = [
  // Spanish
  'colaps', 'derrumb', 'escombr', 'desplom', 'sepult', 'aplast',
  'hundimiento', 'reducido a escombros', 'se vino abajo',
  // English
  'collaps', 'rubble', 'crumbl', 'crush', 'wiped out', 'obliterat', 'levelled', 'leveled',
];

/** Severe but structurally standing */
const DAMAGE_SEVERE = [
  // Spanish
  'grave', 'severo', 'severa', 'fuerte', 'parcialmente derrumb', 'irreparable',
  'destru', 'destrozos', 'fallas estructurales', 'inhabitable',
  // English
  'sever', 'heavily damaged', 'major damage', 'partial collapse', 'destroy',
];

/** Moderate */
const DAMAGE_MODERATE = [
  // Spanish
  'agriet', 'grieta', 'fisura', 'rajadura', 'daños', 'daño',
  // English
  'crack', 'damag',
];

/** Minor / superficial */
const DAMAGE_MINOR = [
  // Spanish
  'leve', 'pequeña', 'pequeño', 'minimo', 'mínimo', 'superficial',
  // English
  'minor', 'slight', 'small crack',
];

/** No visible damage — explicit phrases */
const DAMAGE_NONE_VISIBLE = [
  'sin daños visibles', 'sin daños', 'no reporta daños', 'no hay daños',
  'ileso', 'ilesa', 'no damage', 'no visible damage', 'no structural damage',
];

// ── People-status keyword lists ───────────────────────────────────────────────

/**
 * Explicit "confirmed trapped" language.
 * Must appear literally to earn confirmed_trapped (life-safety: prefer false-negative
 * over false-positive — if uncertain, fall through to `possible`).
 */
const PEOPLE_CONFIRMED_TRAPPED = [
  // Spanish
  'atrapado', 'atrapada', 'atrapados', 'atrapadas',
  'bajo los escombros', 'bajo escombros',
  'sepultado', 'sepultada', 'sepultados', 'sepultadas',
  'bajo los derrumbes',
  // English
  'trapped', 'buried alive', 'pinned under',
];

/** Rescue/search in progress → "possible" */
const PEOPLE_POSSIBLE = [
  // Spanish
  'rescate', 'búsqueda', 'busqueda', 'desaparecid', 'sobreviviente',
  'rescatando', 'buscan', 'labores de rescate',
  // English
  'rescue', 'search', 'survivor', 'missing', 'search and rescue',
];

/** Explicit "nobody hurt / no casualties" language → none_reported */
const PEOPLE_NONE = [
  'sin víctimas', 'sin victimas', 'no hay víctimas', 'no hay heridos',
  'sin heridos', 'sin fallecidos', 'nadie atrapado', 'everyone safe',
  'no casualties', 'no injuries', 'no one trapped',
];

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Return true if the normalised text contains any of the provided substrings.
 * @param {string} normText   Already-normalised text (call norm() before passing)
 * @param {string[]} keywords
 * @returns {boolean}
 */
function anyMatch(normText, keywords) {
  return keywords.some((k) => normText.includes(norm(k)));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify damage level and people status from free text.
 *
 * @param {string} text  Raw Spanish/English text (tweet, article, caption…)
 * @returns {{ damage_level: string, people_status: string }|null}
 *   null when no damage signal is detected (item should be skipped).
 */
export function classifyDamage(text) {
  const t = norm(text);

  // Gate: must contain at least one generic damage keyword.
  if (!anyMatch(t, DAMAGE_ANY)) return null;

  // ── damage_level ──────────────────────────────────────────────────────────
  let damage_level;

  if (anyMatch(t, DAMAGE_NONE_VISIBLE)) {
    damage_level = 'no_visible_damage';
  } else if (anyMatch(t, DAMAGE_COLLAPSED)) {
    damage_level = 'collapsed';
  } else if (anyMatch(t, DAMAGE_SEVERE)) {
    damage_level = 'severe';
  } else if (anyMatch(t, DAMAGE_MODERATE)) {
    damage_level = 'moderate';
  } else if (anyMatch(t, DAMAGE_MINOR)) {
    damage_level = 'minor';
  } else {
    // Has a damage keyword but none of the tier-specific lists matched.
    damage_level = 'unknown';
  }

  // ── people_status ─────────────────────────────────────────────────────────
  // A trapped keyword qualified by "posible/presunto/podrían…" is NOT a
  // confirmation — "ante la posible presencia de personas atrapadas" is a
  // POSSIBLE, not confirmed_trapped. Over-escalation triggers false life-safety
  // triage and burns responder attention, so we downgrade qualified mentions.
  const QUALIFIED_TRAPPED =
    /(posible|posibles|presunt[oa]s?|podrian?|pudiera|probable|might|possibly)[^.]{0,40}?(atrapad|sepultad|trapped|bajo (los )?escombros)/;

  let people_status;

  if (anyMatch(t, PEOPLE_CONFIRMED_TRAPPED)) {
    people_status = QUALIFIED_TRAPPED.test(t) ? 'possible' : 'confirmed_trapped';
  } else if (anyMatch(t, PEOPLE_POSSIBLE)) {
    people_status = 'possible';
  } else if (anyMatch(t, PEOPLE_NONE)) {
    people_status = 'none_reported';
  } else {
    people_status = 'unknown';
  }

  return { damage_level, people_status };
}
