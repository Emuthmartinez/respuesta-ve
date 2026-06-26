'use client';

import { DAMAGE_LEVELS, damageColor } from '@/lib/taxonomy';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    heading: 'Nivel de daño',
    demo_note: 'Datos de muestra — el sistema aún no está conectado.',
  },
  en: {
    heading: 'Damage level',
    demo_note: 'Sample data — system is not yet connected.',
  },
} as const;

export function MapLegend({ isDemo }: { isDemo?: boolean }) {
  const locale = useLocale();
  const s = STR[locale];

  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-[220px] rounded-lg border border-black/10 bg-white/95 p-3 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900/95">
      <div className="mb-1 font-semibold">{s.heading}</div>
      <ul className="space-y-1">
        {DAMAGE_LEVELS.map((d) => (
          <li key={d.value} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: damageColor(d.value) }}
            />
            <span>{tr(d.label, locale)}</span>
          </li>
        ))}
      </ul>
      {isDemo && (
        <div className="mt-2 rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500 dark:bg-zinc-800">
          {s.demo_note}
        </div>
      )}
    </div>
  );
}
