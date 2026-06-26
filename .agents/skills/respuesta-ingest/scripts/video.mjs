/**
 * video.mjs — YouTube video scanner for the respuesta-ingest pipeline.
 *
 * Automatable path: yt-dlp ytsearchN to find recent videos, then fetch
 * auto-subtitles (--write-auto-subs, VTT format) + video description.
 * Optionally export sampleFrames() using ffmpeg for a vision pass,
 * but the primary text-based path never requires it.
 *
 * None of the exported functions ever throw — they return [] on any error.
 * Shell-outs use child_process.execFile with explicit timeouts.
 *
 * @typedef {{ source:string, platform:string, handle?:string, id:string, url:string, text:string, createdAt?:string, mediaUrls?:string[], engagement?:number }} RawItem
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const execFileAsync = promisify(execFile);

// Path to the venv-installed yt-dlp (preferred) with fallback to PATH.
const YT_DLP = process.env.YT_DLP_PATH
  ?? `${process.env.HOME}/.agent-reach-venv/bin/yt-dlp`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable short id from a string.
 * @param {string} s
 * @returns {string}
 */
function hashId(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * Parse a WebVTT (.vtt) subtitle file into plain text.
 * Strips timestamps, cue settings, WEBVTT header, and deduplicates
 * adjacent identical lines (VTT often repeats lines across cues).
 *
 * @param {string} vtt
 * @returns {string}
 */
function parseVtt(vtt) {
  const lines = vtt.split('\n');
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    const t = line.trim();
    // Skip WEBVTT header, blank lines, timestamp lines, NOTE blocks, positioning tags
    if (
      !t ||
      t.startsWith('WEBVTT') ||
      t.startsWith('NOTE') ||
      /^\d{2}:\d{2}/.test(t) ||     // timestamp line
      /^[a-f0-9-]{8,}$/.test(t) ||  // cue id (hex/uuid)
      /^\d+$/.test(t)                // sequence number
    ) {
      continue;
    }
    // Strip inline VTT tags like <00:00:01.000><c>text</c>
    const clean = t.replace(/<[^>]+>/g, '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }

  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// scanVideos — main export
// ---------------------------------------------------------------------------

/**
 * Search YouTube for recent crisis-related videos and extract text
 * (title + description + auto-subtitles) for each NEW one.
 *
 * @param {string[]} queries        Search query strings (Spanish/English).
 * @param {object}  [opts]
 * @param {number}  [opts.maxPerQuery=5]   Max videos to check per query.
 * @param {number}  [opts.maxTotal=20]     Hard cap across all queries.
 * @param {Set<string>} [opts.seenIds]     Already-processed video IDs (skipped).
 * @returns {Promise<RawItem[]>}
 */
export async function scanVideos(queries, opts = {}) {
  const {
    maxPerQuery = 5,
    maxTotal = 20,
    seenIds = new Set(),
  } = opts;

  const results = [];

  for (const query of queries) {
    if (results.length >= maxTotal) break;
    const videos = await _searchVideos(query, maxPerQuery);

    for (const video of videos) {
      if (results.length >= maxTotal) break;
      if (seenIds.has(video.id)) continue;

      const item = await _extractVideoItem(video);
      if (item) results.push(item);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// sampleFrames — optional vision path (ffmpeg)
// ---------------------------------------------------------------------------

/**
 * Extract N evenly-spaced frames from a video URL as JPEG files.
 * Returns an array of absolute file paths. Returns [] on any error.
 *
 * NOTE: This is the "optional" path — the automatable pipeline only uses
 * subtitles/description. Call this when an agent vision pass is warranted.
 *
 * @param {string} videoUrl   Direct video URL (not a YouTube watch URL).
 * @param {number} [n=4]      Number of frames to extract.
 * @returns {Promise<string[]>}
 */
export async function sampleFrames(videoUrl, n = 4) {
  let tmpDir = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'respuesta-frames-'));
    const pattern = join(tmpDir, 'frame_%03d.jpg');

    // ffmpeg: select evenly spaced frames using the fps=1/duration trick
    // We use -vf fps=... with a calculated rate to get exactly N frames.
    // Simple approach: -vframes N with -vf "select=not(mod(n\,100))"
    // Safer approach: use -ss intervals. We use select filter.
    await execFileAsync(
      'ffmpeg',
      [
        '-i', videoUrl,
        '-vf', `select=not(mod(n\\,30)),setpts=N/FRAME_RATE/TB`,
        '-vframes', String(n),
        '-q:v', '5',
        '-y',
        pattern,
      ],
      { timeout: 60_000 },
    );

    const files = await readdir(tmpDir);
    return files
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => join(tmpDir, f));
  } catch {
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal: search for videos via yt-dlp ytsearchN
// ---------------------------------------------------------------------------

/**
 * Use yt-dlp to search YouTube and return basic video metadata.
 * @param {string} query
 * @param {number} n
 * @returns {Promise<Array<{id:string, url:string, title:string, description:string, uploadDate?:string, viewCount?:number}>>}
 */
async function _searchVideos(query, n) {
  try {
    // --flat-playlist: don't download, just list metadata
    // -J: output JSON (single object per entry wrapped in a playlist)
    const { stdout } = await execFileAsync(
      YT_DLP,
      [
        `ytsearch${n}:${query}`,
        '--flat-playlist',
        '-J',
        '--no-warnings',
      ],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout.trim());
    const entries = data?.entries ?? [];

    return entries.map((e) => ({
      id: e.id ?? hashId(e.url ?? e.title ?? ''),
      url: e.url ?? `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title ?? '',
      description: e.description ?? '',
      uploadDate: e.upload_date ?? undefined, // YYYYMMDD string
      viewCount: e.view_count ?? undefined,
    })).filter((e) => e.id && e.url);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal: fetch subtitles + description for a single video
// ---------------------------------------------------------------------------

/**
 * Download auto-generated subtitles (es, en) and the full description for a
 * single video. Returns a RawItem or null if there's nothing useful.
 *
 * @param {{ id:string, url:string, title:string, description:string, uploadDate?:string, viewCount?:number }} video
 * @returns {Promise<RawItem|null>}
 */
async function _extractVideoItem(video) {
  let tmpDir = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'respuesta-subs-'));

    // Ensure URL is a full watch URL
    const watchUrl = video.url.startsWith('http')
      ? video.url
      : `https://www.youtube.com/watch?v=${video.id}`;

    // yt-dlp: download auto-subs only (no video), write description
    // --write-auto-subs: auto-generated subtitles
    // --sub-lang es,en: prefer Spanish then English
    // --sub-format vtt: WebVTT (easiest to parse)
    // --skip-download: don't download video
    // --write-description: save description to .description file
    // --no-progress: suppress progress output
    let ytArgs = [
      watchUrl,
      '--write-auto-subs',
      '--sub-lang', 'es,en',
      '--sub-format', 'vtt',
      '--skip-download',
      '--write-description',
      '--no-progress',
      '--no-warnings',
      '--output', join(tmpDir, '%(id)s.%(ext)s'),
    ];

    await execFileAsync(YT_DLP, ytArgs, {
      timeout: 45_000,
      maxBuffer: 8 * 1024 * 1024,
    });

    // Read whatever files were written
    const files = await readdir(tmpDir).catch(() => []);

    // Collect subtitle text (prefer Spanish, fall back to English)
    let subText = '';
    const subFiles = files.filter((f) => f.endsWith('.vtt'));
    // Sort: es.vtt before en.vtt
    subFiles.sort((a, b) => {
      const aEs = a.includes('.es.') ? 0 : 1;
      const bEs = b.includes('.es.') ? 0 : 1;
      return aEs - bEs;
    });
    for (const sf of subFiles.slice(0, 2)) {
      const raw = await readFile(join(tmpDir, sf), 'utf-8').catch(() => '');
      if (raw) {
        subText += (subText ? ' ' : '') + parseVtt(raw);
        break; // take first (best language)
      }
    }

    // Read description file if available
    const descFile = files.find((f) => f.endsWith('.description'));
    const descText = descFile
      ? await readFile(join(tmpDir, descFile), 'utf-8').catch(() => '')
      : '';

    // Compose full text: title + description + subtitles
    const fullText = [
      video.title,
      descText.trim(),
      subText,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 5000);

    // Skip if there's nothing substantial
    if (fullText.trim().length < 20) return null;

    // Parse upload date to ISO string
    let createdAt;
    if (video.uploadDate && /^\d{8}$/.test(video.uploadDate)) {
      const d = video.uploadDate;
      createdAt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }

    return {
      source: `yt:${video.id}`,
      platform: 'youtube',
      id: video.id,
      url: watchUrl,
      text: fullText,
      ...(createdAt ? { createdAt } : {}),
      ...(video.viewCount != null ? { engagement: video.viewCount } : {}),
    };
  } catch {
    return null;
  } finally {
    // Always clean up tmp dir
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
