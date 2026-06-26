'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { ORG_CATEGORY_LABEL, ORG_SCOPE_LABEL } from '@/lib/orgs';

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

export function OrganizationQueue() {
  const [rows, setRows] = useState<SuggestedOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    const { data, error } = await sb
      .from('organizations')
      .select(SELECT)
      .eq('org_status', 'suggested')
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as SuggestedOrg[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, approve: boolean) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc('promote_organization', {
      p_org: id,
      p_approve: approve,
    });
    if (error) { setMsg(error.message); return; }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Cargando organizaciones…</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {msg}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay organizaciones sugeridas.</p>
      ) : (
        rows.map((o) => (
          <div key={o.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{o.name}</div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(o.created_at).toLocaleDateString('es-VE')}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {ORG_CATEGORY_LABEL[o.category] ?? o.category}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {ORG_SCOPE_LABEL[o.scope] ?? o.scope}
              </span>
              {o.is_in_country && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  En Venezuela
                </span>
              )}
            </div>
            {o.description && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{o.description}</p>
            )}
            {o.submitter_notes && (
              <p className="mt-1 text-xs italic text-zinc-500">Notas: {o.submitter_notes}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {o.website_url && (
                <a
                  href={o.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-black/15 px-3 py-1 dark:border-white/20"
                >
                  Sitio web →
                </a>
              )}
              {o.donation_url && o.donation_url !== o.website_url && (
                <a
                  href={o.donation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-black/15 px-3 py-1 dark:border-white/20"
                >
                  URL donación →
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => decide(o.id, true)}
                className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
              >
                Promover (activar)
              </button>
              <button
                onClick={() => decide(o.id, false)}
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
