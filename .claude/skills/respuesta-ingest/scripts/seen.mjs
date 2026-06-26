/**
 * seen.mjs — persistent dedup state for the ingest pipeline.
 *
 * Tracks which (platform, id) pairs have already been ingested across runs.
 * State is stored at $HOME/.respuesta-ingest/seen.json as a flat object
 * { [key: string]: 1 }.  Timestamps are intentionally omitted to keep the
 * file compact; TTL pruning can be added later if the file grows too large.
 *
 * All functions are synchronous except the async wrappers where noted.
 * Never throws — errors are logged to stderr and a safe default is returned.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

/** Absolute path to seen.json on the local filesystem. */
export const SEEN_PATH = join(homedir(), '.respuesta-ingest', 'seen.json');

/** Directory containing SEEN_PATH. */
const SEEN_DIR = join(homedir(), '.respuesta-ingest');

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/**
 * Load the seen-keys set from disk.  Returns an empty Set on any error.
 * @returns {Set<string>}
 */
export function loadSeen() {
  try {
    if (!existsSync(SEEN_PATH)) return new Set();
    const raw = readFileSync(SEEN_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return new Set(Object.keys(obj));
  } catch (err) {
    process.stderr.write(`[seen] loadSeen error: ${err?.message ?? String(err)}\n`);
    return new Set();
  }
}

/**
 * Persist a seen-keys set to disk.  Silently swallows write errors (to not
 * crash the ingest pipeline if the filesystem is unexpectedly read-only).
 * @param {Set<string>} set
 */
export function saveSeen(set) {
  try {
    mkdirSync(SEEN_DIR, { recursive: true });
    const obj = Object.fromEntries([...set].map((k) => [k, 1]));
    writeFileSync(SEEN_PATH, JSON.stringify(obj), 'utf8');
  } catch (err) {
    process.stderr.write(`[seen] saveSeen error: ${err?.message ?? String(err)}\n`);
  }
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Build the seen-key for a raw social/web item.
 * Format: "<platform>:<id>"  (both lowercase, id trimmed)
 *
 * The key must be stable across runs: the same post must always produce the
 * same string so we never re-ingest it.
 *
 * @param {string} platform  e.g. 'twitter', 'instagram', 'reddit', 'web', 'rss', 'youtube'
 * @param {string} id        platform-native post/article id or URL
 * @returns {string}
 */
export function seenKey(platform, id) {
  return `${(platform ?? 'unknown').toLowerCase()}:${String(id ?? '').trim()}`;
}

// ---------------------------------------------------------------------------
// Check / add
// ---------------------------------------------------------------------------

/**
 * Check whether a key is in the seen set.
 * @param {Set<string>} set
 * @param {string} key
 * @returns {boolean}
 */
export function seenHas(set, key) {
  return set.has(key);
}

/**
 * Add a key to the seen set (mutates the set in-place).
 * @param {Set<string>} set
 * @param {string} key
 */
export function seenAdd(set, key) {
  set.add(key);
}

// ---------------------------------------------------------------------------
// Convenience: check + add atomically (common usage pattern)
// ---------------------------------------------------------------------------

/**
 * Return true if already seen; otherwise add to the set and return false.
 * This is the idiomatic call inside the ingest loop:
 *
 *   if (seenCheckAndAdd(seen, seenKey(item.platform, item.id))) continue;
 *
 * Does NOT auto-save — caller must call saveSeen() when the batch is done.
 *
 * @param {Set<string>} set
 * @param {string} key
 * @returns {boolean}  true = already seen (skip), false = new (process)
 */
export function seenCheckAndAdd(set, key) {
  if (set.has(key)) return true;
  set.add(key);
  return false;
}
