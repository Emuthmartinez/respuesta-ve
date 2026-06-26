/**
 * insert.mjs — Supabase REST insertion for the respuesta-ingest pipeline.
 *
 * Mirrors ingest-worker/src/index.ts insertLead() exactly:
 *   POST SUPABASE_URL/rest/v1/buildings
 *   headers: apikey, Authorization Bearer anon, Content-Type json, Prefer return=minimal
 *
 * insertMisinformation calls:
 *   POST SUPABASE_URL/rest/v1/rpc/submit_misinformation_report
 *   (RPC added in migration 0013)
 *
 * Idempotency is caller-responsibility (seen.mjs + dedup.mjs upstream).
 * Uses node global fetch (Node 18+). Never throws — errors are collected.
 *
 * @typedef {{ lat:number, lng:number, estado:string, municipio:string, parroquia:string|null, landmark_description:string|null, damage_level:string, people_status:string, description:string, source_channel:string, corroboration_count:number, _dedupKey:string, _sources:string[], llm_rationale?:string|null, llm_suggested_action?:string, llm_confidence?:string, llm_related_ids?:string[]|null }} Lead
 * @typedef {{ claim:string, verdict:'false'|'misleading'|'unverified'|'satire', explanation:string, debunk_url?:string, source_url:string, related_place?:string, severity:'low'|'medium'|'high' }} MisinformationItem
 */

import { createHash } from 'node:crypto';

/**
 * Stable synthetic IP hash for the server-side pipeline agent.
 * Used as the rate-limit throttle key in submit_misinformation_report.
 * A fixed 16-char hex string derived from the pipeline identity keeps the
 * 5-per-hour bucket separate from real client submissions.
 */
const PIPELINE_IP_HASH = createHash('sha256').update('ingest-pipeline').digest('hex').slice(0, 16);

/**
 * @typedef {{ SUPABASE_URL: string; SUPABASE_ANON_KEY: string }} Env
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the common Supabase REST headers.
 * @param {Env} env
 * @returns {Record<string, string>}
 */
function supabaseHeaders(env) {
  return {
    apikey:          env.SUPABASE_ANON_KEY,
    Authorization:   `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    Prefer:          'return=minimal',
  };
}

// ---------------------------------------------------------------------------
// insertLeads
// ---------------------------------------------------------------------------

/**
 * Insert an array of leads into public.buildings via the submit_ingest_lead RPC
 * (migration 0014). The RPC forces moderation_status='pending' + verified=false,
 * sets the columns anon cannot INSERT directly, and returns the new id.
 *
 * Private / internal fields (_dedupKey, _sources) are not sent.
 *
 * @param {Lead[]} leads
 * @param {Env} env
 * @returns {Promise<{ inserted: number; ids: string[]; skipped: number; errors: string[] }>}
 */
export async function insertLeads(leads, env) {
  let inserted = 0;
  let skipped  = 0;
  const ids    = /** @type {string[]} */ ([]);
  const errors = /** @type {string[]} */ ([]);

  // The RPC is the controlled write path (migration 0014): SECURITY DEFINER, sets
  // source_channel/landmark/corroboration/llm_* that anon cannot INSERT directly,
  // FORCES moderation_status='pending'+verified=false, and RETURNS the new id.
  // Do NOT use Prefer:return=minimal here — we need the {ok,id} body.
  const rpcHeaders = {
    apikey:         env.SUPABASE_ANON_KEY,
    Authorization:  `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };

  // Fast-lane auto-publish is opt-in via INGEST_FASTLANE=1, which ALSO signals
  // that migration 0028 (the RPC that accepts p_best_tier/p_autopublish/
  // p_content_hash) is deployed. With the flag off we send only the original 16
  // params, so this keeps working against the pre-0028 RPC (everything → pending).
  const fastlaneOn = process.env.INGEST_FASTLANE === '1';

  for (const lead of leads) {
    const payload = {
      p_ip_hash:              PIPELINE_IP_HASH,
      p_lat:                  lead.lat,
      p_lng:                  lead.lng,
      p_estado:               lead.estado ?? null,
      p_municipio:            lead.municipio ?? null,
      p_parroquia:            lead.parroquia ?? null,
      p_landmark:             lead.landmark_description ?? null,
      p_description:          lead.description ?? null,
      p_damage_level:         lead.damage_level  ?? 'unknown',
      p_people_status:        lead.people_status ?? 'unknown',
      p_source_channel:       lead.source_channel ?? 'social_scan',
      p_corroboration_count:  lead.corroboration_count ?? 1,
      // LLM-judge annotations (advisory; the RPC stores them, never acts on them):
      p_llm_rationale:        lead.llm_rationale ?? null,
      p_llm_suggested_action: lead.llm_suggested_action ?? 'none',
      p_llm_confidence:       lead.llm_confidence ?? 'low',
      p_llm_related_ids:      lead.llm_related_ids ?? null,
    };

    if (fastlaneOn) {
      // content_hash = stable signature of the lead (for cross-run idempotency).
      payload.p_content_hash = createHash('sha256').update(lead._dedupKey ?? '').digest('hex');
      payload.p_best_tier    = lead.best_tier ?? 'unknown';
      // The RPC RE-ENFORCES the gate; this is only the caller's request.
      payload.p_autopublish  = Boolean(lead._fastlane?.eligible);
    }

    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/submit_ingest_lead`, {
        method:  'POST',
        headers: rpcHeaders,
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.ok) {
          inserted++;
          if (body.id) ids.push(body.id);
        } else {
          skipped++;
          errors.push(`RPC rejected lead [${lead._dedupKey}]: ${body?.error ?? 'unknown'}`);
        }
      } else {
        const body = await res.text().catch(() => '(no body)');
        errors.push(`HTTP ${res.status} ingesting lead [${lead._dedupKey}]: ${body.slice(0, 200)}`);
        skipped++;
      }
    } catch (err) {
      errors.push(`Fetch error ingesting lead [${lead._dedupKey}]: ${err?.message ?? String(err)}`);
      skipped++;
    }
  }

  return { inserted, ids, skipped, errors };
}

// ---------------------------------------------------------------------------
// insertMisinformation
// ---------------------------------------------------------------------------

/**
 * Submit misinformation reports via the submit_misinformation_report RPC
 * (defined in migration 0013).
 *
 * RPC signature (Postgres, migration 0013):
 *   submit_misinformation_report(
 *     p_ip_hash text, p_claim text, p_verdict text, p_explanation text,
 *     p_debunk_url text, p_source_url text,
 *     p_related_place text, p_severity text
 *   ) returns jsonb
 *
 * @param {MisinformationItem[]} items
 * @param {Env} env
 * @returns {Promise<{ inserted: number; skipped: number; errors: string[] }>}
 */
export async function insertMisinformation(items, env) {
  let inserted = 0;
  let skipped  = 0;
  const errors = /** @type {string[]} */ ([]);

  for (const item of items) {
    const payload = {
      p_ip_hash:       PIPELINE_IP_HASH,
      p_claim:         item.claim,
      p_verdict:       item.verdict,
      p_explanation:   item.explanation,
      p_debunk_url:    item.debunk_url    ?? null,
      p_source_url:    item.source_url,
      p_related_place: item.related_place ?? null,
      p_severity:      item.severity,
    };

    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/submit_misinformation_report`, {
        method:  'POST',
        headers: supabaseHeaders(env),
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        inserted++;
      } else {
        const body = await res.text().catch(() => '(no body)');
        if (res.status === 409) {
          skipped++;
        } else {
          errors.push(`HTTP ${res.status} inserting misinfo [${item.source_url.slice(0, 80)}]: ${body.slice(0, 200)}`);
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Fetch error inserting misinfo: ${err?.message ?? String(err)}`);
      skipped++;
    }
  }

  return { inserted, skipped, errors };
}
