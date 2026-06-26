'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { donationItemLabel } from '@/lib/orgs';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Cargando centros…',
    refreshing: 'Actualizando…',
    emptyTitle: 'Cola vacía',
    emptyDesc: 'No hay centros de acopio pendientes.',
    noLocation: 'Sin ubicación',
    tel: 'Tel:',
    email: 'Email:',
    public: 'Público:',
    social: 'Red social:',
    hours: 'Horario:',
    approve: 'Aprobar',
    rejectSpam: 'Rechazar (spam)',
    confirmApprove: (name: string) => `Aprobar "${name}"?`,
    confirmReject: (name: string) => `Rechazar (spam) "${name}"?`,
    spamNote: 'Esto marcará el centro como spam y no aparecerá en público.',
    yesApprove: 'Sí, aprobar',
    yesReject: 'Sí, rechazar',
    cancel: 'Cancelar',
    noPermission: 'Sin permiso de coordinador.',
    ariaApprove: (name: string) => `Aprobar centro ${name}`,
    ariaReject: (name: string) => `Rechazar centro ${name}`,
  },
  en: {
    loading: 'Loading centers…',
    refreshing: 'Refreshing…',
    emptyTitle: 'Queue empty',
    emptyDesc: 'No collection centers pending.',
    noLocation: 'No location',
    tel: 'Phone:',
    email: 'Email:',
    public: 'Public:',
    social: 'Social:',
    hours: 'Hours:',
    approve: 'Approve',
    rejectSpam: 'Reject (spam)',
    confirmApprove: (name: string) => `Approve "${name}"?`,
    confirmReject: (name: string) => `Reject (spam) "${name}"?`,
    spamNote: 'This will mark the center as spam and it will not appear publicly.',
    yesApprove: 'Yes, approve',
    yesReject: 'Yes, reject',
    cancel: 'Cancel',
    noPermission: 'Coordinator access required.',
    ariaApprove: (name: string) => `Approve center ${name}`,
    ariaReject: (name: string) => `Reject center ${name}`,
  },
} as const;

interface PendingCenter {
  id: string;
  name: string;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  address: string | null;
  contact_public_display: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  social_handle: string | null;
  hours_notes: string | null;
  accepts_items: string[] | null;
  priority_items: string[] | null;
  needs_notes: string | null;
  accepts_monetary: boolean;
  monetary_url: string | null;
  created_at: string;
}

const SELECT = [
  'id,name,city,state_province,country_code,address',
  'contact_public_display,contact_phone,contact_email',
  'social_handle,hours_notes,accepts_items,priority_items',
  'needs_notes,accepts_monetary,monetary_url,created_at',
].join(',');

interface ConfirmState {
  id: string;
  name: string;
  approve: boolean;
}

export function DonationCenterQueue() {
  const locale = useLocale();
  const s = STR[locale];
  const [rows, setRows] = useState<PendingCenter[]>([]);
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
      .from('donation_centers')
      .select(SELECT)
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as unknown as PendingCenter[]);
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

  function promptDecide(center: PendingCenter, approve: boolean) {
    setMsg('');
    setConfirm({ id: center.id, name: center.name, approve });
  }

  async function executeDecide() {
    if (!confirm) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(confirm.id);
    setConfirm(null);
    setMsg('');
    const { data, error } = await sb.rpc('approve_donation_center', {
      p_center: confirm.id,
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
              {confirm.approve ? s.confirmApprove(confirm.name) : s.confirmReject(confirm.name)}
            </p>
            {!confirm.approve && (
              <p className="mt-1 text-xs text-zinc-500">
                {s.spamNote}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={executeDecide}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white ${
                  confirm.approve ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirm.approve ? s.yesApprove : s.yesReject}
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
        rows.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-4 transition-opacity ${
              busy === c.id ? 'opacity-50' : ''
            } border-black/10 dark:border-white/10`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium leading-snug">{c.name}</div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(c.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-VE')}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {[c.address, c.city, c.state_province, c.country_code].filter(Boolean).join(', ') || s.noLocation}
            </div>

            {/* Private contact — visible only to coordinator via RLS */}
            <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-2 sm:gap-x-4">
              {c.contact_phone && <div>{s.tel} <strong>{c.contact_phone}</strong></div>}
              {c.contact_email && <div>{s.email} <strong>{c.contact_email}</strong></div>}
              {c.contact_public_display && <div>{s.public} <strong>{c.contact_public_display}</strong></div>}
              {c.social_handle && <div>{s.social} <strong>{c.social_handle}</strong></div>}
              {c.hours_notes && <div className="sm:col-span-2">{s.hours} {c.hours_notes}</div>}
            </dl>

            {c.priority_items && c.priority_items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.priority_items.map((it) => (
                  <span
                    key={it}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  >
                    {donationItemLabel(it, locale)}
                  </span>
                ))}
              </div>
            )}
            {c.needs_notes && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.needs_notes}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => promptDecide(c, true)}
                disabled={busy === c.id}
                aria-label={s.ariaApprove(c.name)}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {s.approve}
              </button>
              <button
                onClick={() => promptDecide(c, false)}
                disabled={busy === c.id}
                aria-label={s.ariaReject(c.name)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5 disabled:opacity-50"
              >
                {s.rejectSpam}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
