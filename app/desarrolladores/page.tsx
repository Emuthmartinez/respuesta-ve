import Link from 'next/link';
import type { Metadata } from 'next';
import { FederationNetwork } from '@/components/FederationNetwork';
import { getLocale } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://respuestave.org';
const SITE = BASE.replace(/\/$/, '');
const API = `${SITE}/api/v1`;
const MANIFEST = `${SITE}/federation.instance.json`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const es = locale === 'es';
  return {
    title: es ? 'API para desarrolladores · Respuesta VE' : 'Developer API · Respuesta VE',
    description: es
      ? 'Referencia completa de la API, OpenAPI, MCP y cola de intake para integrar agentes, registros y superficies humanitarias.'
      : 'Complete API, OpenAPI, MCP, and intake-queue reference for integrating agents, registries, and humanitarian surfaces.',
    alternates: { canonical: '/desarrolladores' },
  };
}

const S = {
  es: {
    eyebrow: 'Humanitarian Federation API',
    heading: 'API para desarrolladores y agentes',
    intro:
      'Respuesta VE expone una API federada para que registros, sitios de ayuda y agentes de IA puedan deduplicar personas desaparecidas, sincronizar estados, publicar entidades verificadas, enviar datos crudos a revisión y mostrar insignias de socios.',
    quickTitle: 'Puntos de entrada',
    baseLabel: 'Base URL',
    manifestLabel: 'Manifest de instancia',
    openApiLabel: 'OpenAPI 3.1',
    discoveryLabel: 'Descubrimiento JSON',
    platformTitle: 'Instancia de una plataforma abierta',
    platform:
      'Esta web es la primera instancia desplegada de Humanitarian Federation Platform: registros con fuente, deduplicación revisable, proyecciones públicas seguras, sincronización por cursor e insignias verificables por dominio.',
    platformRepo: 'Repositorio de la plataforma',
    capabilitiesTitle: 'Qué soporta hoy',
    capabilities: [
      ['Personas desaparecidas', 'Score local, match contra el índice vivo, ingest idempotente, búsqueda pública redacted y sincronización de cambios.'],
      ['Estado federado', 'Cada socio conserva su externalId y puede consultar señales canónicas cuando otra fuente actualiza una persona.'],
      ['Entidades de coordinación', 'Hospitales, refugios, centros de acopio, organizaciones, canales públicos, necesidades activas y recursos fuera de Venezuela.'],
      ['Intake autenticado', 'JSON, texto, CSV o listas de URLs entran con clave de socio a una cola restringida para revisión operativa antes de promover datos canónicos.'],
      ['Insignias de socios', 'Cualquier sitio puede verificar si un dominio pertenece a un socio federado y mostrar metadatos públicos de confianza.'],
      ['Contratos para agentes', 'El manifest, el discovery JSON, OpenAPI y el servidor MCP dan rutas consumibles por herramientas automatizadas.'],
    ],
    privacyTitle: 'Reglas de seguridad y privacidad',
    privacy: [
      'La cédula y las huellas de foto se usan solo para encontrar coincidencias; nunca se devuelven.',
      'Las coordenadas precisas y contactos privados no salen por la API pública; las respuestas usan proyecciones verificadas y coordenadas difuminadas.',
      'Las coincidencias son señales asesoras. La API no fusiona ni resuelve registros de forma destructiva.',
      'Los datos crudos enviados por public-intake quedan restringidos hasta que operadores los revisen.',
    ],
    endpointsTitle: 'Catálogo completo de endpoints',
    endpointIntro:
      'Las rutas se muestran con el prefijo completo. Los endpoints de socio aceptan `Authorization: Bearer rvk_...` o `x-api-key`.',
    cols: ['Método', 'Ruta', 'Acceso', 'Para qué', 'Notas'],
    endpointGroups: [
      {
        title: 'Descubrimiento público',
        rows: [
          ['GET', '/api/v1', 'Público', 'Mapa JSON de versión, rutas, scopes, auth y política PII.', 'Punto inicial recomendado para agentes.'],
          ['GET', '/api/v1/openapi', 'Público', 'Contrato OpenAPI 3.1 completo.', 'Cache público de 1 hora.'],
          ['GET', '/federation.instance.json', 'Público', 'Manifest de instancia y capacidades soportadas.', 'Incluye dominios, eventId y apiBaseUrl.'],
          ['GET', '/api/v1/badge?domain=', 'Público', 'Verifica si un dominio es socio federado.', 'Normaliza protocolo, path y www.'],
        ],
      },
      {
        title: 'Personas desaparecidas',
        rows: [
          ['POST', '/api/v1/score', 'Scope `score`', 'Compara un registro contra candidatos propios.', 'Puro: no consulta ni guarda en base de datos. Máximo 200 candidatos.'],
          ['POST', '/api/v1/match', 'Scope `match`', 'Busca coincidencias contra el índice federado vivo.', 'Devuelve registros redacted con link-back a la fuente.'],
          ['POST', '/api/v1/persons', 'Scope `ingest`', 'Federa un registro con dedupe al ingresar.', 'Requiere record, externalId y externalUrl. Idempotente por clave + externalId.'],
          ['GET', '/api/v1/persons?q=&estado=&limit=', 'Scope `search`', 'Busca el índice aceptado por nombre y/o estado.', 'Requiere q de 2+ caracteres o estado. Límite máximo 50.'],
          ['GET', '/api/v1/persons/status?externalId=', 'Scope `search`', 'Consulta señales canónicas para tu propio registro.', 'Úsalo para reconciliar cuando otra fuente marque a alguien como ubicado.'],
          ['GET', '/api/v1/persons/changes?since=&limit=', 'Scope `search`', 'Sincroniza registros públicos aceptados desde un cursor.', 'since debe ser ISO. Usa nextSince como siguiente cursor.'],
        ],
      },
      {
        title: 'Entidades, necesidades y canales',
        rows: [
          ['POST', '/api/v1/entities', 'Scope `ingest`', 'Federa una entidad verificada con canales y necesidades.', 'Hospitales, refugios, centros, organizaciones, canales oficiales y recursos transfronterizos.'],
          ['GET', '/api/v1/entities?q=&kind=&estado=&audienceScope=&countryCode=&limit=', 'Scope `search`', 'Busca entidades verificadas.', 'Requiere al menos un filtro. Límite máximo 100.'],
          ['GET', '/api/v1/entities/changes?since=&limit=', 'Scope `search`', 'Sincroniza entidades verificadas desde un cursor.', 'Devuelve canales públicos, necesidades activas y nextSince.'],
        ],
      },
      {
        title: 'Intake público restringido',
        rows: [
          ['GET', '/api/v1/public-intake', 'Público', 'Explica el contrato, límites y payload recomendado.', 'Útil para agentes antes de enviar datos no normalizados.'],
          ['POST', '/api/v1/public-intake', 'Scope `ingest`', 'Envía JSON, texto, CSV o URLs a revisión operativa.', 'Máximo 5 MiB. Devuelve receipt 202; nada se publica automáticamente.'],
          ['GET', '/api/v1/public-intake?id=', 'Scope `ingest`', 'Consulta el estado seguro de un receipt.', 'No devuelve el payload crudo ni contactos privados.'],
        ],
      },
    ],
    authTitle: 'Autenticación, límites y errores',
    authBullets: [
      'Scopes disponibles: `score`, `match`, `search`, `ingest`.',
      'Crea una cuenta en esta web para emitir una clave inicial; el equipo puede pausar, revocar o ajustar límites por cuenta.',
      'Los cuerpos JSON de endpoints de socio tienen límite de 256 KiB; public-intake acepta hasta 5 MiB con scope `ingest`.',
      'Las respuestas exitosas de socio incluyen `X-RateLimit-Remaining-Minute` y `X-RateLimit-Remaining-Day`.',
      'Rate limit devuelve `429` con `Retry-After`; errores usan `{ "ok": false, "error": "..." }`.',
      'La fuente de ingest se toma de la clave de API, no del body. El campo `source` de `/persons` queda por compatibilidad.',
    ],
    schemaTitle: 'Modelos clave',
    schemaBlocks: [
      {
        title: 'PersonInput',
        rows: [
          ['name', 'Requerido. Nombre reportado.'],
          ['age, estado, municipio', 'Opcionales para mejorar scoring y búsqueda.'],
          ['cedula, photoPhash', 'Opcionales y solo para match; nunca se devuelven. photoPhash debe ser dHash hex de 16 caracteres.'],
          ['status', '`missing`, `found_safe`, `found_injured`, `deceased` o `unknown`.'],
          ['lastSeenAt, sourceUpdatedAt', '`sourceUpdatedAt` es el reloj de sincronización; updates viejos no pisan datos nuevos.'],
        ],
      },
      {
        title: 'EntityInput',
        rows: [
          ['kind, name', 'Requeridos. kind cubre hospital, clinic, shelter, donation_center, supply_hub, organization y más.'],
          ['audienceScope, countryCode', '`in_venezuela`, `outside_venezuela` o `both`; countryCode usa ISO-3166 alfa-2.'],
          ['lat, lng, address', 'lat/lng se guardan precisos pero salen difuminados; address no sale por la API pública.'],
          ['channels', 'Hasta 20 canales: website, phone_public, whatsapp_public, donation_url, volunteer_form, social, etc.'],
          ['needs', 'Hasta 50 necesidades con categoría, urgencia, cantidad opcional y expiresAt.'],
        ],
      },
      {
        title: 'PublicIntakeRequest',
        rows: [
          ['Payload libre', 'Objeto JSON, array, string, texto plano o CSV.'],
          ['sourceRecordId, contentFingerprint', 'Recomendados para dedupe humano-operativo.'],
          ['processingHints, canonicalCandidates', 'Guían promoción posterior a `/persons` o `/entities`; no auto-merge.'],
          ['contact, notes, media metadata', 'Se preservan como campos restringidos, no como recibo público.'],
        ],
      },
    ],
    agentTitle: 'Contrato rápido para agentes',
    agentIntro:
      'Si tu agente no conoce el dominio, empieza por el manifest. Si conoce la API, empieza por discovery y luego OpenAPI. Usa public-intake con clave para formas desconocidas; usa `/persons` y `/entities` solo cuando tienes un registro canónico con link-back.',
    examplesTitle: 'Ejemplos copiables',
    mcpTitle: 'MCP para agentes',
    mcp:
      'El servidor MCP incluido en este repo envuelve los flujos con clave de socio y la verificación de insignia. Para public-intake, llama la API HTTP con la misma clave de socio.',
    mcpToolsTitle: 'Herramientas MCP disponibles',
    accessTitle: 'Crear cuenta y clave',
    access:
      'Crea una cuenta, emite una clave y úsala desde tu servidor. La clave queda asociada a tu cuenta para poder pausar, revocar o ajustar límites si hace falta.',
    accessCta: 'Crear cuenta y clave',
    accessSignedInCta: 'Ver mis claves',
    accessSecondary: 'Las integraciones de confianza pueden pedir verificación y límites más altos cuando ya estén conectadas.',
    back: 'Volver al inicio',
  },
  en: {
    eyebrow: 'Humanitarian Federation API',
    heading: 'Developer and Agent API',
    intro:
      'Respuesta VE exposes a federated API so registries, aid sites, and AI agents can deduplicate missing people, sync status, publish verified entities, submit raw data for review, and display partner trust badges.',
    quickTitle: 'Entry points',
    baseLabel: 'Base URL',
    manifestLabel: 'Instance manifest',
    openApiLabel: 'OpenAPI 3.1',
    discoveryLabel: 'Discovery JSON',
    platformTitle: 'Instance of an open platform',
    platform:
      'This site is the first deployed instance of Humanitarian Federation Platform: source-aware records, reviewable dedupe, safe public projections, cursor sync, and domain-verifiable partner badges.',
    platformRepo: 'Platform repository',
    capabilitiesTitle: 'What is supported today',
    capabilities: [
      ['Missing people', 'Local scoring, live-index matching, idempotent ingest, redacted public search, and changes sync.'],
      ['Federated status', 'Each partner keeps its own externalId and can read canonical signals when another source updates a person.'],
      ['Coordination entities', 'Hospitals, shelters, supply hubs, organizations, public channels, active needs, and resources outside Venezuela.'],
      ['Authenticated intake', 'JSON, text, CSV, or URL lists enter a restricted operator queue with a partner key before any canonical promotion.'],
      ['Partner badges', 'Any site can verify whether a domain belongs to a federated partner and display public trust metadata.'],
      ['Agent contracts', 'The manifest, discovery JSON, OpenAPI, and MCP server provide routes that automated tools can consume.'],
    ],
    privacyTitle: 'Security and privacy rules',
    privacy: [
      'Cédula and photo fingerprints are only used to find matches; they are never returned.',
      'Precise coordinates and private contacts never leave through the public API; responses use verified projections and fuzzed coordinates.',
      'Matches are advisory signals. The API never destructively merges or resolves records.',
      'Raw public-intake data stays restricted until operators review it.',
    ],
    endpointsTitle: 'Complete endpoint catalog',
    endpointIntro:
      'Routes include the full prefix. Partner endpoints accept `Authorization: Bearer rvk_...` or `x-api-key`.',
    cols: ['Method', 'Route', 'Access', 'Purpose', 'Notes'],
    endpointGroups: [
      {
        title: 'Public discovery',
        rows: [
          ['GET', '/api/v1', 'Public', 'JSON map of version, routes, scopes, auth, and PII policy.', 'Recommended starting point for agents.'],
          ['GET', '/api/v1/openapi', 'Public', 'Complete OpenAPI 3.1 contract.', 'Public cache for 1 hour.'],
          ['GET', '/federation.instance.json', 'Public', 'Instance manifest and supported capabilities.', 'Includes domains, eventId, and apiBaseUrl.'],
          ['GET', '/api/v1/badge?domain=', 'Public', 'Verify whether a domain is a federated partner.', 'Normalizes protocol, path, and www.'],
        ],
      },
      {
        title: 'Missing people',
        rows: [
          ['POST', '/api/v1/score', 'Scope `score`', 'Compare one record against caller-owned candidates.', 'Pure: no database read or write. Maximum 200 candidates.'],
          ['POST', '/api/v1/match', 'Scope `match`', 'Find matches against the live federated index.', 'Returns redacted records with source link-backs.'],
          ['POST', '/api/v1/persons', 'Scope `ingest`', 'Federate a record with dedupe-on-ingest.', 'Requires record, externalId, and externalUrl. Idempotent by key + externalId.'],
          ['GET', '/api/v1/persons?q=&estado=&limit=', 'Scope `search`', 'Search the accepted index by name and/or state.', 'Requires q with 2+ chars or estado. Maximum limit 50.'],
          ['GET', '/api/v1/persons/status?externalId=', 'Scope `search`', 'Read canonical signals for your own record.', 'Use to reconcile when another source marks someone found.'],
          ['GET', '/api/v1/persons/changes?since=&limit=', 'Scope `search`', 'Sync accepted public records from a cursor.', 'since must be ISO. Use nextSince as the next cursor.'],
        ],
      },
      {
        title: 'Entities, needs, and channels',
        rows: [
          ['POST', '/api/v1/entities', 'Scope `ingest`', 'Federate a verified entity with channels and needs.', 'Hospitals, shelters, hubs, orgs, official channels, and cross-border resources.'],
          ['GET', '/api/v1/entities?q=&kind=&estado=&audienceScope=&countryCode=&limit=', 'Scope `search`', 'Search verified entities.', 'Requires at least one filter. Maximum limit 100.'],
          ['GET', '/api/v1/entities/changes?since=&limit=', 'Scope `search`', 'Sync verified entities from a cursor.', 'Returns public channels, active needs, and nextSince.'],
        ],
      },
      {
        title: 'Restricted public intake',
        rows: [
          ['GET', '/api/v1/public-intake', 'Public', 'Explain the contract, limits, and recommended payload.', 'Useful for agents before sending unnormalized data.'],
          ['POST', '/api/v1/public-intake', 'Scope `ingest`', 'Submit JSON, text, CSV, or URLs for operator review.', 'Maximum 5 MiB. Returns a 202 receipt; nothing is published automatically.'],
          ['GET', '/api/v1/public-intake?id=', 'Scope `ingest`', 'Read receipt-safe processing status.', 'Does not return the raw payload or private contacts.'],
        ],
      },
    ],
    authTitle: 'Authentication, limits, and errors',
    authBullets: [
      'Available scopes: `score`, `match`, `search`, `ingest`.',
      'Create an account on this site to issue an initial key; the team can pause, revoke, or adjust limits per account.',
      'Partner JSON bodies are capped at 256 KiB; public-intake accepts up to 5 MiB with scope `ingest`.',
      'Successful partner responses include `X-RateLimit-Remaining-Minute` and `X-RateLimit-Remaining-Day`.',
      'Rate limiting returns `429` with `Retry-After`; errors use `{ "ok": false, "error": "..." }`.',
      'Ingest source attribution comes from the API key, not the body. `/persons` keeps `source` only for compatibility.',
    ],
    schemaTitle: 'Key models',
    schemaBlocks: [
      {
        title: 'PersonInput',
        rows: [
          ['name', 'Required. Reported full name.'],
          ['age, estado, municipio', 'Optional fields that improve scoring and search.'],
          ['cedula, photoPhash', 'Optional match-only keys; never returned. photoPhash must be a 16-character hex dHash.'],
          ['status', '`missing`, `found_safe`, `found_injured`, `deceased`, or `unknown`.'],
          ['lastSeenAt, sourceUpdatedAt', '`sourceUpdatedAt` is the sync clock; stale updates cannot overwrite newer data.'],
        ],
      },
      {
        title: 'EntityInput',
        rows: [
          ['kind, name', 'Required. kind covers hospital, clinic, shelter, donation_center, supply_hub, organization, and more.'],
          ['audienceScope, countryCode', '`in_venezuela`, `outside_venezuela`, or `both`; countryCode uses ISO-3166 alpha-2.'],
          ['lat, lng, address', 'lat/lng are stored precise but returned fuzzed; address is not returned by the public API.'],
          ['channels', 'Up to 20 channels: website, phone_public, whatsapp_public, donation_url, volunteer_form, social, etc.'],
          ['needs', 'Up to 50 needs with category, urgency, optional quantity, and expiresAt.'],
        ],
      },
      {
        title: 'PublicIntakeRequest',
        rows: [
          ['Free-form payload', 'JSON object, array, string, plain text, or CSV.'],
          ['sourceRecordId, contentFingerprint', 'Recommended for human/operator dedupe.'],
          ['processingHints, canonicalCandidates', 'Guide later promotion to `/persons` or `/entities`; never auto-merge.'],
          ['contact, notes, media metadata', 'Preserved as restricted fields, not public receipt fields.'],
        ],
      },
    ],
    agentTitle: 'Quick contract for agents',
    agentIntro:
      'If your agent does not know the domain, start from the manifest. If it knows the API, start from discovery and then OpenAPI. Use public-intake with a key for unknown shapes; use `/persons` and `/entities` only when you have a canonical source record with a link-back.',
    examplesTitle: 'Copyable examples',
    mcpTitle: 'MCP for agents',
    mcp:
      'The MCP server included in this repo wraps partner-key workflows and badge verification. For public-intake, call the HTTP API with the same partner key.',
    mcpToolsTitle: 'Available MCP tools',
    accessTitle: 'Create account and key',
    access:
      'Create an account, issue a key, and use it from your server. The key stays tied to your account so access can be paused, revoked, or rate-limited if needed.',
    accessCta: 'Create account and key',
    accessSignedInCta: 'View my keys',
    accessSecondary: 'Trusted integrations can request verification and higher limits once they are connected.',
    back: 'Back to home',
  },
} as const;

const mcpTools = [
  'match_person',
  'score_persons',
  'search_persons',
  'submit_person',
  'get_person_status',
  'list_person_changes',
  'submit_entity',
  'search_entities',
  'list_entity_changes',
  'verify_badge',
] as const;

const methodClass = (method: string) =>
  method === 'POST'
    ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-900'
    : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900';

const preCls = 'overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100';
const inlineCodeCls = 'rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-white/10';

export default async function DesarrolladoresPage() {
  const locale = await getLocale();
  const s = S[locale];
  const sb = await getSupabaseServer();
  const {
    data: { user },
  } = sb ? await sb.auth.getUser() : { data: { user: null } };

  const agentContract = JSON.stringify({
    eventId: 'venezuela-earthquakes-2026',
    apiBaseUrl: API,
    manifest: MANIFEST,
    discovery: API,
    openapi: `${API}/openapi`,
    publicRoutes: [
      'GET /api/v1',
      'GET /api/v1/openapi',
      'GET /federation.instance.json',
      'GET /api/v1/badge?domain=',
      'GET /api/v1/public-intake',
    ],
    keyManagement: '/desarrolladores/claves',
    partnerAuth: ['Authorization: Bearer $RVK_API_KEY', 'x-api-key: $RVK_API_KEY'],
    scopes: {
      score: ['POST /api/v1/score'],
      match: ['POST /api/v1/match'],
      search: [
        'GET /api/v1/persons',
        'GET /api/v1/persons/status',
        'GET /api/v1/persons/changes',
        'GET /api/v1/entities',
        'GET /api/v1/entities/changes',
      ],
      ingest: ['POST /api/v1/persons', 'POST /api/v1/entities', 'POST /api/v1/public-intake', 'GET /api/v1/public-intake?id='],
    },
    syncRules: [
      'Treat matches as advisory; never auto-merge people.',
      'Use sourceUpdatedAt when changing person/entity status so stale source data cannot overwrite newer data.',
      'Use nextSince from changes responses as the next cursor.',
      'Send unknown/raw shapes to public-intake for operator review before canonical promotion.',
    ],
    privacyRules: [
      'cedula and photoPhash are match-only and never returned',
      'public responses use redacted records and fuzzed coordinates',
      'public-intake receipts never echo raw payloads or private contacts',
    ],
  }, null, 2);

  const matchCurl = `curl -s ${API}/match \\
  -H "Authorization: Bearer $RVK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "record": {
      "name": "Ana Diaz",
      "age": 31,
      "estado": "Lara",
      "municipio": "Barquisimeto"
    },
    "limit": 10
  }'`;

  const entityCurl = `curl -s ${API}/entities \\
  -H "Authorization: Bearer $RVK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "hospital-central-123",
    "sourceUrl": "https://partner.example/hospital-central-123",
    "entity": {
      "kind": "hospital",
      "name": "Hospital Central",
      "estado": "Lara",
      "municipio": "Barquisimeto",
      "audienceScope": "in_venezuela",
      "countryCode": "VE",
      "channels": [
        {"type": "website", "url": "https://partner.example/hospital-central-123", "isPrimary": true}
      ],
      "needs": [
        {"category": "medical_supplies", "title": "Gasas y solucion salina", "urgency": "high"}
      ]
    }
  }'`;

  const publicIntakeCurl = `curl -s ${API}/public-intake \\
  -H "Authorization: Bearer $RVK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "eventId": "venezuela-earthquakes-2026",
    "source": "volunteer-discord",
    "sourceRecordId": "discord:message:123",
    "contentFingerprint": "sha256:...",
    "kind": "mixed",
    "processingHints": {
      "dedupeMode": "candidate_review_not_auto_merge",
      "promotionPath": "/api/v1/entities"
    },
    "data": "Hospital Central solicita agua y gasas. https://example.org/post/123"
  }'`;

  const changesCurl = `curl -s "${API}/persons/changes?since=2026-06-26T00:00:00Z&limit=100" \\
  -H "Authorization: Bearer $RVK_API_KEY"`;

  const mcpCfg = `{
  "mcpServers": {
    "respuesta-ve-federation": {
      "command": "node",
      "args": ["/absolute/path/to/respuesta-ve/mcp-server/index.mjs"],
      "env": {
        "RVK_API_KEY": "rvk_your_partner_key",
        "RVK_API_BASE": "${API}"
      }
    }
  }
}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{s.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{s.heading}</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{s.intro}</p>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="entry-points">
        <h2 id="entry-points" className="sr-only">{s.quickTitle}</h2>
        {[
          [s.baseLabel, API],
          [s.discoveryLabel, API],
          [s.openApiLabel, `${API}/openapi`],
          [s.manifestLabel, MANIFEST],
        ].map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-black/10 p-3 text-sm transition hover:border-red-300 hover:bg-red-50 dark:border-white/10 dark:hover:border-red-800 dark:hover:bg-red-950/20"
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className="mt-2 block break-all font-mono text-xs text-red-700 dark:text-red-200">{href}</span>
          </a>
        ))}
      </section>

      <section className="mt-8 border-l-4 border-red-600 bg-red-50 px-4 py-4 dark:bg-red-950/20">
        <h2 className="text-sm font-semibold text-red-950 dark:text-red-100">{s.platformTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed text-red-950/85 dark:text-red-100/85">{s.platform}</p>
        <a
          href="https://github.com/Emuthmartinez/humanitarian-federation-platform"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-red-700 hover:underline dark:text-red-200"
        >
          {s.platformRepo} →
        </a>
      </section>

      <section className="mt-10" aria-labelledby="capabilities">
        <h2 id="capabilities" className="text-xl font-semibold">{s.capabilitiesTitle}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.capabilities.map(([title, text]) => (
            <article key={title} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="-mx-4 mt-8 sm:-mx-6">
        <FederationNetwork locale={locale} variant="inline" />
      </div>

      <section className="mt-10 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">{s.privacyTitle}</h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-amber-950/90 dark:text-amber-100/90">
          {s.privacy.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="endpoints">
        <h2 id="endpoints" className="text-xl font-semibold">{s.endpointsTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.endpointIntro}</p>
        <div className="mt-5 space-y-8">
          {s.endpointGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{group.title}</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="min-w-[920px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                    <tr>
                      {s.cols.map((col) => <th key={col} className="px-3 py-2 font-semibold">{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(([method, path, access, purpose, notes]) => (
                      <tr key={`${method}-${path}`} className="border-t border-black/5 dark:border-white/10">
                        <td className="px-3 py-3 align-top">
                          <span className={`inline-flex rounded px-2 py-1 font-mono text-[11px] font-bold ring-1 ${methodClass(method)}`}>
                            {method}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-xs">{path}</td>
                        <td className="px-3 py-3 align-top text-xs text-zinc-600 dark:text-zinc-300">{access}</td>
                        <td className="px-3 py-3 align-top text-zinc-800 dark:text-zinc-100">{purpose}</td>
                        <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-300">{notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]" aria-labelledby="auth-and-schemas">
        <div>
          <h2 id="auth-and-schemas" className="text-xl font-semibold">{s.authTitle}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {s.authBullets.map((item) => <li key={item}>- {renderInlineCode(item)}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold">{s.schemaTitle}</h2>
          <div className="mt-3 space-y-3">
            {s.schemaBlocks.map((block) => (
              <article key={block.title} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <h3 className="font-mono text-sm font-semibold">{block.title}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  {block.rows.map(([field, detail]) => (
                    <div key={field} className="grid gap-1 sm:grid-cols-[150px_1fr]">
                      <dt className="font-mono text-xs text-red-700 dark:text-red-200">{field}</dt>
                      <dd className="leading-relaxed text-zinc-600 dark:text-zinc-300">{renderInlineCode(detail)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="agent-contract">
        <h2 id="agent-contract" className="text-xl font-semibold">{s.agentTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.agentIntro}</p>
        <pre className={`mt-4 ${preCls}`}><code>{agentContract}</code></pre>
      </section>

      <section className="mt-10" aria-labelledby="examples">
        <h2 id="examples" className="text-xl font-semibold">{s.examplesTitle}</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <pre className={preCls}><code>{matchCurl}</code></pre>
          <pre className={preCls}><code>{entityCurl}</code></pre>
          <pre className={preCls}><code>{publicIntakeCurl}</code></pre>
          <pre className={preCls}><code>{changesCurl}</code></pre>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="mcp">
        <h2 id="mcp" className="text-xl font-semibold">{s.mcpTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.mcp}</p>
        <h3 className="mt-5 text-sm font-semibold">{s.mcpToolsTitle}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {mcpTools.map((tool) => (
            <span key={tool} className="rounded bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">{tool}</span>
          ))}
        </div>
        <pre className={`mt-4 ${preCls}`}><code>{mcpCfg}</code></pre>
      </section>

      <section className="mt-10 rounded-lg border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xl font-semibold">{s.accessTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.access}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href={user ? '/desarrolladores/claves' : '/desarrolladores/acceder'}
            className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
          >
            {user ? s.accessSignedInCta : s.accessCta} →
          </Link>
          <a
            href="mailto:api@respuestave.org?subject=Respuesta%20VE%20API%20verification"
            className="rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            api@respuestave.org →
          </a>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{s.accessSecondary}</p>
      </section>

      <div className="mt-10">
        <Link href="/" className="font-medium text-red-600 hover:underline">{s.back}</Link>
      </div>
    </main>
  );
}

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={part} className={inlineCodeCls}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
