import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n-server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MissingPersonSearch } from '@/components/MissingPersonSearch';
import type { MissingPinPublic } from '@/lib/types';

export const metadata: Metadata = { title: 'Personas — Respuesta VE' };

const STR = {
  es: {
    heading: 'Personas desaparecidas',
    subtext_pre: 'Para no fragmentar la búsqueda,',
    subtext_strong: 'no creamos un registro separado',
    subtext_post:
      '. Reunimos en un solo lugar los registros que ya existen, cada uno enlazado a su fuente, para que las familias busquen una sola vez.',
    searchHeading: 'Buscar en los registros reunidos',
    sourcesHeading: 'Registros enlazados',
    vte_desc: 'Registro comunitario de personas.',
    pfif_desc: 'Estándar abierto (PFIF) para intercambiar datos entre registros.',
    coming_soon_strong: 'Próximamente:',
    coming_soon_text:
      ' pines de "visto por última vez" en el mapa, enlazados a estos registros.',
    back: 'Volver al mapa',
  },
  en: {
    heading: 'Missing people',
    subtext_pre: 'To avoid fragmenting the search,',
    subtext_strong: 'we do not maintain a separate registry',
    subtext_post:
      '. We gather the registries that already exist into one place, each linked back to its source, so families search once.',
    searchHeading: 'Search the gathered records',
    sourcesHeading: 'Linked registries',
    vte_desc: 'Community people registry.',
    pfif_desc: 'Open standard (PFIF) for exchanging data between registries.',
    coming_soon_strong: 'Coming soon:',
    coming_soon_text:
      ' "last seen" pins on the map, linked back to these registries.',
    back: 'Back to the map',
  },
} as const;

async function fetchFederatedRecords(): Promise<MissingPinPublic[]> {
  const sb = await getSupabaseServer();
  if (!sb) return [];
  const { data } = await sb
    .from('missing_person_pins_public')
    .select(
      'id, display_name, lat, lng, estado, municipio, status, source, external_url, photo_url, age_estimate, possible_duplicate_ids, last_seen_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(1000);
  return (data as MissingPinPublic[]) ?? [];
}

export default async function PersonasPage() {
  const locale = await getLocale();
  const s = STR[locale];
  const records = await fetchFederatedRecords();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext_pre} <strong>{s.subtext_strong}</strong>{s.subtext_post}
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{s.searchHeading}</h2>
        <MissingPersonSearch records={records} locale={locale} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{s.sourcesHeading}</h2>
        <div className="mt-3 space-y-3">
          <a
            href="https://venezuelatebusca.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            <div className="font-medium">Venezuela Te Busca →</div>
            <div className="text-sm text-zinc-500">{s.vte_desc}</div>
          </a>
          <a
            href="https://google.org/personfinder/"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            <div className="font-medium">Google Person Finder →</div>
            <div className="text-sm text-zinc-500">{s.pfif_desc}</div>
          </a>
        </div>
      </section>

      <div className="mt-8 rounded-lg border border-dashed border-black/15 p-4 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-400">
        <strong>{s.coming_soon_strong}</strong>{s.coming_soon_text}
        <div className="mt-3">
          <Link href="/" className="font-medium text-red-600 hover:underline">
            {s.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
