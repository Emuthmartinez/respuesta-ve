import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale, metaFor } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MissingPersonSearch } from '@/components/MissingPersonSearch';
import type { MissingPinPublic } from '@/lib/types';

export const generateMetadata = (): Promise<Metadata> => metaFor('personas');

const SELECT =
  'id, display_name, lat, lng, estado, municipio, status, source, external_url, photo_url, age_estimate, possible_duplicate_ids, cluster_id, cedula_confirmed, cluster_size, is_multi_person, last_seen_at, created_at';

const STR = {
  es: {
    heading: 'Personas desaparecidas',
    subtext:
      'Reunimos registros de otras plataformas, filtramos entradas sospechosas antes de publicarlas y deduplicamos sin borrar ninguno. Los casos con cédula aparecen primero; cada reporte enlaza a su fuente.',
    statTotal: 'reportes reunidos',
    statPeople: 'personas distintas (aprox.)',
    statFound: 'localizados',
    sourcesHeading: 'Registros enlazados',
    vte_desc: 'Registro comunitario de personas.',
    dtv_desc: 'Plataforma ciudadana de desaparecidos del terremoto.',
    pfif_desc: 'Estándar abierto (PFIF) para intercambiar datos entre registros.',
    note: 'No reemplazamos a estas plataformas: las reunimos en un solo lugar y enlazamos de vuelta a cada una.',
    back: 'Volver al mapa',
  },
  en: {
    heading: 'Missing people',
    subtext:
      'We gather records from other platforms, hold suspicious entries for review before publication, and deduplicate without deleting any record. National-ID cases appear first; every report links back to its source.',
    statTotal: 'reports gathered',
    statPeople: 'distinct people (approx.)',
    statFound: 'located',
    sourcesHeading: 'Linked registries',
    vte_desc: 'Community people registry.',
    dtv_desc: 'Citizen earthquake missing-person platform.',
    pfif_desc: 'Open standard (PFIF) for exchanging data between registries.',
    note: 'We do not replace these platforms: we gather them in one place and link back to each.',
    back: 'Back to the map',
  },
} as const;

interface Counts { total: number; identified: number; found: number; }

async function fetchData(): Promise<{ identified: MissingPinPublic[]; featured: MissingPinPublic[]; counts: Counts }> {
  const sb = await getSupabaseServer();
  const empty = { identified: [], featured: [], counts: { total: 0, identified: 0, found: 0 } };
  if (!sb) return empty;

  const [idRes, featRes, total, identified, found] = await Promise.all([
    sb.from('missing_person_pins_public').select(SELECT).eq('cedula_confirmed', true).limit(200),
    sb.from('missing_person_pins_public').select(SELECT).gt('cluster_size', 0).order('cluster_size', { ascending: false }).limit(300),
    sb.from('missing_person_pins_public').select('id', { count: 'exact', head: true }),
    sb.from('missing_person_pins_public').select('id', { count: 'exact', head: true }).eq('cedula_confirmed', true),
    sb.from('missing_person_pins_public').select('id', { count: 'exact', head: true }).eq('status', 'found_safe'),
  ]);

  return {
    identified: (idRes.data as MissingPinPublic[]) ?? [],
    featured: (featRes.data as MissingPinPublic[]) ?? [],
    counts: { total: total.count ?? 0, identified: identified.count ?? 0, found: found.count ?? 0 },
  };
}

export default async function PersonasPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const { identified, featured, counts } = await fetchData();
  const fmt = (n: number) => n.toLocaleString(locale === 'es' ? 'es-VE' : 'en-US');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{s.subtext}</p>

      {counts.total > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            [fmt(counts.total), s.statTotal],
            [fmt(counts.found), s.statFound],
            [fmt(counts.identified), locale === 'es' ? 'con cédula' : 'with national ID'],
          ].map(([n, label], i) => (
            <div key={i} className="rounded-lg border border-black/10 p-3 text-center dark:border-white/10">
              <div className="text-xl font-bold">{n}</div>
              <div className="text-xs text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-6">
        <MissingPersonSearch identified={identified} featured={featured} locale={locale} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{s.sourcesHeading}</h2>
        <p className="mt-1 text-sm text-zinc-500">{s.note}</p>
        <div className="mt-3 space-y-3">
          <a href="https://desaparecidosterremotovenezuela.com" target="_blank" rel="noopener noreferrer"
            className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <div className="font-medium">Desaparecidos Terremoto Venezuela →</div>
            <div className="text-sm text-zinc-500">{s.dtv_desc}</div>
          </a>
          <a href="https://venezuelatebusca.com" target="_blank" rel="noopener noreferrer"
            className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <div className="font-medium">Venezuela Te Busca →</div>
            <div className="text-sm text-zinc-500">{s.vte_desc}</div>
          </a>
          <a href="https://google.org/personfinder/" target="_blank" rel="noopener noreferrer"
            className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <div className="font-medium">Google Person Finder →</div>
            <div className="text-sm text-zinc-500">{s.pfif_desc}</div>
          </a>
        </div>
      </section>

      <div className="mt-8">
        <Link href="/" className="font-medium text-red-600 hover:underline">{s.back}</Link>
      </div>
    </div>
  );
}
