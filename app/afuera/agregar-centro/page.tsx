'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DONATION_ITEMS, donationItemLabel } from '@/lib/orgs';
import { useLocale } from '@/lib/locale-context';
import { AddressSearch } from '@/components/AddressSearch';
import type { PickedLocation } from '@/components/AddressSearch';
import { ManageLink } from '@/components/ManageLink';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const STR = {
  es: {
    heading: 'Agregar un centro de acopio',
    subtext: 'Comparte un centro de recolección que conozcas. Lo verificamos antes de publicarlo.',
    nameLabel: 'Nombre del centro *',
    cityLabel: 'Ciudad',
    stateProvinceLabel: 'Estado / Provincia',
    countryLabel: 'País',
    countryPlaceholder: 'VE, US, ES…',
    addressLabel: 'Dirección',
    addressSearchPlaceholder: 'Busca la dirección del centro…',
    addressFallbackPlaceholder: 'Dirección completa',
    coordsCaptured: (lat: number, lng: number) => `Coordenadas capturadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    donationItemsLabel: '¿Qué necesitan / reciben?',
    contactLabel: 'Contacto público',
    contactPlaceholder: 'Teléfono o nombre de contacto',
    socialLabel: 'Red social',
    socialPlaceholder: '@instagram',
    hoursLabel: 'Horario',
    hoursPlaceholder: 'Lun-Vie 8am-5pm',
    notesLabel: 'Notas / necesidades urgentes',
    monetaryLabel: 'Enlace para donar dinero (opcional)',
    monetaryPlaceholder: 'https://…',
    submit: 'Enviar centro',
    submitting: 'Enviando…',
    successHeading: 'Centro enviado',
    successText: 'Gracias. Un coordinador lo verifica antes de publicarlo, para proteger a los donantes de información falsa.',
    backToDonations: 'Volver a donaciones',
    errNameRequired: 'Indica el nombre del centro.',
    errRateLimited: 'Has enviado demasiados centros. Intenta más tarde.',
    errGeneric: 'No se pudo enviar.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'Add a collection center',
    subtext: 'Share a drop-off center you know about. We verify it before publishing.',
    nameLabel: 'Center name *',
    cityLabel: 'City',
    stateProvinceLabel: 'State / Province',
    countryLabel: 'Country',
    countryPlaceholder: 'VE, US, ES…',
    addressLabel: 'Address',
    addressSearchPlaceholder: 'Search for the center address…',
    addressFallbackPlaceholder: 'Full address',
    coordsCaptured: (lat: number, lng: number) => `Coordinates captured: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    donationItemsLabel: "What's needed / accepted?",
    contactLabel: 'Public contact',
    contactPlaceholder: 'Phone or contact name',
    socialLabel: 'Social media',
    socialPlaceholder: '@instagram',
    hoursLabel: 'Hours',
    hoursPlaceholder: 'Mon–Fri 8am–5pm',
    notesLabel: 'Notes / urgent needs',
    monetaryLabel: 'Link to donate money (optional)',
    monetaryPlaceholder: 'https://…',
    submit: 'Submit center',
    submitting: 'Submitting…',
    successHeading: 'Center submitted',
    successText: 'Thank you. A coordinator will verify it before publishing, to protect donors from false information.',
    backToDonations: 'Back to donations',
    errNameRequired: 'Please enter the center name.',
    errRateLimited: 'You have submitted too many centers. Try again later.',
    errGeneric: 'Could not submit.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function AgregarCentroPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [contact, setContact] = useState('');
  const [social, setSocial] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<string[]>([]);
  const [needs, setNeeds] = useState('');
  const [monetaryUrl, setMonetaryUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');

  function toggle(item: string) {
    setPriority((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]));
  }

  function handleAddressPick(loc: PickedLocation) {
    setAddress(loc.label);
    setLat(loc.lat);
    setLng(loc.lng);
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (name.trim().length < 2) {
      setErr(s.errNameRequired);
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
          lat: lat ?? null,
          lng: lng ?? null,
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
            ? s.errRateLimited
            : json.error || s.errGeneric,
        );
        return;
      }
      if (json.token) setToken(json.token);
      setStatus('success');
    } catch {
      setStatus('error');
      setErr(s.errNetwork);
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{s.successHeading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {s.successText}
        </p>
        {token && <ManageLink token={token} />}
        <Link href="/afuera" className="mt-6 inline-block rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
          {s.backToDonations}
        </Link>
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
          <label className="mb-1 block text-sm font-medium">{s.nameLabel}</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.cityLabel}</label>
            <input className={field} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.stateProvinceLabel}</label>
            <input className={field} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.countryLabel}</label>
            <input className={field} value={country} onChange={(e) => setCountry(e.target.value)} placeholder={s.countryPlaceholder} />
          </div>
        </div>

        {/* Address with geocoding autocomplete */}
        <div>
          <label className="mb-1 block text-sm font-medium">{s.addressLabel}</label>
          <AddressSearch
            locale={locale}
            onPick={handleAddressPick}
            placeholder={s.addressSearchPlaceholder}
          />
          {/* Fallback manual input shown after a pick or when user wants to type freely */}
          {address && (
            <input
              className={`${field} mt-2`}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                // Clear captured coords if user edits manually
                setLat(null);
                setLng(null);
              }}
              placeholder={s.addressFallbackPlaceholder}
            />
          )}
          {lat !== null && lng !== null && (
            <p className="mt-1 text-xs text-zinc-500">
              {s.coordsCaptured(lat, lng)}
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">{s.donationItemsLabel}</label>
          <div className="flex flex-wrap gap-2">
            {DONATION_ITEMS.map((it) => (
              <button key={it.value} type="button" onClick={() => toggle(it.value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  priority.includes(it.value) ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-black/15 dark:border-white/15'
                }`}>
                {donationItemLabel(it.value, 'es')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.contactLabel}</label>
            <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={s.contactPlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.socialLabel}</label>
            <input className={field} value={social} onChange={(e) => setSocial(e.target.value)} placeholder={s.socialPlaceholder} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.hoursLabel}</label>
          <input className={field} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={s.hoursPlaceholder} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.notesLabel}</label>
          <textarea className={field} rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{s.monetaryLabel}</label>
          <input className={field} value={monetaryUrl} onChange={(e) => setMonetaryUrl(e.target.value)} placeholder={s.monetaryPlaceholder} />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={status === 'submitting'}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {status === 'submitting' ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
