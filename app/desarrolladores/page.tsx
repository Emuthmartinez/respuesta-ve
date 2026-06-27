import Link from 'next/link';
import type { Metadata } from 'next';
import { FederationNetwork } from '@/components/FederationNetwork';
import { getLocale } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://respuestave.org';
const API = `${BASE.replace(/\/$/, '')}/api/v1`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const es = locale === 'es';
  return {
    title: es ? 'API para desarrolladores · Respuesta VE' : 'Developer API · Respuesta VE',
    description: es
      ? 'API y servidor MCP para federar personas desaparecidas, entidades de ayuda, necesidades y canales verificados entre plataformas.'
      : 'API and MCP server to federate missing people, aid entities, needs, and verified channels across platforms.',
    alternates: { canonical: '/desarrolladores' },
  };
}

const S = {
  es: {
    heading: 'API para desarrolladores',
    intro:
      'Respuesta VE funciona como backend federado para otras superficies: tu sitio o agente puede preguntar “¿esta persona ya está reportada?”, federar registros, reconciliar estados, publicar hospitales/refugios/organizaciones verificadas, sincronizar necesidades y mostrar una insignia de socio verificado.',
    platformTitle: 'Instancia de una plataforma abierta',
    platform:
      'Esta web es la primera instancia de Humanitarian Federation Platform: un contrato reutilizable para crisis humanitarias que define registros con fuente, deduplicación revisable, proyecciones públicas seguras e insignias de socios verificados.',
    platformRepo: 'Repositorio de la plataforma',
    instanceManifest: 'Manifest de esta instancia',
    privacyTitle: 'Privacidad primero',
    privacy:
      'La cédula y las huellas de foto se usan SOLO para encontrar coincidencias y nunca se devuelven. Las respuestas solo traen datos públicos aceptados o entidades verificadas, coordenadas difuminadas, necesidades activas, canales públicos y enlace de vuelta a cada fuente. Entradas sospechosas quedan en revisión y la API nunca fusiona registros de forma destructiva.',
    endpointsTitle: 'Endpoints',
    authTitle: 'Autenticación y límites',
    auth:
      'Cada solicitud lleva una clave de socio: «Authorization: Bearer rvk_…». Crea una cuenta para emitir tu clave desde esta web. Hay límites de uso por clave (respuesta 429 con Retry-After). Ámbitos: score, match, search, ingest.',
    exampleTitle: 'Ejemplo',
    mcpTitle: 'MCP (para agentes de IA)',
    mcp:
      'Un servidor MCP expone las mismas funciones como herramientas de agente: match_person, score_persons, search_persons, submit_person, get_person_status, list_person_changes, submit_entity, search_entities, list_entity_changes y verify_badge. Configúralo apuntando a la API con tu clave:',
    accessTitle: 'Crear cuenta y clave',
    access:
      'Crea una cuenta, emite una clave y úsala desde tu servidor. La clave queda asociada a tu cuenta para poder pausar, revocar o ajustar límites si hace falta.',
    accessCta: 'Crear cuenta y clave',
    accessSignedInCta: 'Ver mis claves',
    accessSecondary: 'Las integraciones de confianza pueden pedir verificación y límites más altos cuando ya estén conectadas.',
    specLink: 'Especificación OpenAPI',
    discoveryLink: 'Descubrimiento de la API',
    back: 'Volver al inicio',
    cols: ['Método', 'Ruta', 'Para qué'],
    rows: [
      ['POST', '/score', 'Comparar un registro contra candidatos propios (sin guardar).'],
      ['POST', '/match', '¿Ya está esta persona en el índice federado?'],
      ['POST', '/persons', 'Deduplicar al ingresar y federar (requiere enlace a la fuente).'],
      ['GET', '/persons/status', 'Ver estado canónico/señales para tu externalId.'],
      ['GET', '/persons/changes', 'Sincronizar cambios aceptados desde un cursor.'],
      ['GET', '/persons', 'Buscar en el índice.'],
      ['POST', '/entities', 'Federar hospitales, refugios, organizaciones, necesidades y canales públicos.'],
      ['GET', '/entities', 'Buscar entidades verificadas por tipo, estado o texto.'],
      ['GET', '/entities/changes', 'Sincronizar entidades verificadas desde un cursor.'],
      ['GET', '/badge', 'Verificar si un dominio pertenece a un socio federado.'],
    ],
  },
  en: {
    heading: 'Developer API',
    intro:
      'Respuesta VE works as a federated backend for other surfaces: your site or agent can ask “is this person already reported?”, federate records, reconcile status, publish verified hospitals/shelters/orgs, sync needs, and show a verified partner badge.',
    platformTitle: 'Instance of an open platform',
    platform:
      'This website is the first instance of Humanitarian Federation Platform: a reusable contract for humanitarian crises that defines source-aware records, reviewable dedupe, safe public projections, and verified partner badges.',
    platformRepo: 'Platform repository',
    instanceManifest: 'This instance manifest',
    privacyTitle: 'Privacy first',
    privacy:
      'Cédula (national ID) and photo fingerprints are used ONLY to find matches and are never returned. Responses carry only accepted public metadata or verified entities, fuzzed coordinates, active needs, public channels, and a link back to each source. Suspicious entries are held for review and the API never destructively merges records.',
    endpointsTitle: 'Endpoints',
    authTitle: 'Authentication & limits',
    auth:
      'Every request carries a partner key: “Authorization: Bearer rvk_…”. Create an account to issue your key from this site. Per-key rate limits apply (429 with Retry-After). Scopes: score, match, search, ingest.',
    exampleTitle: 'Example',
    mcpTitle: 'MCP (for AI agents)',
    mcp:
      'An MCP server exposes the same capabilities as agent tools: match_person, score_persons, search_persons, submit_person, get_person_status, list_person_changes, submit_entity, search_entities, list_entity_changes, and verify_badge. Point it at the API with your key:',
    accessTitle: 'Create account and key',
    access:
      'Create an account, issue a key, and use it from your server. The key stays tied to your account so access can be paused, revoked, or rate-limited if needed.',
    accessCta: 'Create account and key',
    accessSignedInCta: 'View my keys',
    accessSecondary: 'Trusted integrations can request verification and higher limits once they are connected.',
    specLink: 'OpenAPI specification',
    discoveryLink: 'API discovery',
    back: 'Back to home',
    cols: ['Method', 'Path', 'Purpose'],
    rows: [
      ['POST', '/score', 'Compare a record against your own candidates (nothing stored).'],
      ['POST', '/match', 'Is this person already in the federated index?'],
      ['POST', '/persons', 'Dedupe-on-ingest + federate (link-back required).'],
      ['GET', '/persons/status', 'Read canonical status signals for your externalId.'],
      ['GET', '/persons/changes', 'Sync accepted changes from a cursor.'],
      ['GET', '/persons', 'Search the index.'],
      ['POST', '/entities', 'Federate hospitals, shelters, orgs, needs, and public channels.'],
      ['GET', '/entities', 'Search verified entities by type, state, or text.'],
      ['GET', '/entities/changes', 'Sync verified entities from a cursor.'],
      ['GET', '/badge', 'Check whether a domain belongs to a verified federation partner.'],
    ],
  },
} as const;

const codeCls = 'block overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100 dark:bg-black/60';

export default async function DesarrolladoresPage() {
  const locale = await getLocale();
  const s = S[locale];
  const sb = await getSupabaseServer();
  const {
    data: { user },
  } = sb ? await sb.auth.getUser() : { data: { user: null } };

  const curl = `curl -s ${API}/entities \\
  -H "Authorization: Bearer $RVK_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "externalId":"hospital-123",
    "sourceUrl":"https://partner.example/hospital-123",
    "entity":{
      "kind":"hospital",
      "name":"Hospital Central",
      "estado":"Lara",
      "channels":[{"type":"website","url":"https://partner.example/hospital-123"}],
      "needs":[{"category":"medical_supplies","title":"Gasas y solución salina","urgency":"high"}]
    }
  }'`;

  const mcpCfg = `{
  "mcpServers": {
    "respuesta-ve-federation": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.mjs"],
      "env": {
        "RVK_API_KEY": "rvk_your_partner_key",
        "RVK_API_BASE": "${API}"
      }
    }
  }
}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.intro}</p>

      <section className="mt-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 dark:bg-red-950/20">
        <h2 className="text-sm font-semibold text-red-900 dark:text-red-100">{s.platformTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed text-red-950/85 dark:text-red-100/85">{s.platform}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a
            href="https://github.com/Emuthmartinez/humanitarian-federation-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-red-700 hover:underline dark:text-red-200"
          >
            {s.platformRepo} →
          </a>
          <a
            href="/federation.instance.json"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-red-700 hover:underline dark:text-red-200"
          >
            {s.instanceManifest} →
          </a>
        </div>
      </section>

      <div className="-mx-4 mt-8 sm:-mx-6">
        <FederationNetwork locale={locale} variant="inline" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <a href={`${API}/openapi`} target="_blank" rel="noopener noreferrer"
          className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">{s.specLink} →</a>
        <a href={API} target="_blank" rel="noopener noreferrer"
          className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">{s.discoveryLink} →</a>
      </div>

      <section className="mt-8 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">🔒 {s.privacyTitle}</h2>
        <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">{s.privacy}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{s.endpointsTitle}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>{s.cols.map((c) => <th key={c} className="py-2 pr-4">{c}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r[1] + r[0]} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs font-semibold text-red-600">{r[0]}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r[1]}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-300">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{s.authTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{s.auth}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{s.exampleTitle}</h2>
        <code className={`mt-3 ${codeCls}`}><pre className="whitespace-pre">{curl}</pre></code>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{s.mcpTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{s.mcp}</p>
        <code className={`mt-3 ${codeCls}`}><pre className="whitespace-pre">{mcpCfg}</pre></code>
      </section>

      <section className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-lg font-semibold">{s.accessTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{s.access}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href={user ? '/desarrolladores/claves' : '/desarrolladores/acceder'}
            className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
            {user ? s.accessSignedInCta : s.accessCta} →
          </Link>
          <a href="mailto:api@respuestave.org?subject=Respuesta%20VE%20API%20verification"
            className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
            api@respuestave.org →
          </a>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{s.accessSecondary}</p>
      </section>

      <div className="mt-10">
        <Link href="/" className="font-medium text-red-600 hover:underline">{s.back}</Link>
      </div>
    </div>
  );
}
