'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SKILL_CATEGORIES, URGENCY_OPTS, HIGH_STAKES } from '@/lib/skills';
import { ESTADOS } from '@/lib/responder';

const field = 'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export default function NecesitarPage() {
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
        setErr('Para pedir ayuda en esta categoría debes iniciar sesión (por seguridad). Ingresa en Voluntarios → Acceder.');
        return;
      }
      if (!res.ok || !json.ok) {
        setErr(
          json.error === 'contact_in_text'
            ? 'No incluyas números de teléfono en la descripción — usa el campo de contacto privado.'
            : json.error === 'rate_limited'
              ? 'Has enviado demasiadas solicitudes. Intenta más tarde.'
              : json.error || 'No se pudo enviar.',
        );
        return;
      }
      setToken(json.token);
    } catch {
      setErr('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (token) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Solicitud enviada</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Un coordinador revisará tu solicitud y te conectará de forma privada con
          un voluntario verificado. Guarda este enlace para ver el estado:
        </p>
        <Link href={`/ayuda/${token}`} className="mt-3 inline-block break-all rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 underline dark:bg-zinc-800 dark:text-zinc-300">
          /ayuda/{token.slice(0, 16)}…
        </Link>
        <div className="mt-6">
          <Link href="/intercambio" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Necesito ayuda</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tu información personal <strong>no será pública</strong>. El contacto es
        mediado por un coordinador.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">¿Qué ayuda necesitas?</label>
            <select className={field} value={skill} onChange={(e) => setSkill(e.target.value)}>
              {SKILL_CATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {HIGH_STAKES.has(skill) && (
              <p className="mt-1 text-xs text-amber-600">Esta categoría requiere iniciar sesión por seguridad.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Urgencia</label>
            <select className={field} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              {URGENCY_OPTS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Estado</label>
            <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Seleccionar…</option>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Municipio / sector</label>
            <input className={field} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Personas afectadas</label>
            <input className={field} type="number" min={1} value={numPeople} onChange={(e) => setNumPeople(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={children} onChange={(e) => setChildren(e.target.checked)} />
          Hay menores de edad en la familia
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium">Describe la situación</label>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="No incluyas tu número de teléfono aquí — esto puede ser visible." />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Contacto privado (solo coordinadores)</label>
          <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Teléfono o WhatsApp — no se muestra públicamente" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {saving ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}
