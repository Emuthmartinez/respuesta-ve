'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SKILL_LABEL } from '@/lib/skills';

interface UnverifiedOffer {
  id: string;
  skill_category: string;
  skill_detail: string | null;
  credential_doc_path: string | null;
  moderation_status: string;
  is_high_stakes: boolean;
  created_at: string;
}

const SELECT =
  'id,skill_category,skill_detail,credential_doc_path,moderation_status,is_high_stakes,created_at';

export function CredentialQueue() {
  const [rows, setRows] = useState<UnverifiedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    // High-stakes offers that are pending or approved but not yet credential_verified.
    // Coordinator reads base table via skill_offers_self_or_coord_select RLS.
    const { data, error } = await sb
      .from('skill_offers')
      .select(SELECT)
      .eq('is_high_stakes', true)
      .eq('credential_verified', false)
      .is('suspended_at', null)
      .in('moderation_status', ['pending', 'approved'])
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) { setMsg(error.message); setLoading(false); return; }
    setRows((data ?? []) as UnverifiedOffer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openDoc(path: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.storage.from('skill-docs').createSignedUrl(path, 120);
    if (error || !data) { setMsg('No se pudo abrir el documento.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function verifyCredential(offerId: string, approve: boolean) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    // verify_skill_credential sets moderation_status='approved' when p_approve=true,
    // so no separate approve_skill_offer call is needed.
    const { data, error } = await sb.rpc('verify_skill_credential', {
      p_offer: offerId,
      p_approve: approve,
    });
    if (error) { setMsg(error.message); return; }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Cargando cola de credenciales…</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay credenciales pendientes de verificación.</p>
      ) : (
        rows.map((o) => (
          <div
            key={o.id}
            className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-800/50 dark:bg-amber-950/10"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {SKILL_LABEL[o.skill_category] ?? o.skill_category}
                  </span>
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                    ALTO RIESGO
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      o.moderation_status === 'approved'
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {o.moderation_status === 'approved' ? 'Aprobada' : 'Pendiente mod.'}
                  </span>
                </div>
                {o.skill_detail && (
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{o.skill_detail}</p>
                )}
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(o.created_at).toLocaleDateString('es-VE')}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {o.credential_doc_path && (
                <button
                  onClick={() => openDoc(o.credential_doc_path!)}
                  className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20"
                >
                  Ver credencial →
                </button>
              )}
              <button
                onClick={() => verifyCredential(o.id, true)}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
              >
                Verificar credencial
              </button>
              <button
                onClick={() => verifyCredential(o.id, false)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
