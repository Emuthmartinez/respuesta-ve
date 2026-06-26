'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { orgCategoryLabel, orgScopeLabel } from '@/lib/orgs';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Cargando organizaciones…',
    refreshing: 'Actualizando…',
    emptyTitle: 'Cola vacía',
    emptyDesc: 'No hay organizaciones sugeridas.',
    inVenezuela: 'En Venezuela',
    notes: 'Notas:',
    website: 'Sitio web →',
    donationUrl: 'URL donación →',
    promote: 'Promover (activar)',
    reject: 'Rechazar',
    confirmPromote: (name: string) => `Promover "${name}"?`,
    confirmReject: (name: string) => `Rechazar "${name}"?`,
    promoteNote: 'La organización quedará activa y visible en /afuera.',
    rejectNote: 'La organización quedará inactiva y no aparecerá en público.',
    yesPromote: 'Sí, promover',
    yesReject: 'Sí, rechazar',
    cancel: 'Cancelar',
    noPermission: 'Sin permiso de coordinador.',
    ariaPromote: (name: string) => `Promover organización ${name}`,
    ariaReject: (name: string) => `Rechazar organización ${name}`,
  },
  en: {
    loading: 'Loading organizations…',
    refreshing: 'Refreshing…',
    emptyTitle: 'Queue empty',
    emptyDesc: 'No suggested organizations.',
    inVenezuela: 'In Venezuela',
    notes: 'Notes:',
    website: 'Website →',
    donationUrl: 'Donation URL →',
    promote: 'Promote (activate)',
    reject: 'Reject',
    confirmPromote: (name: string) => `Promote "${name}"?`,
    confirmReject: (name: string) => `Reject "${name}"?`,
    promoteNote: 'The organization will become active and visible at /afuera.',
    rejectNote: 'The organization will become inactive and will not appear publicly.',
    yesPromote: 'Yes, promote',
    yesReject: 'Yes, reject',
    cancel: 'Cancel',
    noPermission: 'Coordinator access required.',
    ariaPromote: (name: string) => `Promote organization ${name}`,
    ariaReject: (name: string) => `Reject organization ${name}`,
  },
} as const;

interface SuggestedOrg {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  donation_url: string | null;
  category: string;
  scope: string;
  is_in_country: boolean;
  submitter_notes: string | null;
  created_at: string;
}

const SELECT =
  'id,name,description,website_url,donation_url,category,scope,is_in_country,submitter_notes,created_at';

interface ConfirmState {
  id: string;
  name: string;
  approve: boolean;
}

export function OrganizationQueue() {
  const locale = useLocale();
  const s = STR[locale];
  const [rows, setRows] = useState<SuggestedOrg[]>([]);
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
    const { data, error } = await sb
      .from('organizations')
      .select(SELECT)
      .eq('org_status', 'suggested')
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as SuggestedOrg[]);
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

  function promptDecide(org: SuggestedOrg, approve: boolean) {
    setMsg('');
    setConfirm({ id: org.id, name: org.name, approve });
  }

  async function executeDecide() {
    if (!confirm) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(confirm.id);
    setConfirm(null);
    setMsg('');
    const { data, error } = await sb.rpc('promote_organization', {
      p_org: confirm.id,
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
              {confirm.approve ? s.confirmPromote(confirm.name) : s.confirmReject(confirm.name)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {confirm.approve ? s.promoteNote : s.rejectNote}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={executeDecide}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white ${
                  confirm.approve ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirm.approve ? s.yesPromote : s.yesReject}
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
        <div className="rounded-lg border border-black/10 px-4 py-8 text-center dark:border-white/10">
          <p className="text-2xl" aria-hidden="true">✓</p>
          <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">{s.emptyTitle}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{s.emptyDesc}</p>
        </div>
      ) : (
        rows.map((o) => (
          <div
            key={o.id}
            className={`rounded-lg border p-4 transition-opacity ${
              busy === o.id ? 'opacity-50' : ''
            } border-black/10 dark:border-white/10`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium leading-snug">{o.name}</div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(o.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-VE')}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {orgCategoryLabel(o.category, locale)}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {orgScopeLabel(o.scope, locale)}
              </span>
              {o.is_in_country && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  {s.inVenezuela}
                </span>
              )}
            </div>
            {o.description && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{o.description}</p>
            )}
            {o.submitter_notes && (
              <p className="mt-1 text-xs italic text-zinc-500">{s.notes} {o.submitter_notes}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {o.website_url && (
                <a
                  href={o.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                >
                  {s.website}
                </a>
              )}
              {o.donation_url && o.donation_url !== o.website_url && (
                <a
                  href={o.donation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                >
                  {s.donationUrl}
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => promptDecide(o, true)}
                disabled={busy === o.id}
                aria-label={s.ariaPromote(o.name)}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {s.promote}
              </button>
              <button
                onClick={() => promptDecide(o, false)}
                disabled={busy === o.id}
                aria-label={s.ariaReject(o.name)}
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
