'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  normalizeName, clusterByDuplicateEdges, clusterDisplayStatus,
  clusterHasStatusConflict, identificationTier,
} from '@/lib/missing-persons';
import type { MissingPinPublic, MissingStatus } from '@/lib/types';
import type { Locale } from '@/lib/i18n';

const SELECT =
  'id, display_name, lat, lng, estado, municipio, status, source, external_url, photo_url, age_estimate, possible_duplicate_ids, cluster_id, cedula_confirmed, cluster_size, is_multi_person, last_seen_at, source_updated_at, created_at, updated_at';

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
    searching: 'Buscando…',
    identifiedHeading: 'Identificados con cédula',
    identifiedSub: 'Registros aceptados que reportan una cédula. Agrupados con alta confianza.',
    approxHeading: 'Agrupación aproximada',
    approxSub: 'Sin cédula: solo mostramos registros aceptados; agrupamos por nombre, edad, lugar y foto. El agrupamiento se intenta, pero puede no ser perfecto.',
    searchPrompt: 'Escribe un nombre para buscar entre los registros agrupados.',
    featured: 'Personas con más reportes duplicados',
    noMatch: 'Sin coincidencias. Prueba otro nombre.',
    cedulaBadge: 'Cédula reportada',
    possibleSame: (n: number) => `Posible misma persona · ${n} reportes`,
    confirmedSame: (n: number) => `Mismo registro · ${n} reportes`,
    reports: (n: number) => `${n} reporte${n === 1 ? '' : 's'}`,
    multiPerson: 'Este reporte menciona a varias personas',
    mixedStatus: 'Una fuente reporta a esta persona como localizada, pero otra sigue activa. Verifica antes de cerrar la búsqueda.',
    deceasedNote: 'Un reporte de este grupo indica un fallecimiento. Información sensible — verifica con fuentes oficiales.',
    viewAt: 'Ver en la fuente →',
    showAll: (n: number) => `Ver los ${n} reportes`,
    showLess: 'Ver menos',
    yrs: 'años',
    statusLabel: {
      missing: 'Desaparecido(a)', found_safe: 'Encontrado(a) a salvo',
      found_injured: 'Encontrado(a) herido(a)', deceased: 'Fallecido(a)', unknown: 'Sin confirmar',
    } as Record<string, string>,
  },
  en: {
    searchLabel: 'Search by name',
    searchPlaceholder: 'First or last name…',
    searching: 'Searching…',
    identifiedHeading: 'Identified by national ID',
    identifiedSub: 'Accepted records that report a national ID. Grouped with high confidence.',
    approxHeading: 'Approximate grouping',
    approxSub: 'No national ID: only accepted records are shown; grouped by name, age, place and photo. Grouping is attempted but may not be perfect.',
    searchPrompt: 'Type a name to search the grouped records.',
    featured: 'People with the most duplicate reports',
    noMatch: 'No matches. Try another name.',
    cedulaBadge: 'National ID reported',
    possibleSame: (n: number) => `Possibly the same person · ${n} reports`,
    confirmedSame: (n: number) => `Same record · ${n} reports`,
    reports: (n: number) => `${n} report${n === 1 ? '' : 's'}`,
    multiPerson: 'This report names several people',
    mixedStatus: 'One source reports this person as found, but another is still active. Verify before closing the search.',
    deceasedNote: 'A report in this group indicates a death. Sensitive information — verify with official sources.',
    viewAt: 'View at source →',
    showAll: (n: number) => `Show all ${n} reports`,
    showLess: 'Show less',
    yrs: 'yrs',
    statusLabel: {
      missing: 'Missing', found_safe: 'Found safe', found_injured: 'Found injured',
      deceased: 'Deceased', unknown: 'Unconfirmed',
    } as Record<string, string>,
  },
};

type Strings = (typeof STR)['es'];

const statusColor: Record<string, string> = {
  missing: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  found_safe: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  found_injured: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  deceased: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  unknown: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

/** Strip a cédula a family typed into the name field — the badge already says
 * "national ID reported"; we never render the raw number. */
function cleanName(name: string | null): string {
  if (!name) return '—';
  const c = name
    .replace(/\b(?:c\.?\s?i\.?|c[eé]dula|ci)\s*:?\s*[VvEe]?[-.\s]?\d[\d.\s]{5,9}/gi, ' ')
    .replace(/\b[VvEe][-.\s]?\d{6,8}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim();
  return c || name;
}

type Cluster = {
  key: string;
  members: MissingPinPublic[];
  canonical: MissingPinPublic;
  status: MissingStatus;
  identified: boolean;
  hasConflict: boolean;
  hasDeceased: boolean;
};

/** Group rows into clusters via union-find over possible_duplicate_ids. */
function buildClusters(rows: MissingPinPublic[]): Cluster[] {
  const groups = clusterByDuplicateEdges(rows);
  return groups.map((members) => {
    // Canonical = the most complete (most tokens, then longest) name variant.
    const canonical = [...members].sort(
      (a, b) =>
        normalizeName(b.display_name).split(' ').length - normalizeName(a.display_name).split(' ').length ||
        (b.display_name?.length ?? 0) - (a.display_name?.length ?? 0),
    )[0];
    const statuses = members.map((m) => m.status);
    return {
      key: canonical.id,
      members,
      canonical,
      status: clusterDisplayStatus(statuses),
      identified: members.some((m) => identificationTier(m) === 'identified'),
      hasConflict: clusterHasStatusConflict(statuses),
      hasDeceased: statuses.includes('deceased'),
    };
  });
}

function ClusterCard({ cluster, s }: { cluster: Cluster; s: Strings }) {
  const [expanded, setExpanded] = useState(false);
  const { members, canonical, status, identified, hasConflict, hasDeceased } = cluster;
  const multi = members.length > 1;
  const CAP = 4;
  const shown = expanded ? members : members.slice(0, CAP);

  return (
    <li className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        {identified && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            ✓ {s.cedulaBadge}
          </span>
        )}
        {multi && (
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            {identified ? s.confirmedSame(members.length) : s.possibleSame(members.length)}
          </span>
        )}
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[status] ?? statusColor.unknown}`}>
          {s.statusLabel[status] ?? status}
        </span>
      </div>

      <div className="mt-2 text-base font-semibold">{cleanName(canonical.display_name)}</div>
      <div className="text-sm text-zinc-500">
        {[canonical.municipio, canonical.estado].filter(Boolean).join(', ')}
        {canonical.age_estimate != null && ` · ~${canonical.age_estimate} ${s.yrs}`}
      </div>

      {hasConflict && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
          ⚠ {s.mixedStatus}
        </p>
      )}
      {hasDeceased && (
        <p className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900">
          {s.deceasedNote}
        </p>
      )}
      {canonical.is_multi_person && (
        <p className="mt-2 text-xs text-zinc-500">— {s.multiPerson}</p>
      )}

      {multi && (
        <div className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/5">
          {shown.map((r) => (
            <div key={r.id} className="text-sm">
              <div className="font-medium text-zinc-700 dark:text-zinc-300">
                {cleanName(r.display_name)}
                {r.age_estimate != null && <span className="font-normal text-zinc-400"> · ~{r.age_estimate}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 ${statusColor[r.status] ?? statusColor.unknown}`}>
                  {s.statusLabel[r.status] ?? r.status}
                </span>
                <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {SOURCE_LABEL[r.source] ?? r.source}
                </span>
                {r.external_url && (
                  <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-red-600 hover:underline">
                    {s.viewAt}
                  </a>
                )}
              </div>
            </div>
          ))}
          {members.length > CAP && (
            <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-red-600 hover:underline">
              {expanded ? s.showLess : s.showAll(members.length)}
            </button>
          )}
        </div>
      )}

      {!multi && canonical.external_url && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="rounded bg-black/5 px-1.5 py-0.5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
            {SOURCE_LABEL[canonical.source] ?? canonical.source}
          </span>
          <a href={canonical.external_url} target="_blank" rel="noopener noreferrer" className="font-medium text-red-600 hover:underline">
            {s.viewAt}
          </a>
        </div>
      )}
    </li>
  );
}

export function MissingPersonSearch({
  identified,
  featured,
  locale,
}: {
  identified: MissingPinPublic[];
  featured: MissingPinPublic[];
  locale: Locale;
}) {
  const s = STR[locale];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MissingPinPublic[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (value.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
  }

  // Debounced server-side search over the public view (scales to 57k rows;
  // we never ship the whole registry to the client).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    timer.current = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      if (!sb) { setResults([]); setLoading(false); return; }
      const { data } = await sb
        .from('missing_person_pins_public')
        .select(SELECT)
        .ilike('display_name', `%${q}%`)
        .order('cluster_size', { ascending: false })
        .limit(400);
      setResults((data as MissingPinPublic[]) ?? []);
      setLoading(false);
    }, 280);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [query]);

  const identifiedClusters = useMemo(() => buildClusters(identified).sort((a, b) => b.members.length - a.members.length), [identified]);
  const featuredClusters = useMemo(
    () => buildClusters(featured).filter((c) => c.members.length > 1).sort((a, b) => b.members.length - a.members.length).slice(0, 12),
    [featured],
  );
  const resultClusters = useMemo(() => (results ? buildClusters(results).sort((a, b) => b.members.length - a.members.length) : null), [results]);

  return (
    <div className="mt-4 space-y-8">
      {/* ── Identificados ── */}
      {identifiedClusters.length > 0 && (
        <section>
          <h3 className="text-base font-semibold">{s.identifiedHeading}</h3>
          <p className="mt-0.5 text-sm text-zinc-500">{s.identifiedSub}</p>
          <ul className="mt-3 space-y-3">
            {identifiedClusters.map((c) => <ClusterCard key={c.key} cluster={c} s={s} />)}
          </ul>
        </section>
      )}

      {/* ── Aproximada (search-driven) ── */}
      <section>
        <h3 className="text-base font-semibold">{s.approxHeading}</h3>
        <p className="mt-0.5 text-sm text-zinc-500">{s.approxSub}</p>

        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium">{s.searchLabel}</label>
          <input className={field} value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder={s.searchPlaceholder} />
        </div>

        {loading && <p className="mt-3 text-sm text-zinc-500">{s.searching}</p>}

        {!loading && resultClusters && (
          resultClusters.length === 0
            ? <p className="mt-3 text-sm text-zinc-500">{s.noMatch}</p>
            : <ul className="mt-3 space-y-3">{resultClusters.map((c) => <ClusterCard key={c.key} cluster={c} s={s} />)}</ul>
        )}

        {!loading && !resultClusters && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-zinc-500">{s.searchPrompt}</p>
            {featuredClusters.length > 0 && (
              <>
                <p className="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{s.featured}</p>
                <ul className="space-y-3">{featuredClusters.map((c) => <ClusterCard key={c.key} cluster={c} s={s} />)}</ul>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
