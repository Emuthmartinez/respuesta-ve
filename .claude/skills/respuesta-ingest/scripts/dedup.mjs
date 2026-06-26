/**
 * dedup.mjs — lead deduplication: key generation, duplicate detection, merging.
 *
 * Design contract:
 *  - A lead keyed by a named building (Edificio X) is DIFFERENT from another
 *    building in the same parroquia unless it's the same name.
 *  - A lead with no named building uses estado|parroquia|geo-rounded-to-3dp.
 *  - Two named-building leads in the same parroquia bump each other's
 *    corroboration_count when they match by name OR by proximity + text similarity.
 *  - Distinctly-named buildings in the same parroquia are NOT collapsed.
 *
 * @typedef {{ lat:number, lng:number, estado:string, municipio:string, parroquia:string|null, landmark_description:string|null, damage_level:string, people_status:string, description:string, source_channel:string, corroboration_count:number, _dedupKey:string, _sources:string[] }} Lead
 */

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Normalise a string for key comparison: lowercase, strip diacritics, collapse spaces.
 * @param {string} s
 * @returns {string}
 */
function _norm(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalise a landmark_description to a compact key component.
 * Returns null when the description is too generic to key on.
 * @param {string|null|undefined} ld
 * @returns {string|null}
 */
function _normLandmark(ld) {
  if (!ld) return null;
  const n = _norm(ld);
  // Strip articles AND building-type words so the DISTINCTIVE name is what we
  // key on. Without this, "Edificio Rita" and "Edificio Residencias Rita" key
  // differently and never merge — both should reduce to "rita".
  const stripped = n
    .replace(/\b(edificio|edif|residencias?|residencial|torre|hotel|conjunto|building|tower|de|del|la|el|los|las|un|una|the|an|a)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // If only generic words remain, treat as no landmark
  if (stripped.length < 4) return null;
  return stripped;
}

/**
 * Compute the dedup key for a lead.
 * - Named landmark:  "estado|parroquia|<normalised_landmark>"
 * - No landmark:     "estado|parroquia|<lat_3dp>|<lng_3dp>"
 *
 * Rationale: two different buildings in the same parroquia produce different
 * keys; a building mentioned twice (same name, same place) hits the same key.
 *
 * @param {Lead} lead
 * @returns {string}
 */
export function dedupKey(lead) {
  const estado = _norm(lead.estado ?? '');
  const parroquia = _norm(lead.parroquia ?? lead.municipio ?? '');
  const landmark = _normLandmark(lead.landmark_description);

  if (landmark) {
    return `${estado}|${parroquia}|${landmark}`;
  }

  // Geo rounded to 3 decimal places (~110 m grid)
  const lat3 = Number(lead.lat).toFixed(3);
  const lng3 = Number(lead.lng).toFixed(3);
  return `${estado}|${parroquia}|${lat3}|${lng3}`;
}

// ---------------------------------------------------------------------------
// Distance helper
// ---------------------------------------------------------------------------

/**
 * Haversine distance in metres between two (lat, lng) points.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
function _distanceM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Text similarity (Jaccard on word trigrams)
// ---------------------------------------------------------------------------

/**
 * Build the set of character trigrams for a normalised string.
 * @param {string} s
 * @returns {Set<string>}
 */
function _trigrams(s) {
  const set = new Set();
  for (let i = 0; i + 2 < s.length; i++) set.add(s.slice(i, i + 3));
  return set;
}

/**
 * Jaccard similarity [0..1] between two strings (trigram-based).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _jaccard(a, b) {
  const ta = _trigrams(_norm(a));
  const tb = _trigrams(_norm(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Determine whether `lead` is a duplicate of `existing`.
 *
 * Two leads are duplicates if:
 *   (A) Same dedupKey, OR
 *   (B) Within ~150 m AND same parroquia AND (same named building OR similar description text).
 *
 * Rule B intentionally does NOT collapse two distinct named buildings in the same
 * parroquia — the named-building check enforces this:
 *   - If both have named landmarks they must match (Jaccard ≥ 0.7).
 *   - If neither has a landmark, text similarity decides.
 *   - Mixed (one has landmark, one doesn't): not a dup under rule B.
 *
 * @param {Lead} lead
 * @param {Lead} existing
 * @returns {boolean}
 */
export function isDuplicate(lead, existing) {
  // (A) Key match
  const keyA = lead._dedupKey ?? dedupKey(lead);
  const keyB = existing._dedupKey ?? dedupKey(existing);
  if (keyA === keyB) return true;

  // (B) Proximity + parroquia + building/text similarity
  const dist = _distanceM(lead.lat, lead.lng, existing.lat, existing.lng);
  if (dist > 150) return false;

  const sameParroquia = _norm(lead.parroquia ?? '') === _norm(existing.parroquia ?? '');
  if (!sameParroquia) return false;

  const landmarkA = _normLandmark(lead.landmark_description);
  const landmarkB = _normLandmark(existing.landmark_description);

  if (landmarkA && landmarkB) {
    // Both have names — must be the same building
    return _jaccard(landmarkA, landmarkB) >= 0.70;
  }

  if (!landmarkA && !landmarkB) {
    // Neither has a name — use description similarity
    return _jaccard(lead.description, existing.description) >= 0.55;
  }

  // Mixed (one named, one unnamed within 150 m): treat as a corroborating
  // mention of the same general area, but only if descriptions are similar.
  return _jaccard(lead.description, existing.description) >= 0.65;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge `lead` into `existing` in-place.
 *   - Bumps corroboration_count.
 *   - Unions _sources arrays.
 *   - Upgrades damage_level and people_status to the more severe value.
 *   - Fills in landmark_description if existing lacks one.
 *   - Keeps existing geo (first sighting wins for coordinates).
 *
 * @param {Lead} existing  mutated in-place
 * @param {Lead} lead      incoming corroboration
 */
export function mergeInto(existing, lead) {
  existing.corroboration_count = (existing.corroboration_count ?? 1) + 1;

  // Union sources
  const sourcesSet = new Set([...(existing._sources ?? []), ...(lead._sources ?? [])]);
  existing._sources = Array.from(sourcesSet);

  // Keep the STRONGEST contributing source tier (drives the fast-lane gate):
  // a single official/media corroboration upgrades a lead's trust.
  const TIER_RANK = { official: 4, media: 3, journalist: 2, social: 1, unknown: 0 };
  if ((TIER_RANK[lead.best_tier] ?? 0) > (TIER_RANK[existing.best_tier] ?? 0)) {
    existing.best_tier = lead.best_tier;
  }

  // Upgrade damage level (order: collapsed > severe > moderate > minor > no_visible_damage > unknown)
  const DAMAGE_ORDER = ['unknown', 'no_visible_damage', 'minor', 'moderate', 'severe', 'collapsed'];
  const idxExisting = DAMAGE_ORDER.indexOf(existing.damage_level);
  const idxLead = DAMAGE_ORDER.indexOf(lead.damage_level);
  if (idxLead > idxExisting) existing.damage_level = lead.damage_level;

  // Upgrade people status (order: unknown < none_reported < possible < confirmed_trapped)
  const PEOPLE_ORDER = ['unknown', 'none_reported', 'possible', 'confirmed_trapped'];
  const pExisting = PEOPLE_ORDER.indexOf(existing.people_status);
  const pLead = PEOPLE_ORDER.indexOf(lead.people_status);
  if (pLead > pExisting) existing.people_status = lead.people_status;

  // Fill landmark if missing
  if (!existing.landmark_description && lead.landmark_description) {
    existing.landmark_description = lead.landmark_description;
    // Recompute dedup key now that we have a landmark
    existing._dedupKey = dedupKey(existing);
  }
}
