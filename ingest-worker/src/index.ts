// Respuesta VE — automated damage-lead ingestion worker.
// Cron-scheduled: scans Spanish news (Google News RSS) + optionally X,
// matches a gazetteer of affected places + damage keywords, and files
// leads into Supabase as moderation_status='pending' (coordinator-reviewed).

interface Env {
  DEDUP: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RUN_TOKEN: string;
  X_BEARER?: string; // optional: set via `wrangler secret put X_BEARER` to enable X
  // optional: set via `wrangler secret put XPOZ_ACCESS_KEY` to enable social scan.
  // The durable xpoz access key (xpoz dashboard / getUserAccessKey) — never expires.
  XPOZ_ACCESS_KEY?: string;
}

interface Lead {
  lat: number;
  lng: number;
  estado: string;
  municipio: string;
  parroquia: string | null;
  damage_level: string;
  people_status: string;
  description: string;
}

interface RawItem {
  title: string;
  description: string;
  link: string;
}

// ---- gazetteer of affected places (name aliases -> coords/admin) ----
const GAZ: {
  names: string[]; estado: string; municipio: string; parroquia: string | null; lat: number; lng: number;
}[] = [
  { names: ['altamira'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Altamira', lat: 10.496, lng: -66.843 },
  { names: ['los palos grandes', 'palos grandes'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Los Palos Grandes', lat: 10.5, lng: -66.84 },
  { names: ['chacao'], estado: 'Miranda', municipio: 'Chacao', parroquia: 'Chacao', lat: 10.4975, lng: -66.853 },
  { names: ['baruta'], estado: 'Miranda', municipio: 'Baruta', parroquia: 'Baruta', lat: 10.433, lng: -66.876 },
  { names: ['el hatillo', 'hatillo'], estado: 'Miranda', municipio: 'El Hatillo', parroquia: 'El Hatillo', lat: 10.43, lng: -66.82 },
  { names: ['petare'], estado: 'Miranda', municipio: 'Sucre', parroquia: 'Petare', lat: 10.478, lng: -66.809 },
  { names: ['los teques'], estado: 'Miranda', municipio: 'Guaicaipuro', parroquia: 'Los Teques', lat: 10.344, lng: -67.041 },
  { names: ['pinto salinas'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'Pinto Salinas', lat: 10.504, lng: -66.887 },
  { names: ['san bernardino'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'San Bernardino', lat: 10.516, lng: -66.897 },
  { names: ['la pastora'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'La Pastora', lat: 10.511, lng: -66.921 },
  { names: ['el valle'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'El Valle', lat: 10.457, lng: -66.909 },
  { names: ['caracas'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: null, lat: 10.5, lng: -66.917 },
  { names: ['macuto'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Macuto', lat: 10.608, lng: -66.889 },
  { names: ['catia la mar'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Catia La Mar', lat: 10.597, lng: -67.029 },
  { names: ['maiquetia', 'simon bolivar'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Maiquetía', lat: 10.601, lng: -66.991 },
  { names: ['caraballeda'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.613, lng: -66.843 },
  { names: ['naiguata'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Naiguatá', lat: 10.616, lng: -66.734 },
  { names: ['la guaira', 'vargas'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'La Guaira', lat: 10.602, lng: -66.934 },
  { names: ['maracay'], estado: 'Aragua', municipio: 'Girardot', parroquia: 'Maracay', lat: 10.247, lng: -67.596 },
  { names: ['la victoria'], estado: 'Aragua', municipio: 'José Félix Ribas', parroquia: 'La Victoria', lat: 10.227, lng: -67.333 },
  { names: ['las tejerias'], estado: 'Aragua', municipio: 'Santos Michelena', parroquia: 'Las Tejerías', lat: 10.182, lng: -67.068 },
  { names: ['valencia'], estado: 'Carabobo', municipio: 'Valencia', parroquia: 'Valencia', lat: 10.162, lng: -68.008 },
  { names: ['puerto cabello'], estado: 'Carabobo', municipio: 'Puerto Cabello', parroquia: 'Puerto Cabello', lat: 10.473, lng: -68.013 },
  { names: ['trujillo'], estado: 'Trujillo', municipio: 'Trujillo', parroquia: 'Trujillo', lat: 9.368, lng: -70.436 },
  { names: ['valera'], estado: 'Trujillo', municipio: 'Valera', parroquia: 'Valera', lat: 9.319, lng: -70.603 },
  { names: ['coro'], estado: 'Falcón', municipio: 'Miranda', parroquia: 'Santa Ana de Coro', lat: 11.402, lng: -69.673 },
  // Sectors surfaced by the multi-surface (social/video/Exa) scan on 2026-06-25, absent from news-only ingest.
  { names: ['la candelaria', 'candelaria'], estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'La Candelaria', lat: 10.508, lng: -66.902 },
  { names: ['los corales'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.61, lng: -66.852 },
  { names: ['tanaguarena'], estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Caraballeda', lat: 10.617, lng: -66.812 },
];

const DAMAGE_KW = ['colaps', 'derrumb', 'escombr', 'destru', 'agriet', 'grieta', 'desplom', 'sepult', 'damnific', 'afectad', 'dano', 'collaps', 'rubble', 'destroy', 'damag', 'trapped'];
const COLLAPSE_KW = ['colaps', 'derrumb', 'escombr', 'desplom', 'sepult', 'destru', 'collaps', 'rubble', 'destroy'];
const SEVERE_KW = ['grave', 'sever', 'heavily'];
const PEOPLE_KW = ['atrapad', 'rescate', 'sepultad', 'bajo los escombros', 'bajo escombros', 'trapped', 'rescue', 'buried'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function classify(text: string): { damage: string; people: string } | null {
  const t = norm(text);
  if (!DAMAGE_KW.some((k) => t.includes(k))) return null;
  let damage = 'moderate';
  if (COLLAPSE_KW.some((k) => t.includes(k))) damage = 'collapsed';
  else if (SEVERE_KW.some((k) => t.includes(k))) damage = 'severe';
  const people = PEOPLE_KW.some((k) => t.includes(k)) ? 'possible' : 'unknown';
  return { damage, people };
}

// Crisis feeds carry debunked/AI-generated content (the 2026-06-25 scan caught a
// videogame clip passed off as a building collapse). Returning true drops the item
// before it ever becomes a pending lead.
//
// TODO(coordinator decision — shapes life-safety triage): define the trust policy.
// This is a genuine safety tradeoff, not boilerplate:
//   - Too aggressive → real collapse reports get silently dropped before a human sees them.
//   - Too loose → fakes reach the pending queue and burn coordinator attention.
// Consider 5-10 lines covering, in priority order:
//   1. Hard denylist of debunking phrases that should ALWAYS drop the item
//      (e.g. 'falso', 'desmentido', 'generado con ia', 'videojuego', 'fake', 'fact check').
//   2. Whether an item that merely *mentions* a denylist term as a quote should survive.
//   3. (optional) A trusted-source allowlist that bypasses the denylist for vetted outlets.
function isLikelyMisinformation(_text: string): boolean {
  // TODO: implement the policy above. Returning false keeps current behavior (no filtering).
  return false;
}

function matchPlaces(text: string): typeof GAZ {
  const t = norm(text);
  return GAZ.filter((g) => g.names.some((n) => t.includes(norm(n))));
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  for (const block of xml.split(/<item>/i).slice(1)) {
    const seg = block.split(/<\/item>/i)[0];
    const strip = (m: RegExpMatchArray | null) =>
      (m?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').trim();
    const title = strip(seg.match(/<title>([\s\S]*?)<\/title>/i));
    const description = strip(seg.match(/<description>([\s\S]*?)<\/description>/i));
    const link = (seg.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim();
    if (title) items.push({ title, description, link });
  }
  return items;
}

// GDELT DOC 2.0 API — programmatic news monitoring, free, JSON, Worker-friendly.
async function fetchNews(): Promise<RawItem[]> {
  const query =
    '(terremoto OR sismo OR earthquake) (edificio OR colapso OR derrumbe OR collapse OR building OR rubble) sourcecountry:venezuela';
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=ArtList&format=json&maxrecords=75&timespan=7d&sort=DateDesc`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'RespuestaVE-Ingest/1.0' } });
    if (!res.ok) return [];
    const j = (await res.json()) as { articles?: { url: string; title: string }[] };
    return (j.articles ?? []).map((a) => ({ title: a.title ?? '', description: '', link: a.url ?? '' }));
  } catch {
    return [];
  }
}

async function fetchX(env: Env): Promise<RawItem[]> {
  if (!env.X_BEARER) return [];
  const q = '(terremoto OR sismo) Venezuela (edificio OR colapso OR derrumbe) -is:retweet lang:es';
  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?max_results=50&query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${env.X_BEARER}` } },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { id: string; text: string }[] };
    return (j.data ?? []).map((t) => ({ title: t.text, description: '', link: `https://x.com/i/web/status/${t.id}` }));
  } catch {
    return [];
  }
}

// xpoz social scan — calls the xpoz MCP server directly over HTTPS (Streamable
// HTTP, Bearer auth). No MCP runtime needed: a single JSON-RPC tools/call POST
// returns the result inline as an SSE `data:` line. This is the always-on
// equivalent of the Mac orchestrator's social.mjs leg.
const XPOZ_QUERIES = [
  'terremoto Venezuela edificio colapso',
  'sismo Venezuela derrumbe escombros',
  'terremoto Venezuela atrapados rescate',
  'colapso La Guaira Caraballeda Macuto',
  'Venezuela earthquake building collapsed 2026',
];

async function fetchXpoz(env: Env): Promise<RawItem[]> {
  if (!env.XPOZ_ACCESS_KEY) return [];
  const items: RawItem[] = [];
  for (const query of XPOZ_QUERIES) {
    try {
      const res = await fetch('https://mcp.xpoz.ai/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.XPOZ_ACCESS_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'getTwitterPostsByKeywords',
            arguments: {
              query,
              limit: 25,
              language: 'es',
              filterOutRetweets: true,
              fields: ['id', 'text', 'authorUsername', 'createdAtDate'],
            },
          },
        }),
      });
      if (!res.ok) continue;
      const text = extractMcpText(await res.text());
      for (const row of parseXpozCompact(text)) {
        if (!row.id || !row.text) continue;
        const handle = row.authorUsername || '';
        items.push({
          title: row.text,
          description: '',
          link: handle ? `https://x.com/${handle}/status/${row.id}` : `https://x.com/i/web/status/${row.id}`,
        });
      }
    } catch {
      // fail soft per query — one bad call must not drop the rest
    }
  }
  return items;
}

// Pull result.content[0].text out of an MCP Streamable-HTTP response (the body is
// `event: message\ndata: {jsonrpc…}` SSE, or occasionally a bare JSON object).
function extractMcpText(body: string): string {
  let jsonStr = body.trim();
  const dataLine = body.split('\n').find((l) => l.startsWith('data:'));
  if (dataLine) jsonStr = dataLine.slice(5).trim();
  try {
    const env = JSON.parse(jsonStr) as { result?: { content?: { text?: string }[] } };
    return env.result?.content?.[0]?.text ?? '';
  } catch {
    return '';
  }
}

// Parse the xpoz compact `results[N]{cols}: "v1","v2"` shape into row objects.
// (Scalar fields only are requested, so xpoz always returns this compact form —
// the YAML-list form is only triggered by array fields, which we don't request.)
function parseXpozCompact(text: string): Record<string, string>[] {
  if (!text || /^status:\s*error/im.test(text)) return [];
  const lines = text.split('\n');
  const hi = lines.findIndex((l) => /results\[\d+\]\{[^}]*\}\s*:/.test(l));
  if (hi === -1) return [];
  const cols = (lines[hi].match(/\{([^}]*)\}/)?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (!cols.length) return [];
  const rows: Record<string, string>[] = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (/^\S/.test(raw) && !raw.trim().startsWith('"')) break;
    const fields = parseCsvRow(raw.trim());
    const obj: Record<string, string> = {};
    cols.forEach((c, idx) => { obj[c] = fields[idx] ?? ''; });
    if (obj.id || obj.text) rows.push(obj);
  }
  return rows;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false, quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '\\' && i + 1 < line.length) { const n = line[++i]; cur += n === 'n' ? '\n' : n === 't' ? '\t' : n; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') { inQ = true; quoted = true; }
    else if (c === ',') { out.push(quoted ? cur : cur.trim()); cur = ''; quoted = false; }
    else cur += c;
  }
  out.push(quoted ? cur : cur.trim());
  return out;
}

async function insertLead(env: Env, lead: Lead): Promise<boolean> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/buildings`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(lead),
  });
  return res.ok;
}

async function runIngest(env: Env): Promise<{ scanned: number; inserted: number; skipped: number }> {
  const items = [...(await fetchNews()), ...(await fetchX(env)), ...(await fetchXpoz(env))];
  let inserted = 0;
  let skipped = 0;
  for (const it of items) {
    const text = `${it.title} ${it.description}`;
    if (isLikelyMisinformation(text)) continue;
    const cls = classify(text);
    if (!cls) continue;
    const places = matchPlaces(text);
    if (places.length === 0) continue;

    const key = 'n:' + (await sha(it.link || it.title));
    if (await env.DEDUP.get(key)) {
      skipped++;
      continue;
    }
    // Prefer the most specific (longest) place name matched.
    const place = places.sort(
      (a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)),
    )[0];

    const lead: Lead = {
      lat: place.lat,
      lng: place.lng,
      estado: place.estado,
      municipio: place.municipio,
      parroquia: place.parroquia,
      damage_level: cls.damage,
      people_status: cls.people,
      description: `[AUTO-RSS - verificar] ${it.title}. Fuente: ${it.link}`.slice(0, 1900),
    };
    if (await insertLead(env, lead)) {
      await env.DEDUP.put(key, '1', { expirationTtl: 1209600 });
      inserted++;
    }
  }
  return { scanned: items.length, inserted, skipped };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngest(env).then((r) => console.log('ingest', JSON.stringify(r))));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run') {
      if (url.searchParams.get('token') !== env.RUN_TOKEN) return new Response('forbidden', { status: 403 });
      try {
        return Response.json(await runIngest(env));
      } catch (e) {
        return new Response('ERR: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e)), { status: 500 });
      }
    }
    if (url.pathname === '/debug') {
      const items = await fetchNews();
      return Response.json({ news_items: items.length, sample: items.slice(0, 4).map((i) => i.title) });
    }
    return new Response('respuesta-ve-ingest OK', { status: 200 });
  },
};
