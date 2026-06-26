'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SKILL_CATEGORIES, URGENCY_OPTS, HIGH_STAKES } from '@/lib/skills';
import { ESTADOS } from '@/lib/responder';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const field = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const STR = {
  es: {
    heading: 'Necesito ayuda',
    subtext: 'Tu información personal no será pública. El contacto es mediado por un coordinador.',
    subTextStrong: 'no será pública',
    skillLabel: '¿Qué ayuda necesitas?',
    highStakesNote: 'Esta categoría requiere iniciar sesión por seguridad.',
    urgencyLabel: 'Urgencia',
    estadoLabel: 'Estado',
    selectPlaceholder: 'Seleccionar…',
    municipioLabel: 'Municipio / sector',
    peopleLabel: 'Personas afectadas',
    childrenLabel: 'Hay menores de edad en la familia',
    descriptionLabel: 'Describe la situación',
    descriptionPlaceholder: 'No incluyas tu número de teléfono aquí — esto puede ser visible.',
    contactLabel: 'Contacto privado (solo coordinadores)',
    contactPlaceholder: 'Teléfono o WhatsApp — no se muestra públicamente',
    submit: 'Enviar solicitud',
    submitting: 'Enviando…',
    successHeading: 'Solicitud enviada',
    successText: 'Un coordinador revisará tu solicitud y te conectará de forma privada con un voluntario verificado. Guarda este enlace para ver el estado:',
    backToExchange: 'Volver',
    errAuthRequired: 'Para pedir ayuda en esta categoría debes iniciar sesión (por seguridad). Ingresa en Voluntarios → Acceder.',
    errContactInText: 'No incluyas números de teléfono en la descripción — usa el campo de contacto privado.',
    errRateLimited: 'Has enviado demasiadas solicitudes. Intenta más tarde.',
    errGeneric: 'No se pudo enviar.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'I need help',
    subtext: 'Your personal information will not be public. Contact is mediated by a coordinator.',
    subTextStrong: 'will not be public',
    skillLabel: 'What help do you need?',
    highStakesNote: 'This category requires signing in for safety.',
    urgencyLabel: 'Urgency',
    estadoLabel: 'State',
    selectPlaceholder: 'Select…',
    municipioLabel: 'Municipality / sector',
    peopleLabel: 'People affected',
    childrenLabel: 'There are minors in the family',
    descriptionLabel: 'Describe the situation',
    descriptionPlaceholder: 'Do not include your phone number here — this may be visible.',
    contactLabel: 'Private contact (coordinators only)',
    contactPlaceholder: 'Phone or WhatsApp — not shown publicly',
    submit: 'Submit request',
    submitting: 'Submitting…',
    successHeading: 'Request submitted',
    successText: 'A coordinator will review your request and privately connect you with a verified volunteer. Save this link to check your status:',
    backToExchange: 'Back',
    errAuthRequired: 'To request help in this category you must sign in (for safety). Go to Volunteers → Sign in.',
    errContactInText: 'Do not include phone numbers in the description — use the private contact field.',
    errRateLimited: 'You have submitted too many requests. Try again later.',
    errGeneric: 'Could not submit.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function NecesitarPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [skill, setSkill] = useState('volunteer_general');
  const [urgency, setUrgency] = useState('normal');
  const [estado, setEstado] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [children, setChildren] = useState(false);
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const res = await fetch('/api/skills/need', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_needed: skill,
          urgency,
          estado: estado || null,
          municipio: municipio || null,
          num_people: numPeople ? Number(numPeople) : null,
          has_minor_children: children,
          description: description || null,
          contact: contact || null,
        }),
      });
      const json = await res.json();
      if (res.status === 401 || json.error === 'auth_required') {
        setErr(s.errAuthRequired);
        return;
      }
      if (!res.ok || !json.ok) {
        setErr(
          json.error === 'contact_in_text'
            ? s.errContactInText
            : json.error === 'rate_limited'
              ? s.errRateLimited
              : json.error || s.errGeneric,
        );
        return;
      }
      setToken(json.token);
    } catch {
      setErr(s.errNetwork);
    } finally {
      setSaving(false);
    }
  }

  if (token) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{s.successHeading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {s.successText}
        </p>
        <Link href={`/ayuda/${token}`} className="mt-3 inline-block break-all rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 underline dark:bg-zinc-800 dark:text-zinc-300">
          /ayuda/{token.slice(0, 16)}…
        </Link>
        <div className="mt-6">
          <Link href="/intercambio" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">{s.backToExchange}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tu información personal <strong>{s.subTextStrong}</strong>. {locale === 'es' ? 'El contacto es mediado por un coordinador.' : 'Contact is mediated by a coordinator.'}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.skillLabel}</label>
            <select className={field} value={skill} onChange={(e) => setSkill(e.target.value)}>
              {SKILL_CATEGORIES.map((sc) => <option key={sc.value} value={sc.value}>{tr(sc.label, locale)}</option>)}
            </select>
            {HIGH_STAKES.has(skill) && (
              <p className="mt-1 text-xs text-amber-600">{s.highStakesNote}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.urgencyLabel}</label>
            <select className={field} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              {URGENCY_OPTS.map((u) => <option key={u.value} value={u.value}>{tr(u.label, locale)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.estadoLabel}</label>
            <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">{s.selectPlaceholder}</option>
              {ESTADOS.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.municipioLabel}</label>
            <input className={field} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.peopleLabel}</label>
            <input className={field} type="number" min={1} value={numPeople} onChange={(e) => setNumPeople(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={children} onChange={(e) => setChildren(e.target.checked)} />
          {s.childrenLabel}
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.descriptionLabel}</label>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={s.descriptionPlaceholder} />
        </div>
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
