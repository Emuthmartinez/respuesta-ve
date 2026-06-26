'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { BuildingList } from '@/components/BuildingList';
import type { Locale } from '@/lib/i18n';

// Lazy-load the heavy MapLibre map only when the user taps "Ver mapa".
// ssr:false keeps maplibre-gl (a browser-only library) out of the server bundle.
const DamageMap = dynamic(
  () => import('@/components/DamageMap').then((m) => ({ default: m.DamageMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Cargando mapa… / Loading map…
      </div>
    ),
  },
);

const STR = {
  es: { back: '← Volver a la lista' },
  en: { back: '← Back to list' },
} as const;

export function HomeMapSection({ locale }: { locale: Locale }) {
  const [showMap, setShowMap] = useState(false);
  const s = STR[locale];

  return (
    <section className="mx-auto mt-4 w-full max-w-6xl px-4 pb-4">
      {showMap ? (
        <>
          {/* Back link */}
          <button
            onClick={() => setShowMap(false)}
            className="mb-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {s.back}
          </button>
          {/* Full map */}
          <div className="h-[70vh] overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <DamageMap locale={locale} />
          </div>
        </>
      ) : (
        /* Lightweight list — renders without any JS bundle for MapLibre */
        <div className="rounded-xl border border-black/10 px-4 py-4 dark:border-white/10">
          <BuildingList locale={locale} onShowMap={() => setShowMap(true)} />
        </div>
      )}
    </section>
  );
}
