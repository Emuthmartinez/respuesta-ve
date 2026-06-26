/**
 * db.mjs — read existing platform state from Supabase for CROSS-TICK dedup +
 * LLM-judge context.
 *
 * The anon role can only read PUBLIC views (approved rows, fuzzed coords ~110 m);
 * it cannot read pending rows (moderation gate). So the "known" set we dedup
 * against = already-approved buildings (confirmed + provisional). Pending-vs-
 * pending dedup across ticks is handled by the coordinator moderation queue and
 * by the LLM's review_possible_duplicate suggestion — not here.
 *
 * Returns Lead-shaped objects (with a real `id`) usable directly as the
 * `existingLeads` argument to processBatch() and as context for the LLM judge.
 *
 * Never throws — returns [] on any error.
 *
 * @typedef {{ SUPABASE_URL: string; SUPABASE_ANON_KEY: string }} Env
 * @typedef {import('./process.mjs').Lead} Lead
 */

/**
 * Fetch already-known (approved) buildings from the public views.
 * @param {Env} env
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<Lead & { id: string }>>}
 */
export async function fetchKnownLeads(env, { limit = 1000 } = {}) {
  // Minimal column set guaranteed to exist in BOTH public views.
  const select = 'id,lat,lng,estado,municipio,parroquia,damage_level,people_status';
  const views = ['buildings_public', 'buildings_provisional_public'];
  const byId = new Map();

  for (const view of views) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${view}?select=${select}&limit=${limit}`,
        {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
            Accept: 'application/json',
          },
        },
      );
      if (!res.ok) continue;
      const rows = await res.json().catch(() => []);
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (!r || r.id == null || r.lat == null || r.lng == null) continue;
        // De-dupe across the two views (a row could appear in only one, but be safe).
        if (byId.has(r.id)) continue;
        byId.set(r.id, {
          id: r.id,
          lat: Number(r.lat),
          lng: Number(r.lng),
          estado: r.estado ?? null,
          municipio: r.municipio ?? null,
          parroquia: r.parroquia ?? null,
          landmark_description: null, // public views do not expose landmarks
          damage_level: r.damage_level ?? 'unknown',
          people_status: r.people_status ?? 'unknown',
          description: '',
          source_channel: 'approved',
          corroboration_count: 1,
          _dedupKey: '', // isDuplicate() computes lazily when absent
          _sources: [`db:${r.id}`],
        });
      }
    } catch {
      // fail soft — a missing/renamed view must not break the tick
    }
  }

  return Array.from(byId.values());
}
