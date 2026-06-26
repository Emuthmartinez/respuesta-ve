/**
 * social.mjs — HEADLESS xpoz collection for the respuesta-ingest pipeline.
 *
 * This is the file that fixes the context-window blowout. The old skill made
 * the interactive `claude` agent call the xpoz MCP tools directly, so the entire
 * raw social firehose (hundreds of full post objects) accumulated in the model's
 * context until it overflowed. Here we call the SAME xpoz tools from a plain Node
 * process via the `mcporter` CLI — exactly the pattern fetch_web.mjs already uses
 * for Exa (`mcporter call exa.web_search_exa ...`). The raw posts live in this
 * process's memory, get mapped to RawItem[], and are streamed to the deterministic
 * pipeline. No model context is ever involved.
 *
 * AUTH: xpoz is a Streamable-HTTP MCP server (https://mcp.xpoz.ai/mcp) with
 * Bearer-token auth. `mcporter list` shows its tool catalogue without auth, but
 * CALLING a tool needs a token. A one-time `mcporter auth xpoz` performs the
 * OAuth handshake and caches/refreshes the token so headless calls work. If the
 * token is missing/expired, every call here returns [] (fail-soft) and the run
 * proceeds with web+video only — collectSocial() reports the auth state so the
 * orchestrator can surface it.
 *
 * All functions return RawItem[] and NEVER throw.
 *
 * @typedef {import('./process.mjs').RawItem} RawItem
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const MCPORTER = 'mcporter';
const CALL_TIMEOUT_MS = 45_000;

// mcporter resolves MCP servers relative to the working directory: `exa` lives in
// the repo's config/mcporter.json and `xpoz` is a project-scoped server in
// ~/.claude.json keyed to the repo root. So every mcporter child call MUST run
// with cwd = repo root, regardless of where node was launched (launchd may set
// cwd=/). Repo root is 4 levels up from this scripts/ dir.
const PROJECT_DIR = process.env.INGEST_PROJECT_DIR
  || resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// ---------------------------------------------------------------------------
// Low-level: one headless xpoz tool call via mcporter
// ---------------------------------------------------------------------------

/**
 * Call a single xpoz tool headlessly and return the parsed array of records.
 *
 * mcporter wraps the MCP response in an envelope:
 *   { server, tool, content: [{ type: 'text', text: '<payload>' }] }
 * For an auth/other failure it returns:
 *   { server, tool, error, issue: { kind: 'auth', statusCode: 401, ... } }
 *
 * The `text` payload from xpoz is JSON — usually an array of post objects, or an
 * object wrapping one under results/data/posts/tweets/items. We extract the first
 * array we find. Returns { rows, auth } where auth is true unless a 401 was hit.
 *
 * @param {string} tool   e.g. 'getTwitterPostsByAuthor'
 * @param {object} args
 * @returns {Promise<{ rows: any[], auth: boolean }>}
 */
async function callXpoz(tool, args) {
  try {
    const { stdout } = await execFileAsync(
      MCPORTER,
      ['call', `xpoz.${tool}`, '--args', JSON.stringify(args), '--output', 'json'],
      { timeout: CALL_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, cwd: PROJECT_DIR },
    );

    const envelope = JSON.parse(stdout.trim());

    // Auth / error envelope — surface auth state so the orchestrator can warn once.
    if (envelope?.error || envelope?.issue) {
      const isAuth = envelope?.issue?.kind === 'auth' || envelope?.issue?.statusCode === 401;
      return { rows: [], auth: !isAuth };
    }

    const text = envelope?.content?.[0]?.text ?? '';
    const rows = _extractArray(text);
    return { rows, auth: true };
  } catch (err) {
    // execFile non-zero exit (incl. mcporter auth failures printed to stderr),
    // timeout, or JSON parse error. A 401 surfaced via stderr → treat as no-auth.
    const msg = String(err?.stderr ?? err?.message ?? err);
    const isAuth = /authoriz|authentic|401|run 'mcporter auth/i.test(msg);
    return { rows: [], auth: !isAuth };
  }
}

/**
 * Pull the first JSON array out of an mcporter text payload, tolerating the
 * several shapes xpoz can return (bare array, or wrapped under a common key).
 * @param {string} text
 * @returns {any[]}
 */
function _extractArray(text) {
  if (!text || typeof text !== 'string') return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ['results', 'data', 'posts', 'tweets', 'items', 'rows', 'records']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    // Some xpoz modes nest under data.results etc.
    if (parsed.data && typeof parsed.data === 'object') {
      for (const key of ['results', 'posts', 'tweets', 'items']) {
        if (Array.isArray(parsed.data[key])) return parsed.data[key];
      }
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Field pickers (xpoz field names vary slightly per platform)
// ---------------------------------------------------------------------------

const _str = (v) => (v == null ? '' : String(v));
const _num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** @param {any} r @returns {string} */
function _firstNonEmpty(r, keys) {
  for (const k of keys) {
    const v = r?.[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Per-platform mappers → RawItem
// ---------------------------------------------------------------------------

/** @returns {RawItem|null} */
function _mapTwitter(r) {
  const id = _firstNonEmpty(r, ['id', 'tweetId', 'id_str']);
  const text = _firstNonEmpty(r, ['text', 'fullText', 'full_text']);
  if (!id || !text) return null;
  const handle = _firstNonEmpty(r, ['authorUsername', 'username', 'screenName']);
  const url = handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/web/status/${id}`;
  return {
    source: handle ? `x:@${handle}` : 'x',
    platform: 'twitter',
    handle: handle ? `@${handle}` : undefined,
    id: _str(id),
    url,
    text,
    createdAt: _firstNonEmpty(r, ['createdAtDate', 'createdAt']) || undefined,
    mediaUrls: Array.isArray(r?.mediaUrls) ? r.mediaUrls : undefined,
    engagement: _num(r?.likeCount) + _num(r?.retweetCount) + _num(r?.replyCount),
  };
}

/** @returns {RawItem|null} */
function _mapReddit(r) {
  const id = _firstNonEmpty(r, ['id', 'postId']);
  const title = _firstNonEmpty(r, ['title']);
  const body = _firstNonEmpty(r, ['selftext', 'body']);
  const text = [title, body].filter(Boolean).join('. ');
  if (!id || !text) return null;
  const permalink = _firstNonEmpty(r, ['permalink', 'postUrl', 'url']);
  const url = permalink.startsWith('http') ? permalink : `https://reddit.com${permalink || ''}`;
  return {
    source: `reddit:${_firstNonEmpty(r, ['subredditName']) || 'r'}`,
    platform: 'reddit',
    handle: _firstNonEmpty(r, ['authorUsername']) || undefined,
    id: _str(id),
    url,
    text,
    createdAt: _firstNonEmpty(r, ['createdAtDate', 'createdAt']) || undefined,
    engagement: _num(r?.score) + _num(r?.commentsCount),
  };
}

/** @returns {RawItem|null} */
function _mapInstagram(r) {
  const id = _firstNonEmpty(r, ['id', 'postId']);
  const text = _firstNonEmpty(r, ['caption', 'subtitles']);
  if (!id || !text) return null;
  const code = _firstNonEmpty(r, ['codeUrl', 'code']);
  const url = code.startsWith('http') ? code : `https://instagram.com/p/${code || id}`;
  return {
    source: `ig:${_firstNonEmpty(r, ['username']) || ''}`,
    platform: 'instagram',
    handle: _firstNonEmpty(r, ['username']) || undefined,
    id: _str(id),
    url,
    text,
    createdAt: _firstNonEmpty(r, ['createdAtDate', 'createdAt']) || undefined,
    engagement: _num(r?.likeCount) + _num(r?.commentCount),
  };
}

/** @returns {RawItem|null} */
function _mapTiktok(r) {
  const id = _firstNonEmpty(r, ['id', 'postId']);
  const text = _firstNonEmpty(r, ['description', 'desc']);
  if (!id || !text) return null;
  const user = _firstNonEmpty(r, ['username']);
  const url = user ? `https://www.tiktok.com/@${user}/video/${id}` : `https://www.tiktok.com/video/${id}`;
  return {
    source: `tiktok:${user || ''}`,
    platform: 'tiktok',
    handle: user || undefined,
    id: _str(id),
    url,
    text,
    createdAt: _firstNonEmpty(r, ['createdAtDate', 'createdAt']) || undefined,
    engagement: _num(r?.likeCount) + _num(r?.playCount),
  };
}

// ---------------------------------------------------------------------------
// Public collectors
// ---------------------------------------------------------------------------

const TWITTER_FIELDS = ['id', 'text', 'authorUsername', 'createdAtDate', 'likeCount', 'retweetCount', 'replyCount', 'lang', 'mediaUrls'];

/**
 * Fetch recent posts from one tracked author.
 * @param {string} handle  e.g. '@Southcom'
 * @param {number} [limit=20]
 * @returns {Promise<{ items: RawItem[], auth: boolean }>}
 */
export async function fetchTwitterAuthor(handle, limit = 20) {
  const username = handle.replace(/^@/, '');
  const { rows, auth } = await callXpoz('getTwitterPostsByAuthor', { username, limit, fields: TWITTER_FIELDS });
  return { items: rows.map(_mapTwitter).filter(Boolean), auth };
}

/**
 * Keyword scan across one platform.
 * @param {'twitter'|'reddit'|'instagram'|'tiktok'} platform
 * @param {string} query
 * @param {{ limit?: number, lang?: string }} [opts]
 * @returns {Promise<{ items: RawItem[], auth: boolean }>}
 */
export async function fetchKeyword(platform, query, opts = {}) {
  const limit = opts.limit ?? 25;
  switch (platform) {
    case 'twitter': {
      const args = { query, limit, filterOutRetweets: true, fields: TWITTER_FIELDS };
      if (opts.lang) args.language = opts.lang;
      const { rows, auth } = await callXpoz('getTwitterPostsByKeywords', args);
      return { items: rows.map(_mapTwitter).filter(Boolean), auth };
    }
    case 'reddit': {
      const { rows, auth } = await callXpoz('getRedditPostsByKeywords', {
        query, limit, sort: 'new', fields: ['id', 'title', 'selftext', 'permalink', 'authorUsername', 'subredditName', 'score', 'commentsCount', 'createdAtDate'],
      });
      return { items: rows.map(_mapReddit).filter(Boolean), auth };
    }
    case 'instagram': {
      const { rows, auth } = await callXpoz('getInstagramPostsByKeywords', {
        query, limit, fields: ['id', 'caption', 'username', 'codeUrl', 'likeCount', 'commentCount', 'createdAtDate'],
      });
      return { items: rows.map(_mapInstagram).filter(Boolean), auth };
    }
    case 'tiktok': {
      const { rows, auth } = await callXpoz('getTiktokPostsByKeywords', {
        query, limit, fields: ['id', 'description', 'username', 'videoUrl', 'likeCount', 'playCount', 'createdAtDate'],
      });
      return { items: rows.map(_mapTiktok).filter(Boolean), auth };
    }
    default:
      return { items: [], auth: true };
  }
}

/**
 * Check the xpoz credit balance (cheap, no scrape credits). Returns null if the
 * call fails / unauthenticated.
 * @returns {Promise<{ subscriptionCredits: number|null, extraCredits: number|null }|null>}
 */
export async function fetchCredits() {
  const { rows, auth } = await callXpoz('getAccountDetails', {});
  if (!auth) return null;
  // getAccountDetails returns an object, not an array → _extractArray gives [].
  // Re-call and read the object directly.
  try {
    const { stdout } = await execFileAsync(
      MCPORTER,
      ['call', 'xpoz.getAccountDetails', '--args', '{}', '--output', 'json'],
      { timeout: CALL_TIMEOUT_MS, cwd: PROJECT_DIR },
    );
    const env = JSON.parse(stdout.trim());
    const text = env?.content?.[0]?.text ?? '';
    const obj = JSON.parse(text);
    const usage = obj?.usage ?? obj?.data?.usage ?? {};
    return {
      subscriptionCredits: usage.subscriptionCreditsRemaining ?? usage.creditsRemaining ?? null,
      extraCredits: usage.extraCreditsRemaining ?? null,
    };
  } catch {
    return rows.length ? {} : null;
  }
}

/**
 * Collect ALL social items for a tick: tracked authors + keyword scans across
 * platforms. Applies the seen-dedup inline so already-ingested posts are dropped
 * before they reach the deterministic pipeline. Streams progress to stderr.
 *
 * @param {object} cfg
 * @param {{handle:string}[]} cfg.accounts
 * @param {{query:string, lang?:string, maxResults?:number}[]} cfg.keywordQueries
 * @param {Set<string>} cfg.seen                 mutated in-place (seenCheckAndAdd)
 * @param {(platform:string,id:string)=>string} cfg.seenKey
 * @param {(set:Set<string>,key:string)=>boolean} cfg.seenCheckAndAdd
 * @param {object} [cfg.opts]
 * @param {boolean} [cfg.opts.authorsSweep=true] include per-author fetches this tick
 * @param {('twitter'|'reddit'|'instagram'|'tiktok')[]} [cfg.opts.platforms]
 * @param {number} [cfg.opts.authorLimit=20]
 * @returns {Promise<{ items: RawItem[], authed: boolean, stats: object }>}
 */
export async function collectSocial(cfg) {
  const { accounts, keywordQueries, seen, seenKey, seenCheckAndAdd, opts = {} } = cfg;
  const platforms = opts.platforms ?? ['twitter', 'reddit', 'instagram', 'tiktok'];
  const authorsSweep = opts.authorsSweep !== false;
  const authorLimit = opts.authorLimit ?? 20;

  const items = [];
  let authed = true;
  let authorCalls = 0;
  let keywordCalls = 0;
  let rawCount = 0;

  const absorb = (got) => {
    if (got.auth === false) authed = false;
    for (const it of got.items) {
      rawCount++;
      if (seenCheckAndAdd(seen, seenKey(it.platform, it.id))) continue; // already ingested
      items.push(it);
    }
  };

  // 1. Tracked authors (Twitter only) — the highest-signal, trusted-tier sources.
  if (authorsSweep) {
    for (const acct of accounts) {
      authorCalls++;
      absorb(await fetchTwitterAuthor(acct.handle, authorLimit));
      if (!authed) {
        process.stderr.write('[social] xpoz unauthenticated — run `mcporter auth xpoz`. Skipping social leg.\n');
        return { items, authed, stats: { authorCalls, keywordCalls, rawCount, kept: items.length } };
      }
    }
  }

  // 2. Keyword scans across platforms.
  for (const q of keywordQueries) {
    for (const platform of platforms) {
      keywordCalls++;
      const limit = Math.min(q.maxResults ?? 25, 50);
      absorb(await fetchKeyword(platform, q.query, { limit, lang: q.lang }));
    }
  }

  return { items, authed, stats: { authorCalls, keywordCalls, rawCount, kept: items.length } };
}
