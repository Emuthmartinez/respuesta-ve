'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SKILL_CATEGORIES, HIGH_STAKES } from '@/lib/skills';
import { ESTADOS } from '@/lib/responder';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const field = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const STR = {
  es: {
    loading: 'Cargando…',
    heading: 'Ofrezco ayuda',
    subtext: 'Registra tu habilidad. Tu contacto es privado; un coordinador te conecta con quien lo necesita.',
    skillLabel: '¿Qué puedes ofrecer?',
    highStakesNote: 'Esta habilidad requiere verificación de credenciales antes de aparecer públicamente.',
    detailLabel: 'Detalle (sin teléfono)',
    detailPlaceholder: 'Ej: ingeniero estructural CIV, 10 años de experiencia',
    baseStateLabel: 'Estado base',
    selectPlaceholder: 'Seleccionar…',
    languagesLabel: 'Idiomas (separar por comas)',
    languagesPlaceholder: 'español, inglés',
    operatingStatesLabel: 'Estados donde puedes operar',
    credentialLabel: 'Credencial (foto)',
    contactLabel: 'Contacto privado (solo coordinadores)',
    contactPlaceholder: 'Teléfono o WhatsApp — no público',
    submit: 'Registrar mi oferta',
    submitting: 'Enviando…',
    successHeading: '¡Gracias por ofrecer ayuda!',
    successTextHighStakes: 'Tu oferta queda en revisión: un coordinador verificará tu credencial antes de publicarla y conectarte.',
    successTextNormal: 'Tu oferta queda en revisión por un coordinador antes de publicarse.',
    backToExchange: 'Volver',
    myOffers: 'Ver mis ofertas',
    errInvalidSession: 'Sesión no válida.',
    errContactInText: 'No incluyas números de teléfono en la descripción — usa el campo de contacto privado.',
    errGeneric: 'No se pudo enviar.',
    errUpload: 'Error al enviar.',
  },
  en: {
    loading: 'Loading…',
    heading: "I'm offering help",
    subtext: 'Register your skill. Your contact is private; a coordinator connects you with whoever needs it.',
    skillLabel: 'What can you offer?',
    highStakesNote: 'This skill requires credential verification before appearing publicly.',
    detailLabel: 'Details (no phone number)',
    detailPlaceholder: 'E.g.: structural engineer CIV, 10 years of experience',
    baseStateLabel: 'Home state',
    selectPlaceholder: 'Select…',
    languagesLabel: 'Languages (comma-separated)',
    languagesPlaceholder: 'Spanish, English',
    operatingStatesLabel: 'States where you can operate',
    credentialLabel: 'Credential (photo)',
    contactLabel: 'Private contact (coordinators only)',
    contactPlaceholder: 'Phone or WhatsApp — not public',
    submit: 'Register my offer',
    submitting: 'Submitting…',
    successHeading: 'Thank you for offering help!',
    successTextHighStakes: 'Your offer is under review: a coordinator will verify your credential before publishing it and connecting you.',
    successTextNormal: 'Your offer is under review by a coordinator before being published.',
    backToExchange: 'Back',
    myOffers: 'View my offers',
    errInvalidSession: 'Invalid session.',
    errContactInText: 'Do not include phone numbers in the description — use the private contact field.',
    errGeneric: 'Could not submit.',
    errUpload: 'Error submitting.',
  },
} as const;

export default function OfrecerPage() {
  const locale = useLocale();
  const s = STR[locale];

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
        router.replace('/voluntarios/acceder?next=' + encodeURIComponent('/intercambio/ofrecer'));
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
      setErr(s.errInvalidSession);
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
          languages: languages ? languages.split(',').map((ls) => ls.trim()).filter(Boolean) : null,
          contact: contact || null,
          credential_doc_path: credPath,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(
          json.error === 'contact_in_text'
            ? s.errContactInText
            : json.error || s.errGeneric,
        );
        return;
      }
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : s.errUpload);
    } finally {
      setSaving(false);
    }
  }

  if (checking) return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-zinc-500">{s.loading}</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{s.successHeading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {HIGH_STAKES.has(skill) ? s.successTextHighStakes : s.successTextNormal}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/intercambio" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">{s.backToExchange}</Link>
          <Link href="/intercambio/mis-ofertas" className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20">{s.myOffers}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{s.skillLabel}</label>
          <select className={field} value={skill} onChange={(e) => setSkill(e.target.value)}>
            {SKILL_CATEGORIES.map((sc) => <option key={sc.value} value={sc.value}>{tr(sc.label, locale)}</option>)}
          </select>
          {HIGH_STAKES.has(skill) && (
            <p className="mt-1 text-xs text-amber-600">
              {s.highStakesNote}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.detailLabel}</label>
          <textarea className={field} rows={2} value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder={s.detailPlaceholder} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.baseStateLabel}</label>
            <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">{s.selectPlaceholder}</option>
              {ESTADOS.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.languagesLabel}</label>
            <input className={field} value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder={s.languagesPlaceholder} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.operatingStatesLabel}</label>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((st) => (
              <button key={st} type="button" onClick={() => toggle(st)}
                className={`rounded-full border px-3 py-1 text-xs ${operating.includes(st) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'}`}>
                {st}
              </button>
            ))}
          </div>
        </div>
        {HIGH_STAKES.has(skill) && (
          <div>
            <label className="mb-1 block text-sm font-medium">{s.credentialLabel}</label>
            <input className={field} type="file" accept="image/*,application/pdf" onChange={(e) => setCredFile(e.target.files?.[0] ?? null)} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">{s.contactLabel}</label>
          <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={s.contactPlaceholder} />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {saving ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
