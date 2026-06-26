'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SKILL_LABEL, HIGH_STAKES, URGENCY_OPTS } from '@/lib/skills';

interface OpenRequest {
  id: string;
  skill_needed: string;
  urgency: string;
  estado: string | null;
  municipio: string | null;
  description: string | null;
  contact_private: string | null;
  num_people: number | null;
  has_minor_children: boolean;
  expires_at: string;
  created_at: string;
}

const URGENCY_COLOR: Record<string, string> = {
  critical: '#7f1d1d',
  high: '#dc2626',
  normal: '#f59e0b',
  low: '#16a34a',
};

const URGENCY_LABEL: Record<string, string> = Object.fromEntries(
  URGENCY_OPTS.map((u) => [u.value, u.label.es]),
);

const SELECT =
  'id,skill_needed,urgency,estado,municipio,description,contact_private,num_people,has_minor_children,expires_at,created_at';

interface Props {
  selectedId: string | null;
  onSelect: (r: { id: string; skill_needed: string; is_high_stakes: boolean } | null) => void;
}

export function HelpRequestList({ selectedId, onSelect }: Props) {
  const [rows, setRows] = useState<OpenRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    const { data, error } = await sb
      .from('help_requests')
      .select(SELECT)
      .eq('moderation_status', 'approved')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('urgency', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) { setMsg(error.message); setLoading(false); return; }
    setRows((data ?? []) as OpenRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" aria-hidden="true" />
        Cargando solicitudes…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {msg && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-black/10 px-4 py-8 text-center dark:border-white/10">
          <p className="text-2xl" aria-hidden="true">—</p>
          <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">Sin solicitudes abiertas</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Las solicitudes aprobadas y vigentes aparecen aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            {rows.length} solicitud{rows.length !== 1 ? 'es' : ''} — selecciona una para ver voluntarios compatibles
          </p>
          {rows.map((r) => {
            const isSelected = selectedId === r.id;
            const isHigh = HIGH_STAKES.has(r.skill_needed);
            return (
              <button
                key={r.id}
                onClick={() =>
                  isSelected
                    ? onSelect(null)
                    : onSelect({ id: r.id, skill_needed: r.skill_needed, is_high_stakes: isHigh })
                }
                aria-pressed={isSelected}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/20'
                    : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: URGENCY_COLOR[r.urgency] ?? '#777' }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-sm">
                        {SKILL_LABEL[r.skill_needed]?.es ?? r.skill_needed}
                      </span>
                      {isHigh && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          ALTO RIESGO
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {[r.municipio, r.estado].filter(Boolean).join(', ') || 'Ubicación no especificada'}
                      {r.num_people ? ` · ${r.num_people} persona${r.num_people !== 1 ? 's' : ''}` : ''}
                      {r.has_minor_children ? ' · menores de edad' : ''}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: URGENCY_COLOR[r.urgency] ?? '#777' }}
                  >
                    {URGENCY_LABEL[r.urgency] ?? r.urgency}
                  </span>
                </div>
                {r.description && (
                  <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {r.description}
                  </p>
                )}
                {/* Private contact visible to coordinator only via RLS */}
                {r.contact_private && (
                  <p className="mt-1.5 rounded bg-zinc-100 px-2 py-1 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Contacto privado: {r.contact_private}
                  </p>
                )}
                {isSelected && (
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    Seleccionada — ver voluntarios abajo ↓
                  </p>
                )}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
