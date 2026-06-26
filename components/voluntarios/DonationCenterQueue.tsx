'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DONATION_ITEM_LABEL } from '@/lib/orgs';

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

export function DonationCenterQueue() {
  const [rows, setRows] = useState<PendingCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    const { data, error } = await sb
      .from('donation_centers')
      .select(SELECT)
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as unknown as PendingCenter[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, approve: boolean) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc('approve_donation_center', {
      p_center: id,
      p_approve: approve,
    });
    if (error) { setMsg(error.message); return; }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Cargando centros…</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay centros pendientes.</p>
      ) : (
        rows.map((c) => (
          <div key={c.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{c.name}</div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(c.created_at).toLocaleDateString('es-VE')}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {[c.address, c.city, c.state_province, c.country_code].filter(Boolean).join(', ') || 'Sin ubicación'}
            </div>
            {/* Private contact — visible only to coordinator via RLS */}
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {c.contact_phone && <div>Tel: <strong>{c.contact_phone}</strong></div>}
              {c.contact_email && <div>Email: <strong>{c.contact_email}</strong></div>}
              {c.contact_public_display && <div>Público: <strong>{c.contact_public_display}</strong></div>}
              {c.social_handle && <div>Red social: <strong>{c.social_handle}</strong></div>}
              {c.hours_notes && <div className="col-span-2">Horario: {c.hours_notes}</div>}
            </dl>
            {c.priority_items && c.priority_items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.priority_items.map((it) => (
                  <span
                    key={it}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  >
                    {DONATION_ITEM_LABEL[it] ?? it}
                  </span>
                ))}
              </div>
            )}
            {c.needs_notes && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.needs_notes}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => decide(c.id, true)}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
              >
                Aprobar
              </button>
              <button
                onClick={() => decide(c.id, false)}
                className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20"
              >
                Rechazar (spam)
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
