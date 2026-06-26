/**
 * sources.mjs — static catalogue of monitored sources for the respuesta-ingest pipeline.
 *
 * The running agent picks up ACCOUNTS for xpoz tool-calls (getTwitterPostsByAuthor),
 * KEYWORD_QUERIES for keyword scans, RSS_FEEDS for fetchRss(), SITES for fetchSite(),
 * and YT_QUERIES for scanVideos().
 *
 * Tiers: official > media > journalist > social
 *   These mirror SOURCE_TIERS in trust.mjs — keep in sync.
 */

// ---------------------------------------------------------------------------
// X / Twitter — 10 tracked accounts (agent makes xpoz tool-calls per handle)
// ---------------------------------------------------------------------------

/** @type {{ handle: string; tier: 'official'|'media'|'journalist'|'social'; description: string }[]} */
export const ACCOUNTS = [
  { handle: '@Southcom',      tier: 'official',    description: 'US Southern Command — official military updates' },
  { handle: '@usembassyve',   tier: 'official',    description: 'US Embassy Venezuela — official consular alerts' },
  { handle: '@nayibbukele',   tier: 'official',    description: 'El Salvador president — regional aid/solidarity posts' },
  { handle: '@SA_Defensa',    tier: 'official',    description: 'Venezuelan defense ministry / civil protection signals' },
  { handle: '@CaracasChron',  tier: 'media',       description: 'Caracas Chronicles — bilingual political/civil-society journalism' },
  { handle: '@OrlvndoA',      tier: 'journalist',  description: 'Orlando Avendaño — periodista de opinión/campo' },
  { handle: '@agusantonetti', tier: 'journalist',  description: 'Agustín Antonetti — corresponsal / periodista de campo' },
  { handle: '@EmmaRincon',    tier: 'journalist',  description: 'Emma Rincón — periodista venezolana' },
  { handle: '@iamGermania',   tier: 'journalist',  description: 'Germania — periodista / narradora de campo' },
  { handle: '@metavarce',     tier: 'journalist',  description: 'Meta Varce — social/journalist hybrid, La Guaira coverage' },
  { handle: '@rcamachovzla',  tier: 'journalist',  description: 'Rafael Camacho — periodista venezolano, fuerte cobertura en video' },
];

// ---------------------------------------------------------------------------
// Keyword queries — used for xpoz getTwitterPostsByKeywords, Reddit, Instagram,
// TikTok scans. Array of { query, lang?, maxResults? }.
// ---------------------------------------------------------------------------

/** @type {{ query: string; lang?: string; maxResults?: number }[]} */
export const KEYWORD_QUERIES = [
  // Core Spanish collapse/damage queries
  { query: 'terremoto Venezuela edificio colapso',         lang: 'es', maxResults: 50 },
  { query: 'sismo Venezuela derrumbe escombros',           lang: 'es', maxResults: 50 },
  { query: 'terremoto Venezuela atrapados rescate',        lang: 'es', maxResults: 50 },
  { query: 'edificio derrumbado Caracas 2026',             lang: 'es', maxResults: 30 },
  { query: 'colapso La Guaira Caraballeda Macuto',         lang: 'es', maxResults: 30 },
  { query: 'personas atrapadas Caracas terremoto',         lang: 'es', maxResults: 30 },
  { query: 'Residencias colapso Caracas terremoto',        lang: 'es', maxResults: 25 },
  { query: 'derrumbe La Candelaria San Bernardino sismo',  lang: 'es', maxResults: 25 },
  { query: 'Los Corales Tanaguarena caraballeda colapso',  lang: 'es', maxResults: 20 },
  // English / bilingual
  { query: 'Venezuela earthquake building collapsed 2026', lang: 'en', maxResults: 40 },
  { query: 'Venezuela earthquake trapped rescue rubble',   lang: 'en', maxResults: 40 },
  { query: 'Caracas earthquake building collapse',         lang: 'en', maxResults: 25 },
  { query: 'La Guaira Venezuela earthquake damage',        lang: 'en', maxResults: 25 },
  // Misinformation / fact-check terms (feed detectDebunk)
  { query: 'terremoto Venezuela falso video fake IA',      lang: 'es', maxResults: 20 },
  { query: 'Venezuela earthquake fake video AI generated', lang: 'en', maxResults: 20 },
];

// ---------------------------------------------------------------------------
// RSS feeds — Venezuelan news outlets.  fetchRss() fails soft; all URLs are
// best-known feed endpoints; some may have moved — the fetcher returns [] on error.
// ---------------------------------------------------------------------------

/** @type {{ name: string; url: string; language: string }[]} */
export const RSS_FEEDS = [
  { name: 'Efecto Cocuyo',  url: 'https://efectococuyo.com/feed/',               language: 'es' },
  { name: 'El Pitazo',      url: 'https://elpitazo.net/feed/',                   language: 'es' },
  { name: 'Runrunes',       url: 'https://runrun.es/feed/',                      language: 'es' },
  { name: 'Tal Cual',       url: 'https://talcualdigital.com/feed/',             language: 'es' },
  { name: 'La Patilla',     url: 'https://www.lapatilla.com/feed/',              language: 'es' },
  { name: 'Crónica Uno',    url: 'https://cronica.uno/feed/',                    language: 'es' },
  { name: 'El Nacional',    url: 'https://www.elnacional.com/feed/',             language: 'es' },
  // International wires (may cover Venezuela earthquake)
  { name: 'Reuters ES',     url: 'https://feeds.reuters.com/reuters/MXdomesticNews', language: 'es' },
  { name: 'BBC Mundo',      url: 'https://feeds.bbci.co.uk/mundo/rss.xml',      language: 'es' },
];

// ---------------------------------------------------------------------------
// Sites — monitored for federation leads and debunks.
// NOT scraped into a competing registry; use fetchJina/fetchSite for text only.
// ---------------------------------------------------------------------------

/** @type {{ name: string; url: string; role: 'missing_registry'|'crisis_platform'; notes: string }[]} */
export const SITES = [
  {
    name: 'desaparecidosterremotovenezuela.com',
    url:  'https://desaparecidosterremotovenezuela.com',
    role: 'missing_registry',
    notes: 'Volunteer missing-persons registry. Link-out only (external_source = desaparecidosterremotovenezuela). Do NOT bulk-import as buildings rows.',
  },
  {
    name: 'sosvenezuela2026.com',
    url:  'https://sosvenezuela2026.com',
    role: 'crisis_platform',
    notes: 'Parallel crisis platform. Monitor /noticias for damage leads + debunks. Treat as federation source.',
  },
  {
    name: 'sosvenezuela2026 noticias',
    url:  'https://sosvenezuela2026.com/noticias',
    role: 'crisis_platform',
    notes: 'News section of the parallel platform. Primary page for leads + misinformation debunks.',
  },
];

// ---------------------------------------------------------------------------
// YouTube queries — used by scanVideos() in video.mjs.
// Mix Spanish + English; prefer recent (last 72 h).
// ---------------------------------------------------------------------------

/** @type {{ query: string; maxResults?: number }[]} */
export const YT_QUERIES = [
  { query: 'terremoto Venezuela edificio colapso 2026',   maxResults: 5 },
  { query: 'sismo Venezuela derrumbe Caracas',            maxResults: 5 },
  { query: 'terremoto La Guaira Caraballeda colapso',     maxResults: 5 },
  { query: 'Venezuela earthquake building collapse 2026', maxResults: 5 },
  { query: 'Caracas earthquake collapse rescue',          maxResults: 4 },
  { query: 'terremoto Venezuela atrapados rescate video', maxResults: 4 },
];

// ---------------------------------------------------------------------------
// Exa / web search queries — used by fetchExa() in fetch_web.mjs.
// ---------------------------------------------------------------------------

/** @type {{ query: string; n?: number }[]} */
export const EXA_QUERIES = [
  { query: 'terremoto Venezuela 2026 edificio colapsado OR derrumbe', n: 6 },
  { query: 'Venezuela earthquake 2026 building collapsed rescue',     n: 6 },
  { query: 'La Guaira Caraballeda terremoto 2026 colapso',            n: 5 },
];
