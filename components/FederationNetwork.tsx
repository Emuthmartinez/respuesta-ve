import Link from 'next/link';
import { federationCapabilities, federationPartners } from '@/lib/federation-partners';
import type { Locale } from '@/lib/i18n';
import { tr } from '@/lib/i18n';

type Variant = 'home' | 'page' | 'inline';

interface FederationNetworkProps {
  locale: Locale;
  variant?: Variant;
}

const copy = {
  es: {
    eyebrow: 'Backend federado',
    heading: 'Sitios conectados a Respuesta VE',
    intro:
      'Respuesta VE sirve como backend de federación: recibe datos de superficies aliadas, los preserva con procedencia, los limpia, los deduplica para revisión y publica una verdad normalizada cuando corresponde.',
    powered: 'Qué procesa',
    flow: 'Flujo de datos',
    capabilities: 'Capacidades del backend',
    viewAll: 'Ver red de socios',
    joinTitle: 'Para el próximo sitio',
    join:
      'Una web, formulario, Discord, hoja de cálculo o scraper puede enviar datos para revisión. La sincronización de registros procesados se hace desde el servidor del socio con cursores de cambios.',
    docs: 'Ver API para desarrolladores',
    open: 'Abrir sitio',
  },
  en: {
    eyebrow: 'Federated backend',
    heading: 'Sites connected to Respuesta VE',
    intro:
      'Respuesta VE serves as the federation backend: it receives data from partner surfaces, preserves source provenance, cleans it, dedupes it for review, and publishes normalized truth when appropriate.',
    powered: 'What it processes',
    flow: 'Data flow',
    capabilities: 'Backend capabilities',
    viewAll: 'View partner network',
    joinTitle: 'For the next site',
    join:
      'A website, form, Discord, spreadsheet, or scraper can send data for review. Processed-record sync happens from the partner server using change-feed cursors.',
    docs: 'View developer API',
    open: 'Open site',
  },
} as const;

function statusClasses(status: string): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
}

export function FederationNetwork({ locale, variant = 'home' }: FederationNetworkProps) {
  const s = copy[locale];
  const isPage = variant === 'page';
  const partner = federationPartners[0];

  return (
    <section className={isPage ? 'mx-auto w-full max-w-6xl px-4 py-10' : 'mx-auto w-full max-w-6xl px-4 py-8'}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">{s.eyebrow}</p>
          <h2 className={isPage ? 'mt-2 text-3xl font-bold tracking-tight' : 'mt-2 text-xl font-bold tracking-tight'}>
            {s.heading}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {s.intro}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {federationCapabilities.slice(0, isPage ? federationCapabilities.length : 3).map((item) => (
              <span
                key={tr(item, locale)}
                className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
              >
                {tr(item, locale)}
              </span>
            ))}
          </div>
          {variant !== 'page' && (
            <Link href="/red" className="mt-5 inline-block text-sm font-semibold text-red-600 hover:underline">
              {s.viewAll} →
            </Link>
          )}
        </div>

        <div className="grid gap-4">
          <article className="rounded-lg border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{partner.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(partner.status)}`}>
                    {tr(partner.statusLabel, locale)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{tr(partner.tagline, locale)}</p>
              </div>
              <a
                href={partner.href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                {s.open} →
              </a>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {tr(partner.description, locale)}
            </p>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.powered}</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {partner.contributionTags.map((tag) => (
                  <span key={tr(tag, locale)} className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                    {tr(tag, locale)}
                  </span>
                ))}
              </div>
            </div>

            {isPage && (
              <div className="mt-5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.flow}</h4>
                <ol className="mt-3 grid gap-2">
                  {partner.flow.map((step, index) => (
                    <li key={tr(step, locale)} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <span>{tr(step, locale)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>

          {isPage && (
            <aside className="rounded-lg border border-dashed border-black/15 p-4 dark:border-white/20">
              <h3 className="font-semibold">{s.joinTitle}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.join}</p>
              <Link href="/desarrolladores" className="mt-3 inline-block text-sm font-semibold text-red-600 hover:underline">
                {s.docs} →
              </Link>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
