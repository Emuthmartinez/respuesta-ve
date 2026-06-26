'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { skillLabel } from '@/lib/skills';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Buscando voluntarios compatibles…',
    refreshing: 'Actualizando…',
    emptyTitle: 'Sin voluntarios disponibles',
    emptyDescBase: 'No hay voluntarios aprobados disponibles para esta habilidad',
    emptyDescHighStakes: ' con credencial verificada',
    credVerified: 'Credencial verificada',
    unverified: 'Sin verificar',
    stateUnspecified: 'Estado no especificado',
    privateContact: 'Contacto privado:',
    connect: 'Conectar',
    connecting: 'Conectando…',
    suspend: 'Suspender',
    suspensionReason: 'Motivo de suspensión',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    countText: (n: number) => `${n} voluntario${n !== 1 ? 's' : ''} compatible${n !== 1 ? 's' : ''}`,
    notesLabel: 'Nota del coordinador (opcional — para el registro interno)',
    notesPlaceholder: 'Contexto de la conexión, próximos pasos, etc.',
    connectConfirmTitle: 'Conectar voluntario con esta solicitud?',
    skill: 'Habilidad:',
    highStakesNote: 'Habilidad de alto riesgo. Confirma que has verificado la credencial.',
    noteLabel: 'Nota:',
    yesConnect: 'Sí, conectar',
    ariaConnect: (skill: string) => `Conectar voluntario con habilidad ${skill}`,
    errorCredRequired: 'La credencial del voluntario aún no está verificada. Verifica la credencial primero en la cola de arriba.',
    errorOfferNotActive: 'Esta oferta ya no está activa (suspendida o no aprobada).',
    errorAlreadyMatched: 'Esta pareja ya estaba conectada.',
    errorUnknown: 'Error desconocido.',
    noPermission: 'Sin permiso de coordinador.',
  },
  en: {
    loading: 'Searching for compatible volunteers…',
    refreshing: 'Refreshing…',
    emptyTitle: 'No volunteers available',
    emptyDescBase: 'No approved volunteers available for this skill',
    emptyDescHighStakes: ' with a verified credential',
    credVerified: 'Credential verified',
    unverified: 'Unverified',
    stateUnspecified: 'State not specified',
    privateContact: 'Private contact:',
    connect: 'Connect',
    connecting: 'Connecting…',
    suspend: 'Suspend',
    suspensionReason: 'Suspension reason',
    confirm: 'Confirm',
    cancel: 'Cancel',
    countText: (n: number) => `${n} compatible volunteer${n !== 1 ? 's' : ''}`,
    notesLabel: 'Coordinator note (optional — for internal record)',
    notesPlaceholder: 'Connection context, next steps, etc.',
    connectConfirmTitle: 'Connect volunteer with this request?',
    skill: 'Skill:',
    highStakesNote: 'High-stakes skill. Confirm you have verified the credential.',
    noteLabel: 'Note:',
    yesConnect: 'Yes, connect',
    ariaConnect: (skill: string) => `Connect volunteer with skill ${skill}`,
    errorCredRequired: 'The volunteer\'s credential has not been verified yet. Verify the credential first in the queue above.',
    errorOfferNotActive: 'This offer is no longer active (suspended or not approved).',
    errorAlreadyMatched: 'This pair was already connected.',
    errorUnknown: 'Unknown error.',
    noPermission: 'Coordinator access required.',
  },
} as const;

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

interface ConnectConfirm {
  offerId: string;
  label: string;
}

export function EligibleOffersList({ requestId, skillNeeded, isHighStakes }: Props) {
  const locale = useLocale();
  const s = STR[locale];
  const [rows, setRows] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [connectConfirm, setConnectConfirm] = useState<ConnectConfirm | null>(null);
  const [suspendState, setSuspendState] = useState<{ id: string; reason: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); setRefreshing(false); return; }
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

    if (error) { setMsg(error.message); setLoading(false); setRefreshing(false); return; }
    setRows((data ?? []) as EligibleOffer[]);
    setLoading(false);
    setRefreshing(false);
  }, [skillNeeded, isHighStakes]);

  useEffect(() => { load(); }, [load]);

  // Sync connect confirm dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (connectConfirm) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [connectConfirm]);

  function promptConnect(offerId: string, label: string) {
    setMsg('');
    setConnectConfirm({ offerId, label });
  }

  async function executeConnect() {
    if (!connectConfirm) return;
    const { offerId } = connectConfirm;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setConnectConfirm(null);
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
        setMsg(s.errorCredRequired);
      } else if (result.error === 'offer_not_active') {
        setMsg(s.errorOfferNotActive);
      } else if (result.error === 'already_matched') {
        setMsg(s.errorAlreadyMatched);
      } else {
        setMsg(result.error ?? s.errorUnknown);
      }
      return;
    }
    setMsg('');
    await load(true);
  }

  async function executeSuspend() {
    if (!suspendState || !suspendState.reason.trim()) return;
    const { id, reason } = suspendState;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setSuspendState(null);
    setMsg('');
    const { data, error } = await sb.rpc('suspend_skill_offer', {
      p_offer: id,
      p_reason: reason,
    });
    if (error) { setMsg(error.message); return; }
    if (data === false) { setMsg('Sin permiso de coordinador.'); return; }
    await load(true);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" aria-hidden="true" />
        Buscando voluntarios compatibles…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Connect confirm dialog */}
      <dialog
        ref={dialogRef}
        className="rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900 w-full max-w-sm backdrop:bg-black/40"
        onClose={() => setConnectConfirm(null)}
      >
        {connectConfirm && (
          <div>
            <p className="text-sm font-semibold">Conectar voluntario con esta solicitud?</p>
            <p className="mt-1 text-xs text-zinc-500">
              Habilidad: <strong>{connectConfirm.label}</strong>
            </p>
            {isHighStakes && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Habilidad de alto riesgo. Confirma que has verificado la credencial.
              </p>
            )}
            {notes && (
              <p className="mt-1 text-xs text-zinc-400 italic">Nota: {notes}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={executeConnect}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Sí, conectar
              </button>
              <button
                onClick={() => setConnectConfirm(null)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </dialog>

      {msg && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}

      {refreshing && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500" aria-hidden="true" />
          Actualizando…
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-black/10 px-4 py-8 text-center dark:border-white/10">
          <p className="text-2xl" aria-hidden="true">—</p>
          <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">Sin voluntarios disponibles</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No hay voluntarios aprobados disponibles para esta habilidad
            {isHighStakes ? ' con credencial verificada' : ''}.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="coordinator-notes" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Nota del coordinador (opcional — para el registro interno)
            </label>
            <textarea
              id="coordinator-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto de la conexión, próximos pasos, etc."
              className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
          </div>

          <p className="text-xs text-zinc-500">
            {rows.length} voluntario{rows.length !== 1 ? 's' : ''} compatible{rows.length !== 1 ? 's' : ''}
          </p>

          {rows.map((o) => {
            const skillLabel = SKILL_LABEL[o.skill_category]?.es ?? o.skill_category;
            return (
              <div
                key={o.id}
                className={`rounded-lg border border-black/10 p-4 transition-opacity dark:border-white/10 ${
                  busy === o.id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{skillLabel}</span>
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

                <div className="mt-3 space-y-2">
                  {/* Main actions row */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => promptConnect(o.id, skillLabel)}
                      disabled={busy === o.id}
                      aria-label={`Conectar voluntario con habilidad ${skillLabel}`}
                      className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy === o.id ? 'Conectando…' : 'Conectar'}
                    </button>
                    {suspendState?.id !== o.id && (
                      <button
                        onClick={() => setSuspendState({ id: o.id, reason: '' })}
                        disabled={busy === o.id}
                        className="rounded-full border border-black/15 px-4 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        Suspender
                      </button>
                    )}
                  </div>

                  {/* Inline suspend form */}
                  {suspendState?.id === o.id && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={suspendState.reason}
                        onChange={(e) => setSuspendState({ id: o.id, reason: e.target.value })}
                        placeholder="Motivo de suspensión"
                        aria-label="Motivo de suspensión"
                        className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && suspendState.reason.trim()) executeSuspend();
                          if (e.key === 'Escape') setSuspendState(null);
                        }}
                      />
                      <button
                        onClick={executeSuspend}
                        disabled={!suspendState.reason.trim()}
                        className="shrink-0 rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setSuspendState(null)}
                        className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
