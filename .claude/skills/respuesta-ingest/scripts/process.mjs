/**
 * process.mjs — core pipeline: classify → geo → dedup → lead/missing/misinfo assembly.
 *
 * Imports from the other skill scripts; pure logic — no network calls.
 * Called by the ingest skill after all raw items are gathered.
 *
 * @typedef {import('./gazetteer.mjs').GazEntry} GazEntry
 * @typedef {{ source:string, platform:string, handle?:string, id:string, url:string, text:string, createdAt?:string, mediaUrls?:string[], engagement?:number }} RawItem
 * @typedef {{ lat:number, lng:number, estado:string, municipio:string, parroquia:string|null, landmark_description:string|null, damage_level:string, people_status:string, description:string, source_channel:string, corroboration_count:number, _dedupKey:string, _sources:string[] }} Lead
 * @typedef {{ name?:string, last_seen_text?:string, estado?:string, source_url:string, registry:string, note:string }} MissingMention
 * @typedef {{ claim:string, verdict:'false'|'misleading'|'unverified'|'satire', explanation:string, debunk_url?:string, source_url:string, related_place?:string, severity:'low'|'medium'|'high' }} MisinformationItem
 */

import { bestPlace, extractNamedBuilding } from './gazetteer.mjs';
import { classifyDamage } from './classify.mjs';
import { isLikelyMisinformation, detectDebunk } from './trust.mjs';
import { isDuplicate, mergeInto, dedupKey } from './dedup.mjs';

// ---------------------------------------------------------------------------
// source_channel mapping: platform → DB source_channel enum value
// ---------------------------------------------------------------------------

/** @param {RawItem} item @returns {string} */
function sourceChannel(item) {
  switch (item.platform) {
    case 'twitter':
    case 'tiktok':
    case 'instagram':
    case 'reddit':
      return 'social_scan';
    case 'youtube':
      return 'video_scan';
    case 'rss':
    case 'web':
      return 'news_scrape';
    case 'site':
      return 'site_scan';
    default:
      return 'news_scrape';
  }
}

// ---------------------------------------------------------------------------
// Missing-person signal detection
// Heuristic: does the text mention someone missing + a context phrase?
// We do NOT bulk-insert — only link-out (MissingMention shape).
// ---------------------------------------------------------------------------

const MISSING_KW = [
  'desaparecido', 'desaparecida', 'busco a', 'buscamos a', 'alguien sabe de',
  'no da señales', 'sin noticias de', 'se busca', 'missing', 'looking for',
  'anyone seen', 'last seen',
];

const NAME_RE = /(?:busco|buscamos|desaparecido|missing)[^\n,;.]{0,8}(?:a\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/;

/**
 * Detect a missing-person mention in a raw item text.
 * Returns null when not a missing-person signal.
 * @param {RawItem} item
 * @returns {MissingMention|null}
 */
function detectMissing(item) {
  const t = item.text.toLowerCase();
  if (!MISSING_KW.some((k) => t.includes(k))) return null;

  const nameMatch = NAME_RE.exec(item.text);
  const place = bestPlace(item.text);

  return {
    name:           nameMatch ? nameMatch[1] : undefined,
    last_seen_text: item.text.slice(0, 280),
    estado:         place?.estado,
    source_url:     item.url,
    registry:       'desaparecidosterremotovenezuela',
    note:           `Señal detectada en ${item.source}. Verificar en el registro oficial de desaparecidos.`,
  };
}

// ---------------------------------------------------------------------------
// Description builder
// Format: '[TAG - verificar] <summary>. Fuente: <url>' (Spanish, ≤1900 chars)
// ---------------------------------------------------------------------------

const CHANNEL_TAG = {
  social_scan:  'SOCIAL',
  news_scrape:  'AUTO-RSS',
  video_scan:   'VIDEO',
  site_scan:    'SITIO',
};

/**
 * @param {RawItem} item
 * @param {string} channel
 * @returns {string}
 */
function buildDescription(item, channel) {
  const tag   = CHANNEL_TAG[channel] ?? 'AUTO';
  const text  = item.text.replace(/\s+/g, ' ').trim();
  const body  = text.length > 300 ? text.slice(0, 297) + '…' : text;
  const raw   = `[${tag} - verificar] ${body}. Fuente: ${item.url}`;
  return raw.slice(0, 1900);
}

// ---------------------------------------------------------------------------
// processBatch — main entry point
// ---------------------------------------------------------------------------

/**
 * Process a batch of raw items into structured leads, missing mentions, and
 * misinformation records.
 *
 * @param {RawItem[]} rawItems
 * @param {Lead[]} [existingLeads=[]]   Leads already in DB / earlier batch — used for cross-batch dedup.
 * @returns {{ leads: Lead[], missing: MissingMention[], misinformation: MisinformationItem[], stats: { scanned:number, kept:number, dupes:number, misinfo:number } }}
 */
export function processBatch(rawItems, existingLeads = []) {
  const leads          = /** @type {Lead[]} */ ([]);
  const missing        = /** @type {MissingMention[]} */ ([]);
  const misinformation = /** @type {MisinformationItem[]} */ ([]);

  let dupes  = 0;
  let misinfo = 0;

  for (const item of rawItems) {
    const text = item.text ?? '';
    if (!text.trim()) continue;

    // ---- 1. Debunk check: is this item ITSELF a fact-check/correction? ----
    const debunk = detectDebunk(text, item.url);
    if (debunk) {
      misinformation.push(debunk);
      misinfo++;
      continue; // do not also make it a lead
    }

    // ---- 2. Misinformation filter: is the item likely fake/propaganda? ----
    const misinfoCheck = isLikelyMisinformation(text);
    if (misinfoCheck.flag) {
      // Optionally log the reason for audit
      misinfo++;
      continue;
    }

    // ---- 3. Missing-person early detection (link-out only) ----
    const missingMention = detectMissing(item);
    if (missingMention) {
      missing.push(missingMention);
      // NOTE: a missing-person post may ALSO report damage (e.g. "busco a mi familia,
      // el edificio colapsó"). We continue processing — do not skip.
    }

    // ---- 4. Damage classification ----
    const cls = classifyDamage(text);
    if (!cls) continue; // no damage signal

    // ---- 5. Geolocate ----
    const place = bestPlace(text);
    if (!place) continue; // cannot geolocate

    const landmark = extractNamedBuilding(text);

    // ---- 6. Build candidate lead ----
    const channel = sourceChannel(item);

    /** @type {Lead} */
    const candidate = {
      lat:                  place.lat,
      lng:                  place.lng,
      estado:               place.estado,
      municipio:            place.municipio,
      parroquia:            place.parroquia,
      landmark_description: landmark,
      damage_level:         cls.damage_level,
      people_status:        cls.people_status,
      description:          buildDescription(item, channel),
      source_channel:       channel,
      corroboration_count:  1,
      _dedupKey:            '', // filled below
      _sources:             [item.url],
    };
    candidate._dedupKey = dedupKey(candidate);

    // ---- 7. Dedup within batch and against existingLeads ----
    // Check existing leads from DB first (highest priority)
    const existingMatch = existingLeads.find((e) => isDuplicate(candidate, e));
    if (existingMatch) {
      mergeInto(existingMatch, candidate);
      dupes++;
      continue;
    }

    // Check within current batch
    const batchMatch = leads.find((e) => isDuplicate(candidate, e));
    if (batchMatch) {
      mergeInto(batchMatch, candidate);
      dupes++;
      continue;
    }

    leads.push(candidate);
  }

  return {
    leads,
    missing,
    misinformation,
    stats: {
      scanned:  rawItems.length,
      kept:     leads.length,
      dupes,
      misinfo,
    },
  };
}
