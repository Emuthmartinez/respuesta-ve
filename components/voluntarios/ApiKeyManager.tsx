'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';

interface Key {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_min: number;
  rate_limit_per_day: number;
  ingest_source: string;
  owner_email: string | null;
  issued_via: string | null;
  enabled: boolean;
  revoked_at: string | null;
  notes: string | null;
  created_at: string;
  last_used_at: string | null;
}

const ALL_SCOPES = ['score', 'match', 'search', 'ingest'] as const;
const SOURCES = ['other', 'venezuelatebusca', 'desaparecidosterremotovenezuela', 'desaparecidosvenezuela', 'pfif_feed'] as const;
const KEY_SELECT = 'id,name,key_prefix,scopes,rate_limit_per_min,rate_limit_per_day,ingest_source,owner_email,issued_via,enabled,revoked_at,notes,created_at,last_used_at';

const STR = {
  es: {
    issueTitle: 'Emitir nueva clave', name: 'Nombre (socio / integración)', scopes: 'Permisos',
    perMin: 'Límite/min', perDay: 'Límite/día', source: 'Atribución de fuente (al ingresar)',
    notes: 'Notas (opcional)', issue: 'Emitir clave', issuing: 'Emitiendo…',
    showOnce: 'Copia esta clave ahora — no se puede recuperar, solo revocar.', copy: 'Copiar', copied: '¡Copiado!', dismiss: 'Entendido, la guardé',
    existing: 'Claves existentes', none: 'No hay claves todavía.', loading: 'Cargando…',
    revoked: 'Revocada', disabled: 'Desactivada', active: 'Activa', revoke: 'Revocar', disable: 'Desactivar', enable: 'Activar',
    lastUsed: 'Último uso', never: 'nunca', confirmRevoke: '¿Revocar esta clave de forma permanente?',
    owner: 'Cuenta',
    issuedVia: 'Origen',
    noPerm: 'Sin permiso de coordinador.', needName: 'Pon un nombre.', needScope: 'Elige al menos un permiso.',
  },
  en: {
    issueTitle: 'Issue a new key', name: 'Name (partner / integration)', scopes: 'Scopes',
    perMin: 'Limit/min', perDay: 'Limit/day', source: 'Source attribution (on ingest)',
    notes: 'Notes (optional)', issue: 'Issue key', issuing: 'Issuing…',
    showOnce: 'Copy this key now — it cannot be recovered, only revoked.', copy: 'Copy', copied: 'Copied!', dismiss: 'Got it, I saved it',
    existing: 'Existing keys', none: 'No keys yet.', loading: 'Loading…',
    revoked: 'Revoked', disabled: 'Disabled', active: 'Active', revoke: 'Revoke', disable: 'Disable', enable: 'Enable',
    lastUsed: 'Last used', never: 'never', confirmRevoke: 'Permanently revoke this key?',
    owner: 'Account',
    issuedVia: 'Origin',
    noPerm: 'Coordinator access required.', needName: 'Enter a name.', needScope: 'Pick at least one scope.',
  },
} as const;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function genKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'rvk_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const inputCls = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export function ApiKeyManager() {
  const locale = useLocale();
  const s = STR[locale];
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // form
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['score', 'match', 'search']);
  const [perMin, setPerMin] = useState(60);
  const [perDay, setPerDay] = useState(5000);
  const [source, setSource] = useState<string>('other');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) { setLoading(false); return; }
    const { data } = await sb.from('partner_api_keys').select(KEY_SELECT).order('created_at', { ascending: false });
    setKeys((data as Key[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function issue() {
    setMsg('');
    if (!name.trim()) { setMsg(s.needName); return; }
    if (scopes.length === 0) { setMsg(s.needScope); return; }
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy('issue');
    const key = genKey();
    const hash = await sha256Hex(key);
    const { data, error } = await sb.rpc('issue_api_key', {
      p_name: name.trim(), p_key_hash: hash, p_key_prefix: key.slice(0, 12),
      p_scopes: scopes, p_rate_per_min: perMin, p_rate_per_day: perDay,
      p_notes: notes.trim() || null, p_ingest_source: source,
    });
    setBusy(null);
    const r = data as { ok?: boolean; error?: string } | null;
    if (error) { setMsg(error.message); return; }
    if (!r?.ok) { setMsg(r?.error === 'not_coordinator' ? s.noPerm : (r?.error ?? 'error')); return; }
    setPlaintext(key); setCopied(false); setName(''); setNotes('');
    await load();
  }

  async function revoke(id: string) {
    setBusy(id);
    const sb = getSupabaseBrowser();
    if (sb) await sb.rpc('revoke_api_key', { p_id: id });
    setBusy(null);
    await load();
  }
  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    const sb = getSupabaseBrowser();
    if (sb) await sb.rpc('set_api_key_enabled', { p_id: id, p_enabled: enabled });
    setBusy(null);
    await load();
  }
  const toggleScope = (sc: string) => setScopes((p) => p.includes(sc) ? p.filter((x) => x !== sc) : [...p, sc]);

  return (
    <div className="mt-6 space-y-8">
      {/* plaintext reveal */}
      {plaintext && (
        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">🔑 {s.showOnce}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-emerald-300">{plaintext}</code>
            <button onClick={() => { navigator.clipboard?.writeText(plaintext); setCopied(true); }}
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">{copied ? s.copied : s.copy}</button>
          </div>
          <button onClick={() => setPlaintext(null)} className="mt-3 text-xs font-medium text-emerald-800 underline dark:text-emerald-300">{s.dismiss}</button>
        </div>
      )}

      {/* issue form */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-base font-semibold">{s.issueTitle}</h2>
        <div className="mt-3 space-y-3">
          <div><label className="mb-1 block text-sm font-medium">{s.name}</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.scopes}</label>
            <div className="flex flex-wrap gap-3">
              {ALL_SCOPES.map((sc) => (
                <label key={sc} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={scopes.includes(sc)} onChange={() => toggleScope(sc)} />{sc}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm font-medium">{s.perMin}</label><input type="number" className={inputCls} value={perMin} onChange={(e) => setPerMin(Math.max(1, Number(e.target.value)))} /></div>
            <div><label className="mb-1 block text-sm font-medium">{s.perDay}</label><input type="number" className={inputCls} value={perDay} onChange={(e) => setPerDay(Math.max(1, Number(e.target.value)))} /></div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.source}</label>
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((src) => <option key={src} value={src}>{src}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-sm font-medium">{s.notes}</label><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <button disabled={busy === 'issue'} onClick={issue} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy === 'issue' ? s.issuing : s.issue}</button>
        </div>
      </section>

      {/* existing keys */}
      <section>
        <h2 className="mb-3 text-base font-semibold">{s.existing}</h2>
        {loading ? <p className="text-sm text-zinc-500">{s.loading}</p>
          : keys.length === 0 ? <p className="text-sm text-zinc-500">{s.none}</p> : (
            <ul className="space-y-3">
              {keys.map((k) => {
                const revoked = !!k.revoked_at;
                return (
                  <li key={k.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{k.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">{k.key_prefix}…</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${revoked ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : k.enabled ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700'}`}>
                        {revoked ? s.revoked : k.enabled ? s.active : s.disabled}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>{k.scopes.join(', ')}</span>
                      <span>· {k.rate_limit_per_min}/min · {k.rate_limit_per_day}/día</span>
                      <span>· {k.ingest_source}</span>
                      {k.issued_via && <span>· {s.issuedVia}: {k.issued_via}</span>}
                      {k.owner_email && <span>· {s.owner}: {k.owner_email}</span>}
                      <span>· {s.lastUsed}: {k.last_used_at ? new Date(k.last_used_at).toLocaleString(locale) : s.never}</span>
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
