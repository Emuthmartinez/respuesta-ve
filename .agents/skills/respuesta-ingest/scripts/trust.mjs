/**
 * trust.mjs — source-tier classification, misinformation pre-filter, debunk detection.
 *
 * @typedef {import('./process.mjs').RawItem} RawItem
 * @typedef {{ claim:string, verdict:'false'|'misleading'|'unverified'|'satire', explanation:string, debunk_url?:string, source_url:string, related_place?:string, severity:'low'|'medium'|'high' }} MisinformationItem
 */

// ---------------------------------------------------------------------------
// Source tiers
// ---------------------------------------------------------------------------

/**
 * Map of X handle (lowercase, no @) -> tier string.
 * @type {Record<string, string>}
 */
export const SOURCE_TIERS = {
  southcom: 'official',
  usembassyve: 'official',
  nayibbukele: 'official',
  sa_defensa: 'official',
  caracaschron: 'media',
  orlvndoa: 'journalist',
  agusantonetti: 'journalist',
  emmarincon: 'journalist',
  iamgermania: 'journalist',
  metavarce: 'journalist',
  rcamachovzla: 'journalist',
};

/**
 * Derive source tier from a RawItem.
 * Uses the handle field (strips leading @) or falls back to source string.
 * @param {RawItem} item
 * @returns {'official'|'media'|'journalist'|'social'|'unknown'}
 */
export function sourceTier(item) {
  const handle = (item.handle ?? '').toLowerCase().replace(/^@/, '');
  if (handle && SOURCE_TIERS[handle]) return SOURCE_TIERS[handle];

  // Try extracting handle from source string: 'x:@Southcom' -> 'southcom'
  const srcMatch = (item.source ?? '').match(/x:@?([a-zA-Z0-9_]+)/i);
  if (srcMatch) {
    const srcHandle = srcMatch[1].toLowerCase();
    if (SOURCE_TIERS[srcHandle]) return SOURCE_TIERS[srcHandle];
  }

  // Platform-level defaults
  const platform = item.platform ?? '';
  if (platform === 'web' || platform === 'rss') return 'media';
  if (platform === 'twitter' || platform === 'instagram' || platform === 'tiktok' || platform === 'reddit') return 'social';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Soft misinformation pre-filter (isLikelyMisinformation)
// ---------------------------------------------------------------------------

/**
 * Soft pre-filter: phrases that suggest the ITEM ITSELF is spreading false content.
 * Distinct from debunk detection (detectDebunk). This is used to skip items before
 * they become leads — lower precision, higher recall.
 *
 * Policy:
 *   Hard-drop if BOTH: (a) a debunk/fake signal AND (b) a media-production marker.
 *   The idea: a simple tweet saying "esto es falso" is a debunk, not a fake spread.
 *   A post embedding a synthetic clip ("ia", "videojuego") IS likely misinformation.
 */
const MISINFO_SIGNALS = [
  'generado con ia',
  'generada con ia',
  'generado por ia',
  'generada por ia',
  'hecho con ia',
  'creado con ia',
  'ai-generated',
  'generated with ai',
  'ai generated',
  'videojuego',
  'video game',
  'videogame',
  'captura de pantalla del juego',
  'gameplay',
  'renderizado',
  'deepfake',
  'cgi',
  'computer generated',
];

const FAKE_SIGNALS = [
  'falso',
  'fake',
  'manipulado',
  'montaje',
  'hoax',
  'satira',
  'sátira',
  'no es real',
  'es mentira',
  'desinformacion',
  'desinformación',
];

/**
 * Returns { flag, reason } where flag=true means the text is likely spreading
 * misinformation (synthetic/fabricated media content). Does NOT catch debunks —
 * those are handled by detectDebunk.
 * @param {string} text
 * @returns {{ flag: boolean, reason?: string }}
 */
export function isLikelyMisinformation(text) {
  const t = _norm(text);

  const hasMisinfo = MISINFO_SIGNALS.some((s) => t.includes(s));
  const hasFake = FAKE_SIGNALS.some((s) => t.includes(s));

  if (hasMisinfo && hasFake) {
    const trigger = MISINFO_SIGNALS.find((s) => t.includes(s));
    const fTrigger = FAKE_SIGNALS.find((s) => t.includes(s));
    return { flag: true, reason: `media-production marker "${trigger}" + fake signal "${fTrigger}"` };
  }

  return { flag: false };
}

// ---------------------------------------------------------------------------
// Debunk detection (detectDebunk)
// ---------------------------------------------------------------------------

/**
 * Phrases that mark the text ITSELF as a fact-check / debunk article or post.
 * These are strong positive signals that the author is CORRECTING misinformation,
 * not spreading it. We route these items to misinformation[] instead of leads[].
 */
export const DEBUNK_PHRASES = [
  // Spanish hard debunks
  'verificado: falso',
  'verificado:falso',
  'es falso',
  'es falsa',
  'es fake',
  'es un fake',
  'esto es falso',
  'esto es fake',
  'imagen falsa',
  'video falso',
  'vídeo falso',
  'falso video',
  'falso vídeo',
  'desmentido',
  'desmentimos',
  'hemos desmentido',
  'fue desmentido',
  'no es cierto',
  'no es verdad',
  'es mentira',
  'es un montaje',
  'desinformación confirmada',
  'hecho verificado: falso',
  // AI/game production + debunk combination (the real sample debunk)
  'generado a partir de un videojuego',
  'modificado con ia',
  'modificado con inteligencia artificial',
  'modificado por ia',
  // English hard debunks
  'fact check',
  'fact-check',
  'verified false',
  'this is fake',
  'this is a fake',
  'this video is fake',
  'debunked',
  'false claim',
  'spreading misinformation',
  'this is misinformation',
  'verified: misinformation',
  'fact check: misinformation',
  'not real footage',
  'not real video',
];

/**
 * Detect when text is a fact-check/debunk post. Returns a MisinformationItem
 * when the text qualifies, otherwise null.
 *
 * The real-world sample this MUST catch:
 *   "Falso video que muestra el colapso de dos edificios … generado a partir de
 *    un videojuego y modificado con IA"
 *
 * @param {string} text
 * @param {string} url  source URL
 * @returns {MisinformationItem|null}
 */
export function detectDebunk(text, url) {
  const t = _norm(text);

  const matchedPhrase = DEBUNK_PHRASES.find((p) => t.includes(_norm(p)));
  if (!matchedPhrase) return null;

  // Extract a claim snippet (first 200 chars of original text)
  const claim = text.trim().slice(0, 200);

  // Assess severity based on context
  let severity = 'medium';
  if (
    t.includes('colapso') ||
    t.includes('collapse') ||
    t.includes('atrapado') ||
    t.includes('trapped') ||
    t.includes('muertos') ||
    t.includes('death')
  ) {
    severity = 'high'; // Fake collapse claims are especially dangerous in a real crisis
  } else if (t.includes('videojuego') || t.includes('video game') || t.includes('ia') || t.includes('ai')) {
    severity = 'medium';
  } else {
    severity = 'low';
  }

  // Determine verdict
  let verdict = 'false';
  if (t.includes('satira') || t.includes('sátira') || t.includes('satire')) {
    verdict = 'satire';
  } else if (t.includes('misleading') || t.includes('engañoso') || t.includes('engañosa') || t.includes('manipulado')) {
    verdict = 'misleading';
  } else if (t.includes('unverified') || t.includes('sin verificar') || t.includes('no verificado')) {
    verdict = 'unverified';
  }

  // Try to identify related place
  let related_place = null;
  const placeHints = [
    ['la guaira', 'La Guaira'],
    ['caraballeda', 'Caraballeda'],
    ['caracas', 'Caracas'],
    ['maiquetia', 'Maiquetía'],
    ['vargas', 'La Guaira / Vargas'],
  ];
  const tNorm = _norm(text);
  for (const [key, label] of placeHints) {
    if (tNorm.includes(key)) {
      related_place = label;
      break;
    }
  }

  // Try to extract the verification/debunk link from the text. Prefer a URL that
  // immediately follows a debunk marker ("Desmentido: https://…"), else the first
  // in-text URL that isn't the source post itself. Powers the "Ver verificación"
  // button on /desmentidos.
  let debunk_url;
  const markerMatch = text.match(
    /(?:desmentido|verificaci[oó]n|verificado|fact[\s-]?check|chequeo|m[aá]s\s*info|debunk)[\s:•▶️.>-]*?(https?:\/\/[^\s"'<>)]+)/i,
  );
  if (markerMatch) {
    debunk_url = markerMatch[1];
  } else {
    const urls = text.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
    debunk_url = urls.find((u) => u !== url);
  }

  return {
    claim,
    verdict,
    explanation: `Texto detectado como desmentido/verificación. Frase clave: "${matchedPhrase}". Fuente: ${url}`,
    source_url: url,
    ...(debunk_url ? { debunk_url } : {}),
    related_place,
    severity,
  };
}

// ---------------------------------------------------------------------------
// Trust score
// ---------------------------------------------------------------------------

/**
 * Compute a 0..1 trust score for a RawItem.
 *
 * Tier weights (base):
 *   official   -> 0.95
 *   media      -> 0.80
 *   journalist -> 0.75
 *   social     -> 0.45
 *   unknown    -> 0.35
 *
 * Bumps:
 *   +0.05 if engagement > 500 (viral, more eyes = more scrutiny)
 *   +0.10 if the url is an established outlet domain
 *
 * Caps at 1.0.
 *
 * @param {RawItem} item
 * @returns {number} 0..1
 */
export function trustScore(item) {
  const TIER_BASE = {
    official: 0.95,
    media: 0.80,
    journalist: 0.75,
    social: 0.45,
    unknown: 0.35,
  };

  const tier = sourceTier(item);
  let score = TIER_BASE[tier] ?? 0.35;

  // Engagement bump (corroboration proxy)
  if ((item.engagement ?? 0) > 500) score += 0.05;

  // Established outlet domain bump
  const TRUSTED_DOMAINS = [
    'efectococuyo.com',
    'elpitazo.net',
    'runrunes.net',
    'talcualdigital.com',
    'lapatilla.com',
    'cronica.uno',
    'elnacional.com',
    'reuters.com',
    'apnews.com',
    'bbc.com',
    'elpais.com',
    'france24.com',
    'dw.com',
  ];
  const urlLower = (item.url ?? '').toLowerCase();
  if (TRUSTED_DOMAINS.some((d) => urlLower.includes(d))) score += 0.10;

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize string: lowercase, strip NFD diacritics.
 * @param {string} s
 * @returns {string}
 */
function _norm(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
