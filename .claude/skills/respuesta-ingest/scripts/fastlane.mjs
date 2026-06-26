/**
 * fastlane.mjs — deterministic auto-publish gate for the ingest pipeline.
 *
 * Policy chosen by the operator (2026-06-26): qualifying leads auto-publish to the
 * "Reportes por confirmar" provisional layer (moderation_status='approved' +
 * location_status='provisional') so corroborated damage info reaches the public
 * within the hour WITHOUT a coordinator click. Everything else stays 'pending'.
 *
 * CRITICAL: this gate is ADVISORY from Node's side. The DB RPC
 * submit_ingest_lead re-enforces the SAME predicate server-side (migration 0028)
 * and is the real authority — a compromised or buggy caller cannot self-publish a
 * lead that fails the server check. Keep the two predicates in sync.
 *
 * Why the floor is fully deterministic (no LLM dependency): in a life-safety tool
 * the auto-publish decision must be reproducible and auditable. corroboration,
 * source tier, the misinfo/debunk filters, and people_status are all computed by
 * deterministic code (dedup.mjs / trust.mjs / process.mjs). The LLM judge only
 * ADDS a veto signal (review_misinformation, etc.) — it can never be the reason a
 * lead publishes, only a reason it does NOT.
 *
 * @typedef {import('./process.mjs').Lead & {
 *   best_tier?: string,
 *   llm_suggested_action?: string,
 * }} Lead
 */

// LLM-judge actions that VETO the fast lane (route to coordinator instead).
const JUDGE_VETOES = new Set([
  'review_misinformation',
  'review_classification',
  'escalate_life_safety',
]);

// people_status values that are life-safety and must ALWAYS go to a human
// (coordinator fast-track), never silent public auto-publish.
const LIFE_SAFETY_PEOPLE = new Set(['possible', 'confirmed_trapped']);

// Source tiers trustworthy enough to publish on a single source.
const TRUSTED_TIERS = new Set(['official', 'media']);

// ─────────────────────────────────────────────────────────────────────────────
//  THE KNOB — tune this predicate to taste. It is the whole policy.
//  A lead auto-publishes to the provisional layer when ALL of:
//    1. it is NOT a life-safety (trapped/possible) lead          [→ coordinator]
//    2. the LLM judge did not raise a veto action                [→ coordinator]
//    3. it is NOT 'unknown'/'no_visible_damage' (must be real damage)
//    4. it is corroborated (≥ MIN_CORROBORATION independent sources)
//         OR it comes from a trusted tier (official / media)
//  Loosen by lowering MIN_CORROBORATION or adding tiers; tighten by raising it
//  or requiring BOTH corroboration AND tier. Mirror any change in migration 0028.
// ─────────────────────────────────────────────────────────────────────────────
export const MIN_CORROBORATION = 2;
const PUBLISHABLE_DAMAGE = new Set(['minor', 'moderate', 'severe', 'collapsed']);

/**
 * Decide whether a processed lead may auto-publish to the provisional layer.
 * @param {Lead} lead
 * @returns {{ eligible: boolean, reason: string }}
 */
export function fastLaneDecision(lead) {
  if (LIFE_SAFETY_PEOPLE.has(lead.people_status)) {
    return { eligible: false, reason: 'life_safety_to_coordinator' };
  }
  if (JUDGE_VETOES.has(lead.llm_suggested_action ?? 'none')) {
    return { eligible: false, reason: `judge_veto:${lead.llm_suggested_action}` };
  }
  if (!PUBLISHABLE_DAMAGE.has(lead.damage_level)) {
    return { eligible: false, reason: `damage_too_low:${lead.damage_level}` };
  }

  const corroborated = (lead.corroboration_count ?? 1) >= MIN_CORROBORATION;
  const trusted = TRUSTED_TIERS.has(lead.best_tier ?? 'unknown');
  if (corroborated || trusted) {
    return {
      eligible: true,
      reason: corroborated ? `corroborated:${lead.corroboration_count}` : `trusted:${lead.best_tier}`,
    };
  }
  return { eligible: false, reason: 'single_low_trust_source' };
}

/**
 * Annotate a batch of leads with `_fastlane` { eligible, reason }.
 * Pure; returns the same array for convenience.
 * @param {Lead[]} leads
 * @returns {Lead[]}
 */
export function applyFastLane(leads) {
  for (const lead of leads) {
    lead._fastlane = fastLaneDecision(lead);
  }
  return leads;
}
