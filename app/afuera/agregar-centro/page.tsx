'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DONATION_ITEMS } from '@/lib/orgs';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function AgregarCentroPage() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [social, setSocial] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<string[]>([]);
  const [needs, setNeeds] = useState('');
  const [monetaryUrl, setMonetaryUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');

  function toggle(item: string) {
    setPriority((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]));
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (name.trim().length < 2) {
      setErr('Indica el nombre del centro.');
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/donar/centros/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          city: city || null,
          state: state || null,
          country_code: country || null,
          address: address || null,
          contact_public: contact || null,
          social: social || null,
          hours: hours || null,
          priority: priority.length ? priority : null,
          accepts: priority.length ? priority : null,
          needs: needs || null,
          accepts_monetary: !!monetaryUrl,
          monetary_url: monetaryUrl || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus('error');
        setErr(
          json.error === 'rate_limited'
            ? 'Has enviado demasiados centros. Intenta más tarde.'
            : json.error || 'No se pudo enviar.',
        );
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErr('Error de red. Intenta de nuevo.');
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Centro enviado</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Gracias. Un coordinador lo verifica antes de publicarlo, para proteger
          a los donantes de información falsa.
        </p>
        <Link href="/afuera" className="mt-6 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
          Volver a donaciones
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Agregar un centro de acopio</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Comparte un centro de recolección que conozcas. Lo verificamos antes de
        publicarlo.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nombre del centro *</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Ciudad</label>
            <input className={field} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Estado / Provincia</label>
            <input className={field} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">País</label>
            <input className={field} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="VE, US, ES…" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Dirección</label>
          <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">¿Qué necesitan / reciben?</label>
          <div className="flex flex-wrap gap-2">
            {DONATION_ITEMS.map((it) => (
              <button key={it.value} type="button" onClick={() => toggle(it.value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  priority.includes(it.value) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'
                }`}>
                {it.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Contacto público</label>
            <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Teléfono o nombre de contacto" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Red social</label>
            <input className={field} value={social} onChange={(e) => setSocial(e.target.value)} placeholder="@instagram" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Horario</label>
          <input className={field} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Lun-Vie 8am-5pm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Notas / necesidades urgentes</label>
          <textarea className={field} rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Enlace para donar dinero (opcional)</label>
          <input className={field} value={monetaryUrl} onChange={(e) => setMonetaryUrl(e.target.value)} placeholder="https://…" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={status === 'submitting'}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {status === 'submitting' ? 'Enviando…' : 'Enviar centro'}
        </button>
      </form>
    </div>
  );
}
