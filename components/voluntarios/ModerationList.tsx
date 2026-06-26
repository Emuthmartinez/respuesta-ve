'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DAMAGE_BY_VALUE, type DamageLevel } from '@/lib/taxonomy';

interface PendingBuilding {
  id: string;
  estado: string | null;
  municipio: string | null;
  address: string | null;
  description: string | null;
  damage_level: string;
  people_status: string;
  created_at: string;
}

export function ModerationList() {
  const [rows, setRows] = useState<PendingBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from('buildings')
      .select('id,estado,municipio,address,description,damage_level,people_status,created_at')
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as PendingBuilding[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, status: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc('moderate_building', { p_building: id, p_status: status });
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Cargando reportes…</p>;

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{msg}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay reportes pendientes. 🎉</p>
      ) : (
        rows.map((b) => (
          <div key={b.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: DAMAGE_BY_VALUE[b.damage_level as DamageLevel]?.color ?? '#777' }}
              >
                {DAMAGE_BY_VALUE[b.damage_level as DamageLevel]?.label ?? b.damage_level}
              </span>
              <span className="text-xs text-zinc-500">{new Date(b.created_at).toLocaleString('es-VE')}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {[b.address, b.municipio, b.estado].filter(Boolean).join(', ') || 'Sin ubicación'}
            </div>
            {b.description && <p className="mt-1 text-sm">{b.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => moderate(b.id, 'approved')} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                Aprobar
              </button>
              <button onClick={() => moderate(b.id, 'rejected_spam')} className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20">
                Rechazar (spam)
              </button>
              <button onClick={() => moderate(b.id, 'rejected_abusive')} className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20">
                Rechazar (abuso)
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
