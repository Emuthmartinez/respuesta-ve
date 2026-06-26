'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { CREDENTIAL_LABEL } from '@/lib/responder';

interface PendingResponder {
  id: string;
  full_name: string;
  credential_type: string;
  credential_number: string | null;
  credential_issuing_body: string | null;
  organization: string | null;
  cedula_identidad: string | null;
  current_estado: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  credential_doc_path: string | null;
  selfie_with_doc_path: string | null;
  activation_code: string | null;
  applied_at: string;
}

const SELECT =
  'id,full_name,credential_type,credential_number,credential_issuing_body,organization,cedula_identidad,current_estado,phone,whatsapp_number,credential_doc_path,selfie_with_doc_path,activation_code,applied_at';

export function ResponderVerifyList() {
  const [rows, setRows] = useState<PendingResponder[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from('responders')
      .select(SELECT)
      .eq('verification', 'pending')
      .order('applied_at', { ascending: true })
      .limit(100);
    if (!error) setRows((data ?? []) as PendingResponder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDoc(path: string | null) {
    if (!path) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.storage.from('responder-docs').createSignedUrl(path, 120);
    if (error || !data) {
      setMsg('No se pudo abrir el documento.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function decide(id: string, approve: boolean, tier: string) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setMsg('');
    const { data, error } = await sb.rpc('verify_responder', {
      p_responder: id,
      p_tier: tier,
      p_approve: approve,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data === false) setMsg('Sin permiso de coordinador.');
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Cargando solicitudes…</p>;

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{msg}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay registros pendientes. 🎉</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{r.full_name}</div>
                <div className="text-sm text-zinc-500">{CREDENTIAL_LABEL[r.credential_type] ?? r.credential_type}</div>
              </div>
              {r.activation_code && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950/50 dark:text-green-300">
                  Código de activación
                </span>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <div>Cédula: <strong>{r.cedula_identidad || '—'}</strong></div>
              <div>N.º credencial: <strong>{r.credential_number || '—'}</strong></div>
              <div>Ente: <strong>{r.credential_issuing_body || '—'}</strong></div>
              <div>Organización: <strong>{r.organization || '—'}</strong></div>
              <div>Estado: <strong>{r.current_estado || '—'}</strong></div>
              <div>Tel: <strong>{r.phone || r.whatsapp_number || '—'}</strong></div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.credential_doc_path && (
                <button onClick={() => openDoc(r.credential_doc_path)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                  Ver credencial
                </button>
              )}
              {r.selfie_with_doc_path && (
                <button onClick={() => openDoc(r.selfie_with_doc_path)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                  Ver selfie
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => decide(r.id, true, 'verified')} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                Verificar
              </button>
              <button onClick={() => decide(r.id, true, 'senior')} className="rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-200 dark:text-zinc-900">
                Verificar como coordinador
              </button>
              <button onClick={() => decide(r.id, false, 'provisional')} className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20">
                Rechazar
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
