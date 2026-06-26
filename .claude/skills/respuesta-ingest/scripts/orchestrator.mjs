/**
 * orchestrator.mjs — the headless ingest tick. NO interactive agent, NO model
 * context window. Run under launchd hourly (see com.respuestave.ingest.plist).
 *
 *   node orchestrator.mjs
 *
 * This is the fix for the context-window blowout. Previously the interactive
 * `claude` agent called the xpoz MCP tools directly, so the raw social firehose
 * piled up in the model's context and the run died before insert. Here, every
 * source is collected by plain Node (social via mcporter→xpoz, web/video via the
 * existing scripts); the deterministic engine (processBatch) classifies/geo/
 * dedupes; an OPTIONAL bounded LLM judge annotates only the ≤~20 surviving leads;
 * and insert.mjs writes them. Nothing large ever enters a model context.
 *
 * Env (export before running — see run-tick.sh):
 *   SUPABASE_URL, SUPABASE_ANON_KEY   required to insert (collection works without)
 *   INGEST_JUDGE=1                     enable the optional claude -p annotation pass
 *   INGEST_FASTLANE=1                  enable auto-publish path (needs migration 0028)
 *   INGEST_FULL=1 | 0                  force author sweep on/off (default: every 3h)
 *
 * Exit code is always 0 on a completed tick (sources fail soft); non-zero only on
 * a programming error, so launchd logs surface real breakage.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { ACCOUNTS, KEYWORD_QUERIES, RSS_FEEDS, SITES, YT_QUERIES, EXA_QUERIES } from './sources.mjs';
import { loadSeen, saveSeen, seenKey, seenCheckAndAdd } from './seen.mjs';
import { collectSocial, fetchCredits } from './social.mjs';
import { fetchExa, fetchGdelt, fetchRss, fetchSite } from './fetch_web.mjs';
import { scanVideos } from './video.mjs';
import { processBatch } from './process.mjs';
import { fetchKnownLeads } from './db.mjs';
import { applyFastLane } from './fastlane.mjs';
import { insertLeads, insertMisinformation } from './insert.mjs';
import { judgeLeads } from './judge.mjs';

const log = (m) => process.stderr.write(`[orchestrator] ${m}\n`);
const nowIso = () => new Date().toISOString();

/** Decide whether to run the per-author sweep this tick (credit conservation). */
function shouldSweepAuthors() {
  if (process.env.INGEST_FULL === '1') return true;
  if (process.env.INGEST_FULL === '0') return false;
  // Default: author sweep every 3rd hour; keyword scans run every hour.
  return new Date().getHours() % 3 === 0;
}

/** Collect web/RSS/Exa/GDELT/site items, seen-deduped. Fails soft per source. */
async function collectWeb(seen) {
  const items = [];
  const absorb = (arr) => {
    for (const it of arr ?? []) {
      if (!it || seenCheckAndAdd(seen, seenKey(it.platform ?? 'web', it.id ?? it.url))) continue;
      items.push(it);
    }
  };
  for (const { query, n } of EXA_QUERIES) {
    try { absorb(await fetchExa(query, n ?? 6)); } catch (e) { log(`exa "${query}" failed: ${e?.message}`); }
  }
  try { absorb(await fetchGdelt()); } catch (e) { log(`gdelt failed: ${e?.message}`); }
  for (const feed of RSS_FEEDS) {
    try { absorb(await fetchRss(feed.url)); } catch (e) { log(`rss ${feed.name} failed: ${e?.message}`); }
  }
  for (const site of SITES) {
    try { absorb(await fetchSite(site.url)); } catch (e) { log(`site ${site.name} failed: ${e?.message}`); }
  }
  return items;
}

/** Collect YouTube subtitle items via yt-dlp, seen-deduped. Fails soft. */
async function collectVideo(seen) {
  const seenIds = new Set([...seen].filter((k) => k.startsWith('youtube:')).map((k) => k.slice('youtube:'.length)));
  let raw = [];
  try {
    raw = await scanVideos(YT_QUERIES.map((q) => q.query), { seenIds });
  } catch (e) {
    log(`video scan failed: ${e?.message}`);
    return [];
  }
  const items = [];
  for (const it of raw ?? []) {
    if (!it || seenCheckAndAdd(seen, seenKey(it.platform ?? 'youtube', it.id ?? it.url))) continue;
    items.push(it);
  }
  return items;
}

async function main() {
  const startedAt = nowIso();
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };
  const canInsert = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  if (!canInsert) log('SUPABASE_URL / SUPABASE_ANON_KEY missing — will collect + process but NOT insert.');

  const seen = loadSeen();
  const beforeSeen = seen.size;

  // ── Credit guard ─────────────────────────────────────────────────────────
  const credits = await fetchCredits();
  const lowCredits = credits && credits.subscriptionCredits != null && credits.subscriptionCredits < 200;
  const authorsSweep = shouldSweepAuthors() && !lowCredits;
  if (credits) log(`xpoz credits: sub=${credits.subscriptionCredits ?? '?'} extra=${credits.extraCredits ?? '?'}${lowCredits ? ' (LOW → keyword-only)' : ''}`);

  // ── 1. Collect (no model context involved) ────────────────────────────────
  const social = await collectSocial({
    accounts: ACCOUNTS,
    keywordQueries: KEYWORD_QUERIES,
    seen, seenKey, seenCheckAndAdd,
    opts: { authorsSweep },
  });
  if (!social.authed) log('NOTE: social leg skipped/partial — xpoz not authenticated. Run `mcporter auth xpoz` once.');
  const web = await collectWeb(seen);
  const video = await collectVideo(seen);

  const rawItems = [...social.items, ...web, ...video];
  log(`collected: social=${social.items.length} web=${web.length} video=${video.length} → ${rawItems.length} new items`);

  // ── 2. Deterministic classify / geo / dedup ───────────────────────────────
  const knownLeads = canInsert ? await fetchKnownLeads(env) : [];
  const { leads, missing, misinformation, stats } = processBatch(rawItems, knownLeads);

  // ── 3. Optional bounded LLM judge (annotates ≤~20 structured leads only) ───
  let judged = 0;
  if (process.env.INGEST_JUDGE === '1' && leads.length) {
    try {
      judged = await judgeLeads(leads, knownLeads);
      log(`llm judge annotated ${judged} lead(s)`);
    } catch (e) {
      log(`llm judge failed (continuing deterministic): ${e?.message}`);
    }
  }

  // ── 4. Fast-lane decision (deterministic; DB re-enforces server-side) ──────
  applyFastLane(leads);
  const eligible = leads.filter((l) => l._fastlane?.eligible);

  // ── 5. Insert ──────────────────────────────────────────────────────────────
  let leadsResult = { inserted: 0, ids: [], skipped: 0, errors: ['not inserted (no supabase env)'] };
  let misinfoResult = { inserted: 0, skipped: 0, errors: [] };
  if (canInsert) {
    leadsResult = await insertLeads(leads, env);
    misinfoResult = await insertMisinformation(misinformation, env);
  }

  // ── 6. Persist dedup state + run log ───────────────────────────────────────
  // Only persist "seen" when we could actually insert. A dry / no-Supabase run
  // collected items but did NOT hand them off, so marking them seen would make a
  // later real run skip them forever (the collect→insert idempotency gap). When
  // we DID insert, the DB content_hash index is the second backstop against dupes.
  if (canInsert) saveSeen(seen);
  else log('dry run (no Supabase env): NOT persisting seen.json so a real run can still ingest these items.');

  const summary = {
    startedAt, finishedAt: nowIso(),
    authorsSweep, lowCredits: Boolean(lowCredits),
    socialAuthed: social.authed,
    collected: { social: social.items.length, web: web.length, video: video.length, total: rawItems.length },
    stats,
    leads: { processed: leads.length, fastlaneEligible: eligible.length, inserted: leadsResult.inserted, skipped: leadsResult.skipped },
    misinformation: misinfoResult,
    missingMentions: missing.length,
    judged,
    seen: { before: beforeSeen, after: seen.size },
    errors: [...(leadsResult.errors ?? []), ...(misinfoResult.errors ?? [])].slice(0, 20),
  };

  // Durable run log (off the firehose — just the summary).
  try {
    const dir = join(homedir(), '.respuesta-ingest', 'runs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(summary, null, 2));
  } catch (e) {
    log(`run-log write failed: ${e?.message}`);
  }

  printReport(summary, eligible, misinformation, missing);
  return summary;
}

/** Spanish situation report to stdout (mirrors SKILL.md format). */
function printReport(s, eligible, misinformation, missing) {
  const L = [];
  L.push(`=== Respuesta VE — Resumen de ingesta (${s.startedAt}) ===\n`);
  L.push('📊 Estadísticas:');
  L.push(`  • Ítems escaneados: ${s.collected.total}  (social ${s.collected.social} / web ${s.collected.web} / video ${s.collected.video})`);
  L.push(`  • Leads nuevos:     ${s.leads.processed}  (insertados ${s.leads.inserted})`);
  L.push(`  • Auto-publicados (por confirmar): ${s.leads.fastlaneEligible}`);
  L.push(`  • Duplicados:       ${s.stats.dupes}`);
  L.push(`  • Desinformación:   ${s.stats.misinfo}`);
  if (!s.socialAuthed) L.push('  ⚠️  xpoz NO autenticado — ejecuta `mcporter auth xpoz` (social omitido este tick).');
  if (s.lowCredits) L.push('  ⚠️  Créditos xpoz bajos — solo keyword scan este tick.');
  L.push('');
  if (eligible.length) {
    L.push('🟢 Auto-publicados al mapa "Por confirmar":');
    for (const l of eligible.slice(0, 12)) {
      L.push(`  • [${l.damage_level}] ${l.landmark_description ?? l.parroquia ?? l.municipio} — ${l._fastlane.reason}`);
    }
    L.push('');
  }
  if (misinformation.length) {
    L.push('⚠️ Desinformación detectada → tabla misinformation_reports:');
    for (const m of misinformation.slice(0, 8)) L.push(`  • "${(m.claim ?? '').slice(0, 90)}" [${m.severity}]`);
    L.push('');
  }
  if (missing.length) L.push(`👤 Menciones de desaparecidos (link-out, NO insertadas): ${missing.length}`);
  if (s.errors.length) {
    L.push('\n❗ Errores (primeros):');
    for (const e of s.errors.slice(0, 6)) L.push(`  • ${e}`);
  }
  process.stdout.write(L.join('\n') + '\n');
}

main().catch((err) => {
  process.stderr.write(`[orchestrator] FATAL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
