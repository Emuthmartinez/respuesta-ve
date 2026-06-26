'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { clusterByDuplicateEdges, clusterDisplayStatus, STATUS_URGENCY, normalizeName } from '@/lib/missing-persons';
import { useLocale } from '@/lib/locale-context';
import type { MissingStatus } from '@/lib/types';

interface Row {
  id: string;
  display_name: string | null;
  age_estimate: number | null;
  estado: string | null;
  municipio: string | null;
  status: MissingStatus;
  source: string;
  external_url: string | null;
  cedula_masked: string | null;
  cedula_present: boolean;
  possible_duplicate_ids: string[] | null;
  duplicate_of: string | null;
  is_multi_person: boolean;
  cedula_conflict?: boolean;
  photo_conflict?: boolean;
  conflict_kind?: string;
  quality_status?: string;
  quality_flags?: string[] | null;
  created_at: string;
}
interface AuditRow {
  id: string; action: string; merged_name: string | null; into_name: string | null;
  pre_status: MissingStatus | null; reason_text: string | null; created_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  internal: 'Comunidad', venezuelatebusca: 'Venezuela Te Busca',
  desaparecidosterremotovenezuela: 'Desaparecidos Terremoto', desaparecidosvenezuela: 'Desaparecidos Venezuela',
  pfif_feed: 'PFIF', other: 'Otro registro', google_person_finder: 'Google Person Finder',
};
const statusColor: Record<string, string> = {
  missing: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  found_safe: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  found_injured: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  deceased: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  unknown: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const STR = {
  es: {
    tabs: { clusters: 'Grupos', conflicts: 'Conflictos', quality: 'Calidad', audit: 'Historial' },
    search: 'Buscar por nombre…', loading: 'Cargando…', refresh: 'Actualizar',
    noClusters: 'No hay grupos para revisar.', noConflicts: 'No hay conflictos pendientes.', noQuality: 'No hay registros en cuarentena.', noAudit: 'Sin acciones registradas.',
    members: (n: number) => `${n} registros`,
    keepThis: 'Mantener este', merged: 'Fusionado', undo: 'Deshacer fusión',
    mergeBtn: 'Fusionar duplicados en el principal', splitBtn: 'No es la misma persona',
    statusLabel: { missing: 'Desaparecido(a)', found_safe: 'A salvo', found_injured: 'Herido(a)', deceased: 'Fallecido(a)', unknown: 'Sin confirmar' } as Record<string, string>,
    yrs: 'años', viewSource: 'Ver fuente →', cedula: 'Cédula',
    overrideTitle: 'Confirmar fusión sensible', overrideBody: 'Estás ocultando un registro de búsqueda activo (desaparecido) detrás de uno ya resuelto. Solo confirma si verificaste que es la misma persona.',
    overrideYes: 'Sí, fusionar igual', cancel: 'Cancelar',
    markReviewed: 'Marcar revisado', reasonPrompt: 'Motivo (opcional):',
    conflictCedula: 'Misma cédula, nombres distintos', conflictPhoto: 'Misma foto, nombres distintos',
    acceptQuality: 'Aceptar y publicar', rejectQuality: 'Rechazar como spam',
    qualityFlags: 'Señales',
    merge: 'fusión', unmerge: 'reversión', done: 'Listo.',
  },
  en: {
    tabs: { clusters: 'Groups', conflicts: 'Conflicts', quality: 'Quality', audit: 'History' },
    search: 'Search by name…', loading: 'Loading…', refresh: 'Refresh',
    noClusters: 'No groups to review.', noConflicts: 'No pending conflicts.', noQuality: 'No quarantined records.', noAudit: 'No recorded actions.',
    members: (n: number) => `${n} records`,
    keepThis: 'Keep this one', merged: 'Merged', undo: 'Undo merge',
    mergeBtn: 'Merge duplicates into the main record', splitBtn: 'Not the same person',
    statusLabel: { missing: 'Missing', found_safe: 'Safe', found_injured: 'Injured', deceased: 'Deceased', unknown: 'Unconfirmed' } as Record<string, string>,
    yrs: 'yrs', viewSource: 'View source →', cedula: 'National ID',
    overrideTitle: 'Confirm sensitive merge', overrideBody: 'You are hiding an active (missing) search record behind a resolved one. Only confirm if you verified it is the same person.',
    overrideYes: 'Yes, merge anyway', cancel: 'Cancel',
    markReviewed: 'Mark reviewed', reasonPrompt: 'Reason (optional):',
    conflictCedula: 'Same national ID, different names', conflictPhoto: 'Same photo, different names',
    acceptQuality: 'Accept and publish', rejectQuality: 'Reject as spam',
    qualityFlags: 'Signals',
    merge: 'merge', unmerge: 'unmerge', done: 'Done.',
  },
} as const;

type Tab = 'clusters' | 'conflicts' | 'quality' | 'audit';

export function MissingDedupDesk() {
  const locale = useLocale();
  const s = STR[locale];
  const [tab, setTab] = useState<Tab>('clusters');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [conflicts, setConflicts] = useState<Row[]>([]);
  const [quality, setQuality] = useState<Row[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [survivors, setSurvivors] = useState<Record<string, string>>({}); // clusterKey -> survivor id
  const [override, setOverride] = useState<null | { members: Row[]; survivor: Row }>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setLoading(true); setMsg('');
    if (tab === 'clusters') {
      const { data } = await sb.rpc('coord_missing_clusters', { p_q: q.trim() || null, p_limit: 300 });
      setRows((data as Row[]) ?? []);
    } else if (tab === 'conflicts') {
      const { data } = await sb.rpc('coord_missing_conflicts', { p_limit: 200 });
      setConflicts((data as Row[]) ?? []);
    } else if (tab === 'quality') {
      const { data } = await sb.rpc('coord_missing_quality_queue', { p_limit: 200 });
      setQuality((data as Row[]) ?? []);
    } else {
      const { data } = await sb.rpc('coord_merge_audit', { p_limit: 60 });
      setAudit((data as AuditRow[]) ?? []);
    }
    setLoading(false);
  }, [tab, q]);

  useEffect(() => { load(); }, [load]);

  const clusters = useMemo(() => {
    const groups = clusterByDuplicateEdges(rows.map((r) => ({ ...r, possible_duplicate_ids: r.possible_duplicate_ids })));
    return groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  }, [rows]);

  // default survivor per cluster = most-urgent status, then most complete name
  const survivorFor = useCallback((key: string, members: Row[]): Row => {
    const chosen = members.find((m) => m.id === survivors[key]);
    if (chosen && !chosen.duplicate_of) return chosen;
    const active = members.filter((m) => !m.duplicate_of);
    return [...(active.length ? active : members)].sort(
      (a, b) => (STATUS_URGENCY[b.status] - STATUS_URGENCY[a.status]) ||
        (normalizeName(b.display_name).split(' ').length - normalizeName(a.display_name).split(' ').length),
    )[0];
  }, [survivors]);

  async function rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
    const sb = getSupabaseBrowser();
    if (!sb) return { data: null, error: { message: 'no client' } };
    const { data, error } = await sb.rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  }

  async function doMerge(members: Row[], survivor: Row, allowOverride: boolean) {
    setBusy(survivor.id); setMsg('');
    const others = members.filter((m) => m.id !== survivor.id && !m.duplicate_of);
    const blocked: Row[] = [];
    for (const m of others) {
      const { data, error } = await rpc('set_duplicate_of', {
        p_merged_id: m.id, p_merged_into_id: survivor.id, p_reason_text: 'coordinator merge', p_override_missing: allowOverride,
      });
      if (error) { setMsg(error.message); setBusy(null); return; }
      const r = data as { ok?: boolean; error?: string } | null;
      if (!r?.ok && r?.error === 'suppressing_open_record') blocked.push(m);
      else if (!r?.ok) { setMsg(r?.error ?? 'error'); }
    }
    setBusy(null);
    if (blocked.length && !allowOverride) { setOverride({ members: blocked, survivor }); return; }
    await load();
  }

  async function doSplit(member: Row, survivor: Row) {
    setBusy(member.id);
    const { error } = await rpc('split_cluster', { p_id_a: member.id, p_id_b: survivor.id, p_reason_text: 'coordinator split' });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    await load();
  }

  async function doUndo(member: Row) {
    setBusy(member.id);
    const { error } = await rpc('clear_duplicate_of', { p_merged_id: member.id, p_reason_text: 'coordinator undo' });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    await load();
  }

  async function doClearFlags(id: string) {
    setBusy(id);
    await rpc('coord_clear_flags', { p_id: id });
    setBusy(null);
    await load();
  }

  async function doSetQuality(id: string, qualityStatus: 'accepted' | 'rejected_spam') {
    setBusy(id);
    const { data, error } = await rpc('coord_set_missing_quality', {
      p_id: id,
      p_quality_status: qualityStatus,
      p_reason_text: qualityStatus === 'accepted' ? 'coordinator accepted intake quality' : 'coordinator rejected spam',
    });
    setBusy(null);
    const r = data as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) { setMsg(error?.message ?? r?.error ?? 'error'); return; }
    await load();
  }

  const memberLine = (r: Row) => (
    <div className={`text-sm ${r.duplicate_of ? 'opacity-50' : ''}`}>
      <div className="font-medium">
        <span className={r.duplicate_of ? 'line-through' : ''}>{r.display_name ?? '—'}</span>
        {r.age_estimate != null && <span className="font-normal text-zinc-400"> · ~{r.age_estimate} {s.yrs}</span>}
        {r.cedula_present && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">✓ {s.cedula} {r.cedula_masked}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className={`rounded-full px-1.5 py-0.5 ${statusColor[r.status]}`}>{s.statusLabel[r.status]}</span>
        <span>{[r.municipio, r.estado].filter(Boolean).join(', ')}</span>
        <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{SOURCE_LABEL[r.source] ?? r.source}</span>
        {r.external_url && <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="font-medium text-red-600 hover:underline">{s.viewSource}</a>}
      </div>
    </div>
  );

  return (
    <div className="mt-5">
      {/* tabs */}
      <div className="flex gap-1 border-b border-black/10 text-sm dark:border-white/10">
        {(['clusters', 'conflicts', 'quality', 'audit'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === t ? 'border-red-600 text-red-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            {s.tabs[t]}
          </button>
        ))}
      </div>

      {tab === 'clusters' && (
        <div className="mt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.search}
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900" />
        </div>
      )}
      {msg && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{msg}</p>}
      {loading && <p className="mt-4 text-sm text-zinc-500">{s.loading}</p>}

      {/* CLUSTERS */}
      {tab === 'clusters' && !loading && (
        clusters.length === 0 ? <p className="mt-4 text-sm text-zinc-500">{s.noClusters}</p> : (
          <ul className="mt-4 space-y-4">
            {clusters.map((members) => {
              const key = members[0].id;
              const survivor = survivorFor(key, members as Row[]);
              const display = clusterDisplayStatus((members as Row[]).map((m) => m.status));
              return (
                <li key={key} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">{s.members(members.length)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[display]}`}>{s.statusLabel[display]}</span>
                  </div>
                  <ul className="space-y-2">
                    {(members as Row[]).map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-2 border-t border-black/5 pt-2 first:border-0 dark:border-white/5">
                        <div className="flex-1">{memberLine(m)}</div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {m.duplicate_of ? (
                            <button disabled={busy === m.id} onClick={() => doUndo(m)} className="text-xs font-medium text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400">{s.undo}</button>
                          ) : (
                            <>
                              <label className="flex items-center gap-1 text-xs text-zinc-500">
                                <input type="radio" name={`surv-${key}`} checked={survivor.id === m.id} onChange={() => setSurvivors((p) => ({ ...p, [key]: m.id }))} />
                                {s.keepThis}
                              </label>
                              {survivor.id !== m.id && (
                                <button disabled={busy === m.id} onClick={() => doSplit(m, survivor)} className="text-xs font-medium text-zinc-500 hover:text-red-600 hover:underline disabled:opacity-50">{s.splitBtn}</button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {(members as Row[]).filter((m) => !m.duplicate_of).length > 1 && (
                    <button disabled={busy === survivor.id} onClick={() => doMerge(members as Row[], survivor, false)}
                      className="mt-3 w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                      {s.mergeBtn}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* CONFLICTS */}
      {tab === 'conflicts' && !loading && (
        conflicts.length === 0 ? <p className="mt-4 text-sm text-zinc-500">{s.noConflicts}</p> : (
          <ul className="mt-4 space-y-3">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
                <div className="mb-1 text-xs font-medium text-orange-800 dark:text-orange-300">
                  ⚠ {c.conflict_kind?.includes('cedula') ? s.conflictCedula : s.conflictPhoto}
                </div>
                {memberLine(c)}
                <button disabled={busy === c.id} onClick={() => doClearFlags(c.id)} className="mt-2 text-xs font-medium text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-400">{s.markReviewed}</button>
              </li>
            ))}
          </ul>
        )
      )}

      {/* QUALITY */}
      {tab === 'quality' && !loading && (
        quality.length === 0 ? <p className="mt-4 text-sm text-zinc-500">{s.noQuality}</p> : (
          <ul className="mt-4 space-y-3">
            {quality.map((qrow) => (
              <li key={qrow.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="mb-2 flex flex-wrap gap-1 text-xs">
                  <span className="font-medium text-amber-900 dark:text-amber-200">{s.qualityFlags}:</span>
                  {(qrow.quality_flags ?? []).map((flag) => (
                    <span key={flag} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{flag}</span>
                  ))}
                </div>
                {memberLine(qrow)}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy === qrow.id} onClick={() => doSetQuality(qrow.id, 'accepted')}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {s.acceptQuality}
                  </button>
                  <button disabled={busy === qrow.id} onClick={() => doSetQuality(qrow.id, 'rejected_spam')}
                    className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10">
                    {s.rejectQuality}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {/* AUDIT */}
      {tab === 'audit' && !loading && (
        audit.length === 0 ? <p className="mt-4 text-sm text-zinc-500">{s.noAudit}</p> : (
          <ul className="mt-4 space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-b border-black/5 py-2 dark:border-white/5">
                <span>
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${a.action === 'merge' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700'}`}>{a.action === 'merge' ? s.merge : s.unmerge}</span>
                  <strong>{a.merged_name ?? '—'}</strong>{a.into_name ? ` → ${a.into_name}` : ''}
                </span>
                <time className="shrink-0 text-xs text-zinc-400">{new Date(a.created_at).toLocaleDateString(locale)}</time>
              </li>
            ))}
          </ul>
        )
      )}

      {/* override confirm */}
      {override && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOverride(null)}>
          <div className="max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400">⚠ {s.overrideTitle}</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{s.overrideBody}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOverride(null)} className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10">{s.cancel}</button>
              <button onClick={() => { const o = override; setOverride(null); doMerge([...o.members, o.survivor], o.survivor, true); }}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">{s.overrideYes}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
