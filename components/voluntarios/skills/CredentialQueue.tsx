'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { skillLabel } from '@/lib/skills';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Cargando cola de credenciales…',
    refreshing: 'Actualizando…',
    emptyTitle: 'Sin pendientes',
    emptyDesc: 'No hay credenciales pendientes de verificación.',
    altoRiesgo: 'ALTO RIESGO',
    approved: 'Aprobada',
    pendingMod: 'Pendiente mod.',
    viewCredential: 'Ver credencial →',
    verifyCredential: 'Verificar credencial',
    reject: 'Rechazar',
    confirmVerify: (skill: string) => `Verificar credencial de "${skill}"?`,
    confirmReject: (skill: string) => `Rechazar credencial de "${skill}"?`,
    offerRejectedNote: 'La oferta quedará rechazada y el voluntario no podrá ser conectado.',
    checkDocNote: 'Asegúrate de haber revisado el documento antes de confirmar.',
    yesVerify: 'Sí, verificar',
    yesReject: 'Sí, rechazar',
    cancel: 'Cancelar',
    openDocError: 'No se pudo abrir el documento.',
    noPermission: 'Sin permiso de coordinador.',
  },
  en: {
    loading: 'Loading credential queue…',
    refreshing: 'Refreshing…',
    emptyTitle: 'No pending items',
    emptyDesc: 'No credentials pending verification.',
    altoRiesgo: 'HIGH-STAKES',
    approved: 'Approved',
    pendingMod: 'Pending mod.',
    viewCredential: 'View credential →',
    verifyCredential: 'Verify credential',
    reject: 'Reject',
    confirmVerify: (skill: string) => `Verify credential for "${skill}"?`,
    confirmReject: (skill: string) => `Reject credential for "${skill}"?`,
    offerRejectedNote: 'The offer will be rejected and the volunteer cannot be connected.',
    checkDocNote: 'Make sure you have reviewed the document before confirming.',
    yesVerify: 'Yes, verify',
    yesReject: 'Yes, reject',
    cancel: 'Cancel',
    openDocError: 'Could not open the document.',
    noPermission: 'Coordinator access required.',
  },
} as const;

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

interface ConfirmState {
  id: string;
  skill: string;
  approve: boolean;
}

export function CredentialQueue() {
  const locale = useLocale();
  const s = STR[locale];
  const [rows, setRows] = useState<UnverifiedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (isRefresh = false) => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true);
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
    if (error) { setMsg(error.message); setLoading(false); setRefreshing(false); return; }
    setRows((data ?? []) as UnverifiedOffer[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sync dialog open state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirm) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [confirm]);

  async function openDoc(path: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.storage.from('skill-docs').createSignedUrl(path, 120);
    if (error || !data) { setMsg(s.openDocError); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  function promptVerify(offer: UnverifiedOffer, approve: boolean) {
    setMsg('');
    setConfirm({
      id: offer.id,
      skill: skillLabel(offer.skill_category, locale),
      approve,
    });
  }

  async function executeVerify() {
    if (!confirm) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(confirm.id);
    setConfirm(null);
    setMsg('');
    // verify_skill_credential sets moderation_status='approved' when p_approve=true,
    // so no separate approve_skill_offer call is needed.
    const { data, error } = await sb.rpc('verify_skill_credential', {
      p_offer: confirm.id,
      p_approve: confirm.approve,
    });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    if (data === false) { setMsg(s.noPermission); return; }
    await load(true);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" aria-hidden="true" />
        {s.loading}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Confirm dialog */}
      <dialog
        ref={dialogRef}
        className="rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900 w-full max-w-sm backdrop:bg-black/40"
        onClose={() => setConfirm(null)}
      >
        {confirm && (
          <div>
            <p className="text-sm font-semibold">
              {confirm.approve ? s.confirmVerify(confirm.skill) : s.confirmReject(confirm.skill)}
            </p>
            {!confirm.approve && (
              <p className="mt-1 text-xs text-zinc-500">
                {s.offerRejectedNote}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-400">
              {s.checkDocNote}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={executeVerify}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white ${
                  confirm.approve ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirm.approve ? s.yesVerify : s.yesReject}
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20"
              >
                {s.cancel}
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
          {s.refreshing}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-black/10 px-4 py-6 text-center dark:border-white/10">
          <p className="text-2xl" aria-hidden="true">✓</p>
          <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">{s.emptyTitle}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{s.emptyDesc}</p>
        </div>
      ) : (
        rows.map((o) => (
          <div
            key={o.id}
            className={`rounded-lg border border-amber-200 bg-amber-50/40 p-4 transition-opacity dark:border-amber-800/50 dark:bg-amber-950/10 ${
              busy === o.id ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">
                    {skillLabel(o.skill_category, locale)}
                  </span>
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                    {s.altoRiesgo}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      o.moderation_status === 'approved'
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {o.moderation_status === 'approved' ? s.approved : s.pendingMod}
                  </span>
                </div>
                {o.skill_detail && (
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{o.skill_detail}</p>
                )}
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(o.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-VE')}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {o.credential_doc_path && (
                <button
                  onClick={() => openDoc(o.credential_doc_path!)}
                  aria-label={s.viewCredential}
                  className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                >
                  {s.viewCredential}
                </button>
              )}
              <button
                onClick={() => promptVerify(o, true)}
                disabled={busy === o.id}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {s.verifyCredential}
              </button>
              <button
                onClick={() => promptVerify(o, false)}
                disabled={busy === o.id}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5 disabled:opacity-50"
              >
                {s.reject}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
