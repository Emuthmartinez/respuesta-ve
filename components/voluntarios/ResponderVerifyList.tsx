'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { credentialLabel } from '@/lib/responder';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    loading: 'Cargando solicitudes…',
    empty: 'No hay registros pendientes. 🎉',
    activationCode: 'Código de activación',
    cedula: 'Cédula:',
    credentialNo: 'N.º credencial:',
    issuer: 'Ente:',
    org: 'Organización:',
    estado: 'Estado:',
    tel: 'Tel:',
    viewCredential: 'Ver credencial',
    viewSelfie: 'Ver selfie',
    verify: 'Verificar',
    verifyAsCoordinator: 'Verificar como coordinador',
    reject: 'Rechazar',
    openDocError: 'No se pudo abrir el documento.',
    noPermission: 'Sin permiso de coordinador.',
  },
  en: {
    loading: 'Loading requests…',
    empty: 'No pending records. 🎉',
    activationCode: 'Activation code',
    cedula: 'National ID:',
    credentialNo: 'Credential no.:',
    issuer: 'Issuing body:',
    org: 'Organization:',
    estado: 'State:',
    tel: 'Phone:',
    viewCredential: 'View credential',
    viewSelfie: 'View selfie',
    verify: 'Verify',
    verifyAsCoordinator: 'Verify as coordinator',
    reject: 'Reject',
    openDocError: 'Could not open the document.',
    noPermission: 'Coordinator access required.',
  },
} as const;

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
  const locale = useLocale();
  const s = STR[locale];
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
      setMsg(s.openDocError);
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
    if (data === false) setMsg(s.noPermission);
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">{s.loading}</p>;

  return (
    <div className="space-y-3">
      {msg && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{msg}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{s.empty}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{r.full_name}</div>
                <div className="text-sm text-zinc-500">{credentialLabel(r.credential_type, locale)}</div>
              </div>
              {r.activation_code && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950/50 dark:text-green-300">
                  {s.activationCode}
                </span>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <div>{s.cedula} <strong>{r.cedula_identidad || '—'}</strong></div>
              <div>{s.credentialNo} <strong>{r.credential_number || '—'}</strong></div>
              <div>{s.issuer} <strong>{r.credential_issuing_body || '—'}</strong></div>
              <div>{s.org} <strong>{r.organization || '—'}</strong></div>
              <div>{s.estado} <strong>{r.current_estado || '—'}</strong></div>
              <div>{s.tel} <strong>{r.phone || r.whatsapp_number || '—'}</strong></div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.credential_doc_path && (
                <button onClick={() => openDoc(r.credential_doc_path)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                  {s.viewCredential}
                </button>
              )}
              {r.selfie_with_doc_path && (
                <button onClick={() => openDoc(r.selfie_with_doc_path)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">
                  {s.viewSelfie}
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => decide(r.id, true, 'verified')} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                {s.verify}
              </button>
              <button onClick={() => decide(r.id, true, 'senior')} className="rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-200 dark:text-zinc-900">
                {s.verifyAsCoordinator}
              </button>
              <button onClick={() => decide(r.id, false, 'provisional')} className="rounded-full border border-black/15 px-4 py-1.5 text-xs dark:border-white/20">
                {s.reject}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
