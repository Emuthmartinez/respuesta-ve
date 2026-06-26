'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SKILL_CATEGORIES, HIGH_STAKES } from '@/lib/skills';
import { ESTADOS } from '@/lib/responder';

const field = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export default function OfrecerPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [skill, setSkill] = useState('volunteer_general');
  const [detail, setDetail] = useState('');
  const [estado, setEstado] = useState('');
  const [operating, setOperating] = useState<string[]>([]);
  const [languages, setLanguages] = useState('');
  const [contact, setContact] = useState('');
  const [credFile, setCredFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setChecking(false);
      return;
    }
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/voluntarios/acceder');
        return;
      }
      setUid(data.user.id);
      setChecking(false);
    });
  }, [router]);

  function toggle(e: string) {
    setOperating((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]));
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    const sb = getSupabaseBrowser();
    if (!sb || !uid) {
      setErr('Sesión no válida.');
      return;
    }
    setSaving(true);
    try {
      let credPath: string | null = null;
      if (credFile) {
        const ext = credFile.name.split('.').pop() || 'jpg';
        const path = `${uid}/credential-${Date.now()}.${ext}`;
        const up = await sb.storage.from('skill-docs').upload(path, credFile, { upsert: true });
        if (up.error) throw new Error(up.error.message);
        credPath = path;
      }
      const res = await fetch('/api/skills/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_category: skill,
          skill_detail: detail || null,
          estado: estado || null,
          operating_estados: operating.length ? operating : null,
          languages: languages ? languages.split(',').map((s) => s.trim()).filter(Boolean) : null,
          contact: contact || null,
          credential_doc_path: credPath,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(
          json.error === 'contact_in_text'
            ? 'No incluyas números de teléfono en la descripción — usa el campo de contacto privado.'
            : json.error || 'No se pudo enviar.',
        );
        return;
      }
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Error al enviar.');
    } finally {
      setSaving(false);
    }
  }

  if (checking) return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-zinc-500">Cargando…</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">¡Gracias por ofrecer ayuda!</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {HIGH_STAKES.has(skill)
            ? 'Tu oferta queda en revisión: un coordinador verificará tu credencial antes de publicarla y conectarte.'
            : 'Tu oferta queda en revisión por un coordinador antes de publicarse.'}
        </p>
        <Link href="/intercambio" className="mt-6 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">Volver</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Ofrezco ayuda</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Registra tu habilidad. Tu contacto es privado; un coordinador te conecta
        con quien lo necesita.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">¿Qué puedes ofrecer?</label>
          <select className={field} value={skill} onChange={(e) => setSkill(e.target.value)}>
            {SKILL_CATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {HIGH_STAKES.has(skill) && (
            <p className="mt-1 text-xs text-amber-600">
              Esta habilidad requiere verificación de credenciales antes de aparecer públicamente.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Detalle (sin teléfono)</label>
          <textarea className={field} rows={2} value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder="Ej: ingeniero estructural CIV, 10 años de experiencia" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Estado base</label>
            <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Seleccionar…</option>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Idiomas (separar por comas)</label>
            <input className={field} value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="español, inglés" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Estados donde puedes operar</label>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((s) => (
              <button key={s} type="button" onClick={() => toggle(s)}
                className={`rounded-full border px-3 py-1 text-xs ${operating.includes(s) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {HIGH_STAKES.has(skill) && (
          <div>
            <label className="mb-1 block text-sm font-medium">Credencial (foto)</label>
            <input className={field} type="file" accept="image/*,application/pdf" onChange={(e) => setCredFile(e.target.files?.[0] ?? null)} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Contacto privado (solo coordinadores)</label>
          <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Teléfono o WhatsApp — no público" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {saving ? 'Enviando…' : 'Registrar mi oferta'}
        </button>
      </form>
    </div>
  );
}
