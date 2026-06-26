/**
 * fetch_web.mjs — web/RSS/Exa/Jina/GDELT fetchers for the respuesta-ingest pipeline.
 *
 * All functions return RawItem[]. None ever throw — they return [] on any error.
 * Shell-outs use child_process.execFile with explicit timeouts.
 *
 * @typedef {{ source:string, platform:string, handle?:string, id:string, url:string, text:string, createdAt?:string, mediaUrls?:string[], engagement?:number }} RawItem
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable short id from a URL or arbitrary string.
 * @param {string} s
 * @returns {string}
 */
function hashId(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * Strip HTML tags and CDATA wrappers from a string.
 * @param {string} s
 * @returns {string}
 */
function stripHtml(s) {
  return (s ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// fetchExa — Exa semantic web search via mcporter
// ---------------------------------------------------------------------------

/**
 * Search the web using Exa via mcporter.
 * Returns up to `n` results as RawItem[].
 *
 * mcporter invocation:
 *   mcporter call exa.web_search_exa --args '{"query":"...","numResults":N}' --output json
 *
 * @param {string} query
 * @param {number} [n=6]
 * @returns {Promise<RawItem[]>}
 */
export async function fetchExa(query, n = 6) {
  try {
    const args = JSON.stringify({ query, numResults: n });
    const { stdout } = await execFileAsync(
      'mcporter',
      ['call', 'exa.web_search_exa', '--args', args, '--output', 'json'],
      { timeout: 30_000 },
    );

    // mcporter returns a JSON envelope: { content: [{ type:"text", text:"..." }] }
    const envelope = JSON.parse(stdout.trim());
    const raw = envelope?.content?.[0]?.text ?? '';

    // The text is markdown-style "Title: ...\nURL: ...\nPublished: ...\nHighlights:\n..." blocks
    return _parseExaText(raw, query);
  } catch {
    return [];
  }
}

/**
 * Parse the plain-text output from mcporter exa.web_search_exa into RawItem[].
 * @param {string} raw
 * @param {string} query
 * @returns {RawItem[]}
 */
function _parseExaText(raw, query) {
  const items = [];
  // Split on "---" separator between result blocks
  const blocks = raw.split(/\n---\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const titleMatch = block.match(/^Title:\s*(.+)/m);
    const urlMatch = block.match(/^URL:\s*(.+)/m);
    const pubMatch = block.match(/^Published:\s*(.+)/m);
    const highlightStart = block.indexOf('Highlights:');
    const highlights = highlightStart >= 0 ? block.slice(highlightStart + 11).replace(/^[\s>]+/gm, '').trim() : '';

    const title = titleMatch?.[1]?.trim() ?? '';
    const url = urlMatch?.[1]?.trim() ?? '';
    if (!url) continue;

    const text = [title, highlights].filter(Boolean).join('\n').slice(0, 4000);
    const createdAt = pubMatch?.[1]?.trim() !== 'N/A' ? pubMatch?.[1]?.trim() : undefined;

    items.push({
      source: `exa:${query.slice(0, 60)}`,
      platform: 'web',
      id: hashId(url),
      url,
      text,
      ...(createdAt ? { createdAt } : {}),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// fetchGdelt — GDELT DOC 2.0 API
// Mirrors the query in ingest-worker/src/index.ts fetchNews().
// ---------------------------------------------------------------------------

/**
 * Query GDELT DOC 2.0 for recent earthquake/building news from Venezuela.
 * Uses node global fetch (Node 18+).
 *
 * @returns {Promise<RawItem[]>}
 */
export async function fetchGdelt() {
  // Exact same query as ingest-worker/src/index.ts
  const query =
    '(terremoto OR sismo OR earthquake) (edificio OR colapso OR derrumbe OR collapse OR building OR rubble) sourcecountry:venezuela';
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=ArtList&format=json&maxrecords=75&timespan=7d&sort=DateDesc`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RespuestaVE-Ingest/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    /** @type {{ articles?: { url:string, title:string, seendate?:string }[] }} */
    const j = await res.json();
    return (j.articles ?? []).map((a) => ({
      source: 'gdelt',
      platform: 'web',
      id: hashId(a.url ?? a.title ?? Math.random().toString()),
      url: a.url ?? '',
      text: a.title ?? '',
      ...(a.seendate ? { createdAt: a.seendate } : {}),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// fetchRss — minimal RSS/Atom parser
// Ports parseRss() from ingest-worker/src/index.ts and extends it.
// ---------------------------------------------------------------------------

/**
 * Fetch and parse an RSS/Atom feed URL.
 * Falls back to [] on any network/parse error (graceful degradation).
 *
 * @param {string} feedUrl
 * @returns {Promise<RawItem[]>}
 */
export async function fetchRss(feedUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'RespuestaVE-Ingest/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const xml = await res.text();
    return _parseRss(xml, feedUrl);
  } catch {
    return [];
  }
}

/**
 * Parse RSS/Atom XML string into RawItem[].
 * Ported from ingest-worker parseRss() with Atom <entry> support added.
 *
 * @param {string} xml
 * @param {string} feedUrl
 * @returns {RawItem[]}
 */
function _parseRss(xml, feedUrl) {
  const items = [];

  // Helper: extract first match of a tag from a block, strip CDATA+HTML
  const extract = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? stripHtml(m[1]) : '';
  };

  // RSS <item> blocks
  const rssChunks = xml.split(/<item[^>]*>/i).slice(1);
  for (const chunk of rssChunks) {
    const seg = chunk.split(/<\/item>/i)[0];
    const title = extract(seg, 'title');
    const description = extract(seg, 'description');
    const link = (seg.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim()
      || (seg.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? '');
    const pubDate = extract(seg, 'pubDate') || extract(seg, 'dc:date');
    if (!title && !link) continue;
    const url = link || feedUrl;
    items.push({
      source: `rss:${_feedLabel(feedUrl)}`,
      platform: 'rss',
      id: hashId(url + title),
      url,
      text: [title, description].filter(Boolean).join('\n').slice(0, 3000),
      ...(pubDate ? { createdAt: pubDate } : {}),
    });
  }

  // Atom <entry> blocks (if RSS gave nothing)
  if (items.length === 0) {
    const atomChunks = xml.split(/<entry[^>]*>/i).slice(1);
    for (const chunk of atomChunks) {
      const seg = chunk.split(/<\/entry>/i)[0];
      const title = extract(seg, 'title');
      const summary = extract(seg, 'summary') || extract(seg, 'content');
      const link =
        (seg.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i)?.[1] ?? '') ||
        (seg.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? '') ||
        (seg.match(/<id>([\s\S]*?)<\/id>/i)?.[1] ?? '').trim();
      const updated = extract(seg, 'updated') || extract(seg, 'published');
      if (!title && !link) continue;
      const url = link || feedUrl;
      items.push({
        source: `rss:${_feedLabel(feedUrl)}`,
        platform: 'rss',
        id: hashId(url + title),
        url,
        text: [title, summary].filter(Boolean).join('\n').slice(0, 3000),
        ...(updated ? { createdAt: updated } : {}),
      });
    }
  }

  return items;
}

/**
 * Derive a short human-readable label from a feed URL for use in the source field.
 * e.g. "https://efectococuyo.com/feed" -> "efectococuyo"
 * @param {string} url
 * @returns {string}
 */
function _feedLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0];
  } catch {
    return url.slice(0, 40);
  }
}

// ---------------------------------------------------------------------------
// fetchJina — reader-mode page extraction via r.jina.ai
// ---------------------------------------------------------------------------

/**
 * Fetch a URL through Jina's reader proxy (r.jina.ai) for clean article text.
 * Uses curl via execFile — avoids Node TLS issues with some VE news sites.
 *
 * @param {string} url
 * @returns {Promise<RawItem[]>}
 */
export async function fetchJina(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURI(url)}`;
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-s',
        '--max-time', '25',
        '--user-agent', 'RespuestaVE-Ingest/1.0',
        jinaUrl,
      ],
      { timeout: 30_000 },
    );
    const text = stdout.trim();
    if (!text || text.length < 50) return [];

    // First line is usually "Title: ..."
    const titleMatch = text.match(/^(?:Title:\s*)(.+)/m);
    const title = titleMatch?.[1]?.trim() ?? '';

    return [{
      source: `jina:${_feedLabel(url)}`,
      platform: 'web',
      id: hashId(url),
      url,
      text: [title, text].join('\n').slice(0, 5000),
    }];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// fetchSite — fetch a specific site URL (monitors sosvenezuela2026.com, etc.)
// Uses Jina under the hood for clean extraction.
// ---------------------------------------------------------------------------

/**
 * Fetch a single site URL and return extracted content as RawItem[].
 * Backed by fetchJina for reader-mode extraction.
 *
 * @param {string} url
 * @returns {Promise<RawItem[]>}
 */
export async function fetchSite(url) {
  const items = await fetchJina(url);
  // Re-stamp source/platform as 'site'
  return items.map((item) => ({
    ...item,
    source: `site:${_feedLabel(url)}`,
    platform: 'site',
  }));
}
