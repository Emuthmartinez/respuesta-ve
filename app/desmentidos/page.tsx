import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Información Falsa — Respuesta VE',
  description:
    'Listado de noticias, videos e imágenes relacionados con el terremoto en Venezuela que han sido verificados como falsos o engañosos.',
};

// Shape returned by the misinformation_reports_public view (0013 migration).
interface MisinfoRow {
  id: string;
  claim: string;
  verdict: 'false' | 'misleading' | 'unverified' | 'satire';
  explanation: string;
  debunk_url: string | null;
  source_url: string;
  related_place: string | null;
  severity: 'low' | 'medium' | 'high';
  created_at: string;
}

// ---- badge helpers --------------------------------------------------

const VERDICT_LABELS: Record<MisinfoRow['verdict'], string> = {
  false:       'FALSO',
  misleading:  'ENGAÑOSO',
  unverified:  'NO VERIFICADO',
  satire:      'SÁTIRA',
};

const VERDICT_COLORS: Record<MisinfoRow['verdict'], string> = {
  false:       'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  misleading:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  unverified:  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  satire:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const SEVERITY_LABELS: Record<MisinfoRow['severity'], string> = {
  high:   'Alto impacto',
  medium: 'Impacto medio',
  low:    'Bajo impacto',
};

const SEVERITY_DOT: Record<MisinfoRow['severity'], string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-zinc-400',
};

// Truncate long URLs to keep layout tidy.
function shortUrl(url: string, max = 60): string {
  try {
    const u = new URL(url);
    const raw = u.hostname + u.pathname;
    return raw.length > max ? raw.slice(0, max) + '…' : raw;
  } catch {
    return url.slice(0, max);
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// ---- page -----------------------------------------------------------

export default async function DesmentidosPage() {
  const sb = await getSupabaseServer();
  let rows: MisinfoRow[] = [];

  if (sb) {
    const { data } = await sb
      .from('misinformation_reports_public')
      .select('id, claim, verdict, explanation, debunk_url, source_url, related_place, severity, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    rows = (data ?? []) as MisinfoRow[];
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* heading */}
      <h1 className="text-2xl font-bold tracking-tight">Información falsa</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Videos, fotos y noticias relacionadas con el terremoto que han sido
        verificados como <strong>falsos, engañosos o sacados de contexto</strong>.
        No los compartas.
      </p>

      {/* disclaimer banner */}
      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <strong>Aviso:</strong> los contenidos listados aquí han sido reportados
        como FALSOS o engañosos. Se muestran únicamente para que puedas
        reconocerlos y no los difundas. Si crees que algo fue clasificado por
        error,{' '}
        <Link href="/recursos" className="underline underline-offset-2 hover:no-underline">
          contacta a un coordinador
        </Link>
        .
      </div>

      {/* list */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-zinc-500 dark:border-white/15">
          {sb
            ? 'No hay reportes verificados por el momento.'
            : 'No se pudo conectar con la base de datos. Inténtalo más tarde.'}
        </div>
      ) : (
        <>
        {rows.length === 200 && (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Mostrando los 200 reportes más recientes.
          </p>
        )}
        <ul className="mt-6 space-y-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900"
            >
              {/* verdict + severity row */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${VERDICT_COLORS[r.verdict]}`}
                >
                  {VERDICT_LABELS[r.verdict]}
                </span>

                <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[r.severity]}`}
                  />
                  {SEVERITY_LABELS[r.severity]}
                </span>

                {r.related_place && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    · {r.related_place}
                  </span>
                )}

                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  {formatDate(r.created_at)}
                </span>
              </div>

              {/* claim */}
              <p className="mt-2 font-medium leading-snug">{r.claim}</p>

              {/* explanation */}
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                {r.explanation}
              </p>

              {/* links */}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:underline dark:text-zinc-400"
                  title={r.source_url}
                >
                  Fuente original →{' '}
                  <span className="font-mono">{shortUrl(r.source_url)}</span>
                </a>

                {r.debunk_url && (
                  <a
                    href={r.debunk_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-green-700 hover:underline dark:text-green-400"
                    title={r.debunk_url}
                  >
                    Ver verificación →
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {/* footer note */}
      <p className="mt-8 text-xs text-zinc-500">
        Los reportes son revisados por coordinadores antes de publicarse. La
        plataforma no almacena ni comparte datos personales de quienes detectan
        contenido falso.{' '}
        <Link href="/" className="text-zinc-400 hover:underline">
          Volver al mapa
        </Link>
        .
      </p>
    </div>
  );
}
