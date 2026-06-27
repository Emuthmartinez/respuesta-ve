'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { SupabasePublicConfig } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

interface DeveloperKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  rateLimitPerDay: number;
  enabled: boolean;
  revokedAt: string | null;
  notes: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

const STR = {
  es: {
    issueTitle: 'Crear una clave',
    name: 'Nombre del sitio, bot o integracion',
    namePlaceholder: 'terremotovenezuela.app',
    notes: 'Notas privadas (opcional)',
    notesPlaceholder: 'Para importes desde Discord, CSV, mapa publico...',
    issue: 'Crear clave',
    issuing: 'Creando...',
    showOnce: 'Copia esta clave ahora. Solo se muestra una vez; despues solo puedes revocarla y crear otra.',
    copy: 'Copiar',
    copied: 'Copiado',
    dismiss: 'Ya la guarde',
    existing: 'Mis claves',
    none: 'Todavia no tienes claves.',
    loading: 'Cargando...',
    revoked: 'Revocada',
    disabled: 'Pausada',
    active: 'Activa',
    disable: 'Pausar',
    enable: 'Activar',
    revoke: 'Revocar',
    confirmRevoke: 'Revocar esta clave de forma permanente?',
    lastUsed: 'Ultimo uso',
    never: 'nunca',
    needName: 'Pon un nombre para reconocer esta clave.',
    dbError: 'La base de datos aun no esta conectada.',
    authRequired: 'Inicia sesion para crear claves.',
    tooMany: 'Ya tienes el maximo de claves activas. Revoca una antes de crear otra.',
    fixedScopes: 'Incluye permisos para enviar datos, buscar, deduplicar y sincronizar registros procesados.',
    limits: 'Limites iniciales: 30/min y 1,000/dia. El equipo puede ajustarlos si tu integracion necesita mas capacidad.',
    useTitle: 'Uso rapido',
    useCopy: 'Usa la clave como Bearer token desde tu servidor. No la publiques en codigo del navegador.',
  },
  en: {
    issueTitle: 'Create a key',
    name: 'Site, bot, or integration name',
    namePlaceholder: 'terremotovenezuela.app',
    notes: 'Private notes (optional)',
    notesPlaceholder: 'For Discord imports, CSV, public map...',
    issue: 'Create key',
    issuing: 'Creating...',
    showOnce: 'Copy this key now. It is shown once; later you can only revoke it and create another.',
    copy: 'Copy',
    copied: 'Copied',
    dismiss: 'I saved it',
    existing: 'My keys',
    none: 'You do not have keys yet.',
    loading: 'Loading...',
    revoked: 'Revoked',
    disabled: 'Paused',
    active: 'Active',
    disable: 'Pause',
    enable: 'Enable',
    revoke: 'Revoke',
    confirmRevoke: 'Permanently revoke this key?',
    lastUsed: 'Last used',
    never: 'never',
    needName: 'Add a name so you can recognize this key.',
    dbError: 'The database is not yet connected.',
    authRequired: 'Sign in to create keys.',
    tooMany: 'You already have the maximum number of active keys. Revoke one before creating another.',
    fixedScopes: 'Includes permissions to submit data, search, dedupe, and sync processed records.',
    limits: 'Initial limits: 30/min and 1,000/day. The team can adjust them if your integration needs more capacity.',
    useTitle: 'Quick use',
    useCopy: 'Use the key as a Bearer token from your server. Do not publish it in browser code.',
  },
} as const;

const API = 'https://respuestave.org/api/v1';
const inputCls = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function genKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'rvk_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function asKeys(value: unknown): DeveloperKey[] {
  const root = value as { ok?: boolean; items?: DeveloperKey[] } | null;
  return root?.ok && Array.isArray(root.items) ? root.items : [];
}

export function DeveloperApiKeyManager({ supabaseConfig }: { supabaseConfig?: SupabasePublicConfig | null }) {
  const locale = useLocale();
  const s = STR[locale];
  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      setMsg(s.dbError);
      setLoading(false);
      return;
    }
    const { data, error } = await sb.rpc('list_my_api_keys');
    if (error) setMsg(error.message);
    else setKeys(asKeys(data));
    setLoading(false);
  }, [s.dbError, supabaseConfig]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function issue() {
    setMsg('');
    if (!name.trim()) {
      setMsg(s.needName);
      return;
    }
    const sb = getSupabaseBrowser(supabaseConfig);
    if (!sb) {
      setMsg(s.dbError);
      return;
    }
    setBusy('issue');
    const key = genKey();
    const hash = await sha256Hex(key);
    const { data, error } = await sb.rpc('issue_developer_api_key', {
      p_name: name.trim(),
      p_key_hash: hash,
      p_key_prefix: key.slice(0, 12),
      p_notes: notes.trim() || null,
    });
    setBusy(null);
    const r = data as { ok?: boolean; error?: string } | null;
    if (error) {
      setMsg(error.message);
      return;
    }
    if (!r?.ok) {
      setMsg(r?.error === 'auth_required' ? s.authRequired : r?.error === 'too_many_keys' ? s.tooMany : (r?.error ?? 'error'));
      return;
    }
    setPlaintext(key);
    setCopied(false);
    setName('');
    setNotes('');
    await load();
  }

  async function revoke(id: string) {
    setBusy(id);
    const sb = getSupabaseBrowser(supabaseConfig);
    if (sb) await sb.rpc('revoke_my_api_key', { p_id: id });
    setBusy(null);
    await load();
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    const sb = getSupabaseBrowser(supabaseConfig);
    if (sb) await sb.rpc('set_my_api_key_enabled', { p_id: id, p_enabled: enabled });
    setBusy(null);
    await load();
  }

  const sample = `curl -s ${API}/public-intake \\
  -H "Authorization: Bearer $RVK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"my-site","kind":"mixed","data":[{"note":"Hospital needs water"}]}'`;

  return (
    <div className="mt-6 space-y-8">
      {plaintext && (
        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{s.showOnce}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-emerald-300">{plaintext}</code>
            <button onClick={() => { navigator.clipboard?.writeText(plaintext); setCopied(true); }}
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">{copied ? s.copied : s.copy}</button>
          </div>
          <button onClick={() => setPlaintext(null)} className="mt-3 text-xs font-medium text-emerald-800 underline dark:text-emerald-300">{s.dismiss}</button>
        </div>
      )}

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-base font-semibold">{s.issueTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{s.fixedScopes}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{s.limits}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.name}</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.notes}</label>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={s.notesPlaceholder} />
          </div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <button disabled={busy === 'issue'} onClick={issue} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {busy === 'issue' ? s.issuing : s.issue}
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-zinc-50 p-4 ring-1 ring-black/10 dark:bg-zinc-900/50 dark:ring-white/10">
        <h2 className="text-base font-semibold">{s.useTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{s.useCopy}</p>
        <code className="mt-3 block overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100 dark:bg-black/60">
          <pre className="whitespace-pre">{sample}</pre>
        </code>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">{s.existing}</h2>
        {loading ? <p className="text-sm text-zinc-500">{s.loading}</p>
          : keys.length === 0 ? <p className="text-sm text-zinc-500">{s.none}</p> : (
            <ul className="space-y-3">
              {keys.map((k) => {
                const revoked = !!k.revokedAt;
                return (
                  <li key={k.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{k.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">{k.keyPrefix}...</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${revoked ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : k.enabled ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700'}`}>
                        {revoked ? s.revoked : k.enabled ? s.active : s.disabled}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>{k.scopes.join(', ')}</span>
                      <span>{k.rateLimitPerMin}/min</span>
                      <span>{k.rateLimitPerDay}/day</span>
                      <span>{s.lastUsed}: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString(locale) : s.never}</span>
                    </div>
                    {!revoked && (
                      <div className="mt-3 flex gap-2">
                        <button disabled={busy === k.id} onClick={() => toggle(k.id, !k.enabled)} className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10">{k.enabled ? s.disable : s.enable}</button>
                        <button disabled={busy === k.id} onClick={() => { if (confirm(s.confirmRevoke)) revoke(k.id); }} className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30">{s.revoke}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
