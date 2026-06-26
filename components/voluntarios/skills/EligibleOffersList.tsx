'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SKILL_LABEL } from '@/lib/skills';

interface EligibleOffer {
  id: string;
  skill_category: string;
  skill_detail: string | null;
  languages: string[] | null;
  estado: string | null;
  operating_estados: string[] | null;
  contact_private: string | null;
  credential_verified: boolean;
  is_high_stakes: boolean;
  created_at: string;
}

const SELECT =
  'id,skill_category,skill_detail,languages,estado,operating_estados,contact_private,credential_verified,is_high_stakes,created_at';

interface Props {
  requestId: string;
  skillNeeded: string;
  isHighStakes: boolean;
}

export function EligibleOffersList({ requestId, skillNeeded, isHighStakes }: Props) {
  const [rows, setRows] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    let q = sb
      .from('skill_offers')
      .select(SELECT)
      .eq('skill_category', skillNeeded)
      .eq('moderation_status', 'approved')
      .eq('available', true)
      .is('suspended_at', null);

    if (isHighStakes) {
      q = q.eq('credential_verified', true);
    }

    const { data, error } = await q
      .order('credential_verified', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) { setMsg(error.message); setLoading(false); return; }
    setRows((data ?? []) as EligibleOffer[]);
    setLoading(false);
  }, [skillNeeded, isHighStakes]);

  useEffect(() => { load(); }, [load]);

  async function connectMatch(offerId: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(offerId);
    setMsg('');
    const { data, error } = await sb.rpc('confirm_match', {
      p_request: requestId,
      p_offer: offerId,
      p_notes: notes || null,
    });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    const result = data as { ok: boolean; error?: string; id?: string };
    if (!result.ok) {
      if (result.error === 'credential_required') {
        setMsg(
          'La credencial del voluntario aún no está verificada. Verifica la credencial primero en la cola de arriba.',
        );
      } else if (result.error === 'offer_not_active') {
        setMsg('Esta oferta ya no está activa (suspendida o no aprobada).');
      } else if (result.error === 'already_matched') {
        setMsg('Esta pareja ya estaba conectada.');
      } else {
        setMsg(result.error ?? 'Error desconocido.');
      }
      return;
    }
    setMsg('');
    await load();
  }

  async function suspendOffer(offerId: string, reason: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc('suspend_skill_offer', {
      p_offer: offerId,
      p_reason: reason,
    });
    if (error) { setMsg(error.message); return; }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Buscando voluntarios compatibles…</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No hay voluntarios aprobados disponibles para esta habilidad
          {isHighStakes ? ' con credencial verificada' : ''}.
        </p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Nota del coordinador (opcional — para el registro interno)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto de la conexión, próximos pasos, etc."
              className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
          </div>
          {rows.map((o) => (
            <div key={o.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {SKILL_LABEL[o.skill_category] ?? o.skill_category}
                    </span>
                    {o.credential_verified ? (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800 dark:bg-green-950/50 dark:text-green-300">
                        Credencial verificada
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        Sin verificar
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {[o.estado, ...(o.operating_estados ?? [])].filter(Boolean).join(', ') ||
                      'Estado no especificado'}
                    {o.languages?.length ? ` · ${o.languages.join(', ')}` : ''}
                  </div>
                  {o.skill_detail && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{o.skill_detail}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  {new Date(o.created_at).toLocaleDateString('es-VE')}
                </span>
              </div>
              {/* Private contact — for coordinator to introduce parties via RLS */}
              {o.contact_private && (
                <p className="mt-2 rounded bg-zinc-100 px-2 py-1 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Contacto privado: {o.contact_private}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => connectMatch(o.id)}
                  disabled={busy === o.id}
                  className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy === o.id ? 'Conectando…' : 'Conectar'}
                </button>
                <SuspendButton offerId={o.id} onSuspend={suspendOffer} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SuspendButton({
  offerId,
  onSuspend,
}: {
  offerId: string;
  onSuspend: (id: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20"
      >
        Suspender
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full mt-1">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo de suspensión"
        className="flex-1 rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
        autoFocus
      />
      <button
        onClick={() => { onSuspend(offerId, reason); setOpen(false); setReason(''); }}
        disabled={!reason.trim()}
        className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        Confirmar
      </button>
      <button
        onClick={() => { setOpen(false); setReason(''); }}
        className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20"
      >
        Cancelar
      </button>
    </div>
  );
}
