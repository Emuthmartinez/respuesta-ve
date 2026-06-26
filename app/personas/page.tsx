import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n-server';

export const metadata: Metadata = { title: 'Personas — Respuesta VE' };

const STR = {
  es: {
    heading: 'Personas desaparecidas',
    subtext_pre: 'Para no fragmentar la búsqueda,',
    subtext_strong: 'no creamos un registro separado',
    subtext_post:
      '. Conectamos y enlazamos los esfuerzos que ya existen, para que las familias busquen en un solo lugar.',
    vte_desc: 'Registro comunitario de personas.',
    pfif_desc: 'Estándar abierto (PFIF) para intercambiar datos entre registros.',
    coming_soon_strong: 'Próximamente:',
    coming_soon_text:
      ' pines de "visto por última vez" en el mapa, enlazados a estos registros, e ingesta automática vía PFIF.',
    back: 'Volver al mapa',
  },
  en: {
    heading: 'Missing people',
    subtext_pre: 'To avoid fragmenting the search,',
    subtext_strong: 'we do not maintain a separate registry',
    subtext_post:
      '. We connect and link existing efforts so families can search in one place.',
    vte_desc: 'Community people registry.',
    pfif_desc: 'Open standard (PFIF) for exchanging data between registries.',
    coming_soon_strong: 'Coming soon:',
    coming_soon_text:
      ' "last seen" pins on the map, linked to these registries, and automatic ingestion via PFIF.',
    back: 'Back to the map',
  },
} as const;

export default async function PersonasPage() {
  const locale = await getLocale();
  const s = STR[locale];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext_pre} <strong>{s.subtext_strong}</strong>{s.subtext_post}
      </p>

      <div className="mt-6 space-y-3">
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
