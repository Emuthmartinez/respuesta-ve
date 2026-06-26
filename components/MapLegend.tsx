import { DAMAGE_LEVELS } from '@/lib/taxonomy';

export function MapLegend({ isDemo }: { isDemo?: boolean }) {
  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-[220px] rounded-lg border border-black/10 bg-white/95 p-3 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900/95">
      <div className="mb-1 font-semibold">Nivel de daño</div>
      <ul className="space-y-1">
        {DAMAGE_LEVELS.map((d) => (
          <li key={d.value} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: d.color }}
            />
            <span>{d.label}</span>
          </li>
        ))}
      </ul>
      {isDemo && (
        <div className="mt-2 rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500 dark:bg-zinc-800">
          Datos de muestra — el sistema aún no está conectado.
        </div>
      )}
    </div>
  );
}
