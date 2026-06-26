'use client';

import { useMemo, useState } from 'react';
import { ESTADOS } from '@/lib/taxonomy';
import { normalizeName, clusterByDuplicateEdges } from '@/lib/missing-persons';
import type { MissingPinPublic } from '@/lib/types';
import type { Locale } from '@/lib/i18n';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const SOURCE_LABEL: Record<string, string> = {
  internal: 'Comunidad',
  venezuelatebusca: 'Venezuela Te Busca',
  google_person_finder: 'Google Person Finder',
  desaparecidosvenezuela: 'Desaparecidos Venezuela',
  desaparecidosterremotovenezuela: 'Desaparecidos Terremoto',
  pfif_feed: 'Registro PFIF',
  other: 'Otro registro',
};

const STR = {
  es: {
    searchLabel: 'Buscar por nombre',
    searchPlaceholder: 'Nombre o apellido…',
    allEstados: 'Todos los estados',
    resultsCount: (n: number) => `${n} registro${n === 1 ? '' : 's'} federado${n === 1 ? '' : 's'}`,
    none: 'No hay registros federados todavía. Usa los registros enlazados arriba.',
    noMatch: 'Sin coincidencias. Prueba otro nombre o revisa los registros enlazados arriba.',
    possibleSame: (n: number) => `Posible misma persona · ${n} registros`,
    viewAt: 'Ver en la fuente →',
    statusLabel: {
      missing: 'Desaparecido(a)', found_safe: 'Encontrado(a) a salvo',
      found_injured: 'Encontrado(a) herido(a)', deceased: 'Fallecido(a)', unknown: 'Sin confirmar',
    } as Record<string, string>,
  },
  en: {
    searchLabel: 'Search by name',
    searchPlaceholder: 'First or last name…',
    allEstados: 'All states',
    resultsCount: (n: number) => `${n} federated record${n === 1 ? '' : 's'}`,
    none: 'No federated records yet. Use the linked registries above.',
    noMatch: 'No matches. Try another name or check the linked registries above.',
    possibleSame: (n: number) => `Possibly the same person · ${n} records`,
    viewAt: 'View at source →',
    statusLabel: {
      missing: 'Missing', found_safe: 'Found safe', found_injured: 'Found injured',
      deceased: 'Deceased', unknown: 'Unconfirmed',
    } as Record<string, string>,
  },
} as const;

const statusColor: Record<string, string> = {
  missing: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  found_safe: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  found_injured: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  deceased: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  unknown: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

export function MissingPersonSearch({
  records,
  locale,
}: {
  records: MissingPinPublic[];
  locale: Locale;
}) {
  const s = STR[locale];
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState('');

  const clusters = useMemo(() => {
    const q = normalizeName(query);
    const filtered = records.filter((r) => {
      if (estado && r.estado !== estado) return false;
      if (q && !normalizeName(r.display_name).includes(q)) return false;
      return true;
    });
    return clusterByDuplicateEdges(filtered).sort((a, b) => b.length - a.length);
  }, [records, query, estado]);

  const total = useMemo(() => clusters.reduce((n, c) => n + c.length, 0), [clusters]);

  if (records.length === 0) {
    return <p className="mt-4 text-sm text-zinc-500">{s.none}</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="mb-1 block text-sm font-medium">{s.searchLabel}</label>
          <input className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={s.searchPlaceholder} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium sm:invisible">.</label>
          <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">{s.allEstados}</option>
            {ESTADOS.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-500">{s.resultsCount(total)}</p>

      {clusters.length === 0 ? (
        <p className="text-sm text-zinc-500">{s.noMatch}</p>
      ) : (
        <ul className="space-y-3">
          {clusters.map((cluster) => (
            <li key={cluster[0].id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              {cluster.length > 1 && (
                <div className="mb-2 inline-block rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                  {s.possibleSame(cluster.length)}
                </div>
              )}
              <div className="space-y-3">
                {cluster.map((r) => (
                  <div key={r.id} className={cluster.length > 1 ? 'border-l-2 border-black/10 pl-3 dark:border-white/10' : ''}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{r.display_name ?? '—'}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[r.status] ?? statusColor.unknown}`}>
                        {s.statusLabel[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      {[r.municipio, r.estado].filter(Boolean).join(', ')}
                      {r.age_estimate != null && ` · ~${r.age_estimate} ${locale === 'es' ? 'años' : 'yrs'}`}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </span>
                      {r.external_url && (
                        <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="font-medium text-red-600 hover:underline">
                          {s.viewAt}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
