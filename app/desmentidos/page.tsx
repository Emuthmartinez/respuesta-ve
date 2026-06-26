import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n-server';
import type { Locale } from '@/lib/i18n';

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

// ---- page strings ---------------------------------------------------

const STR = {
  es: {
    heading: 'Información falsa',
    subtext_pre: 'Videos, fotos y noticias relacionadas con el terremoto que han sido verificados como',
    subtext_strong: 'falsos, engañosos o sacados de contexto',
    subtext_post: '. No los compartas.',
    disclaimer_strong: 'Aviso:',
    disclaimer_body:
      'los contenidos listados aquí han sido reportados como FALSOS o engañosos. Se muestran únicamente para que puedas reconocerlos y no los difundas. Si crees que algo fue clasificado por error,',
    disclaimer_link: 'contacta a un coordinador',
    showing_200: 'Mostrando los 200 reportes más recientes.',
    empty_no_reports: 'No hay reportes verificados por el momento.',
    empty_db_error: 'No se pudo conectar con la base de datos. Inténtalo más tarde.',
    source_label: 'Fuente original →',
    debunk_label: 'Ver verificación →',
    footer:
      'Los reportes son revisados por coordinadores antes de publicarse. La plataforma no almacena ni comparte datos personales de quienes detectan contenido falso.',
    back: 'Volver al mapa',
  },
  en: {
    heading: 'False information',
    subtext_pre: 'Videos, photos and news related to the earthquake that have been verified as',
    subtext_strong: 'false, misleading, or taken out of context',
    subtext_post: '. Do not share them.',
    disclaimer_strong: 'Notice:',
    disclaimer_body:
      'The content listed here has been reported as FALSE or misleading. It is shown only so you can recognize it and avoid spreading it. If you believe something was misclassified,',
    disclaimer_link: 'contact a coordinator',
    showing_200: 'Showing the 200 most recent reports.',
    empty_no_reports: 'No verified reports at the moment.',
    empty_db_error: 'Could not connect to the database. Please try again later.',
    source_label: 'Original source →',
    debunk_label: 'View fact-check →',
    footer:
      'Reports are reviewed by coordinators before being published. The platform does not store or share personal data of those who detect false content.',
    back: 'Back to the map',
  },
} as const;

// ---- badge helpers --------------------------------------------------

const VERDICT_LABELS: Record<MisinfoRow['verdict'], { es: string; en: string }> = {
  false:      { es: 'FALSO',        en: 'FALSE' },
  misleading: { es: 'ENGAÑOSO',     en: 'MISLEADING' },
  unverified: { es: 'NO VERIFICADO', en: 'UNVERIFIED' },
  satire:     { es: 'SÁTIRA',       en: 'SATIRE' },
};

const VERDICT_COLORS: Record<MisinfoRow['verdict'], string> = {
  false:      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  misleading: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  unverified: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  satire:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const SEVERITY_LABELS: Record<MisinfoRow['severity'], { es: string; en: string }> = {
  high:   { es: 'Alto impacto',  en: 'High impact' },
  medium: { es: 'Impacto medio', en: 'Medium impact' },
  low:    { es: 'Bajo impacto',  en: 'Low impact' },
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

function formatDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-VE', {
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
  const locale = await getLocale();
  const s = STR[locale];

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
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext_pre}{' '}
        <strong>{s.subtext_strong}</strong>{s.subtext_post}
      </p>

      {/* disclaimer banner */}
      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <strong>{s.disclaimer_strong}</strong> {s.disclaimer_body}{' '}
        <Link href="/recursos" className="underline underline-offset-2 hover:no-underline">
          {s.disclaimer_link}
        </Link>
        .
      </div>

      {/* list */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-zinc-500 dark:border-white/15">
          {sb ? s.empty_no_reports : s.empty_db_error}
        </div>
      ) : (
        <>
        {rows.length === 200 && (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            {s.showing_200}
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
                  {VERDICT_LABELS[r.verdict][locale]}
                </span>

                <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[r.severity]}`}
                  />
                  {SEVERITY_LABELS[r.severity][locale]}
                </span>

                {r.related_place && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    · {r.related_place}
                  </span>
                )}

                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  {formatDate(r.created_at, locale)}
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
                  {s.source_label}{' '}
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
                    {s.debunk_label}
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
        {s.footer}{' '}
        <Link href="/" className="text-zinc-400 hover:underline">
          {s.back}
        </Link>
        .
      </p>
    </div>
  );
}
