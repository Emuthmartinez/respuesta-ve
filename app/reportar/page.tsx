'use client';

import { useState } from 'react';
import Link from 'next/link';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, REGION_CENTER } from '@/lib/mapStyle';
import {
  DAMAGE_LEVELS, PEOPLE_STATUS, ESTADOS,
  type DamageLevel, type PeopleStatus,
} from '@/lib/taxonomy';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';
import { reportSchema } from '@/lib/reportSchema';
import { Disclaimer } from '@/components/Disclaimer';

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'backend-missing';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const STR = {
  es: {
    heading: 'Reportar un edificio dañado',
    subtext: 'Puedes reportar de forma anónima. Si hay personas en peligro, indícalo para priorizar.',
    locationLabel: 'Ubicación del edificio',
    useMyLocation: 'Usar mi ubicación',
    marked: (lat: number, lng: number) => `Marcado: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    tapToMark: 'Toca el mapa para marcar el edificio.',
    damageLevel: 'Nivel de daño',
    peopleLabel: '¿Hay personas?',
    peopleCount: 'Personas estimadas (opcional)',
    estadoLabel: 'Estado',
    selectPlaceholder: 'Seleccionar…',
    municipioLabel: 'Municipio',
    parroquiaLabel: 'Parroquia / sector',
    addressLabel: 'Dirección (opcional)',
    descriptionLabel: 'Descripción (opcional)',
    descriptionPlaceholder: 'Ej: grietas en columnas del primer piso, vecinos evacuados…',
    contactLabel: 'Contacto (privado, opcional)',
    contactPlaceholder: 'Teléfono o correo — solo visible para responders',
    backendMissing: 'El formulario es válido, pero la base de datos aún no está conectada. Conéctala (Supabase) para guardar reportes.',
    submit: 'Enviar reporte',
    submitting: 'Enviando…',
    successHeading: 'Reporte enviado',
    successText: 'Gracias. Tu reporte será revisado antes de aparecer en el mapa público (con ubicación aproximada), para evitar información falsa.',
    viewMap: 'Ver el mapa',
    reportAnother: 'Reportar otro',
    errNoLocation: 'Marca la ubicación del edificio tocando el mapa.',
    errFormData: 'Revisa los datos del formulario.',
    errGeoUnsupported: 'Tu dispositivo no permite geolocalización. Toca el mapa.',
    errGeoFailed: 'No se pudo obtener tu ubicación. Toca el mapa para marcarla.',
    errRateLimited: 'Has enviado demasiados reportes desde esta red. Intenta más tarde.',
    errOutOfBounds: 'La ubicación está fuera de Venezuela.',
    errGeneric: 'No se pudo enviar el reporte.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'Report a damaged building',
    subtext: 'You can report anonymously. If people are in danger, indicate it to prioritize.',
    locationLabel: 'Building location',
    useMyLocation: 'Use my location',
    marked: (lat: number, lng: number) => `Marked: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    tapToMark: 'Tap the map to mark the building.',
    damageLevel: 'Damage level',
    peopleLabel: 'Anyone inside?',
    peopleCount: 'Estimated people (optional)',
    estadoLabel: 'State',
    selectPlaceholder: 'Select…',
    municipioLabel: 'Municipality',
    parroquiaLabel: 'Parish / sector',
    addressLabel: 'Address (optional)',
    descriptionLabel: 'Description (optional)',
    descriptionPlaceholder: 'E.g.: cracks in ground-floor columns, residents evacuated…',
    contactLabel: 'Contact (private, optional)',
    contactPlaceholder: 'Phone or email — only visible to responders',
    backendMissing: 'The form is valid, but the database is not connected yet. Connect it (Supabase) to save reports.',
    submit: 'Submit report',
    submitting: 'Submitting…',
    successHeading: 'Report submitted',
    successText: 'Thank you. Your report will be reviewed before appearing on the public map (with approximate location) to prevent false information.',
    viewMap: 'View the map',
    reportAnother: 'Report another',
    errNoLocation: 'Mark the building location by tapping the map.',
    errFormData: 'Please check the form data.',
    errGeoUnsupported: 'Your device does not support geolocation. Tap the map.',
    errGeoFailed: 'Could not get your location. Tap the map to mark it.',
    errRateLimited: 'You have submitted too many reports from this network. Try again later.',
    errOutOfBounds: 'The location is outside Venezuela.',
    errGeneric: 'Could not submit the report.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function ReportarPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [damage, setDamage] = useState<DamageLevel>('moderate');
  const [people, setPeople] = useState<PeopleStatus>('unknown');
  const [peopleCount, setPeopleCount] = useState('');
  const [estado, setEstado] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [parroquia, setParroquia] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function useMyLocation() {
    if (!navigator.geolocation) {
      setErrorMsg(s.errGeoUnsupported);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErrorMsg(s.errGeoFailed),
    );
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!coords) {
      setErrorMsg(s.errNoLocation);
      return;
    }
    const payload = {
      lat: coords.lat,
      lng: coords.lng,
      damage_level: damage,
      people_status: people,
      people_count_estimate: peopleCount ? Number(peopleCount) : null,
      estado: estado || null,
      municipio: municipio || null,
      parroquia: parroquia || null,
      address: address || null,
      description: description || null,
      reporter_contact: contact || null,
    };
    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      setErrorMsg(s.errFormData);
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 503) {
        setStatus('backend-missing');
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus('error');
        setErrorMsg(
          json.error === 'rate_limited'
            ? s.errRateLimited
            : json.error === 'out_of_bounds'
              ? s.errOutOfBounds
              : json.error || s.errGeneric,
        );
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg(s.errNetwork);
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{s.successHeading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {s.successText}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
            {s.viewMap}
          </Link>
          <button
            onClick={() => { setStatus('idle'); setCoords(null); }}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            {s.reportAnother}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">{s.heading}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {s.subtext}
      </p>
      <Disclaimer className="mt-3" />

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {/* Location picker */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">{s.locationLabel}</label>
            <button
              type="button"
              onClick={useMyLocation}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              {s.useMyLocation}
            </button>
          </div>
          <div className="h-64 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            <Map
              initialViewState={REGION_CENTER}
              mapStyle={MAP_STYLE}
              style={{ width: '100%', height: '100%' }}
              onClick={(e) => setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
            >
              <NavigationControl position="top-right" />
              {coords && (
                <Marker longitude={coords.lng} latitude={coords.lat} anchor="bottom">
                  <span className="text-2xl">📍</span>
                </Marker>
              )}
            </Map>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {coords ? s.marked(coords.lat, coords.lng) : s.tapToMark}
          </p>
        </div>

        {/* Damage level */}
        <div>
          <label className="mb-1 block text-sm font-medium">{s.damageLevel}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DAMAGE_LEVELS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDamage(d.value)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs ${
                  damage === d.value
                    ? 'border-red-500 ring-1 ring-red-500'
                    : 'border-black/15 dark:border-white/15'
                }`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                {tr(d.label, locale)}
              </button>
            ))}
          </div>
        </div>

        {/* People */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.peopleLabel}</label>
            <select
              className={field}
              value={people}
              onChange={(e) => setPeople(e.target.value as PeopleStatus)}
            >
              {PEOPLE_STATUS.map((p) => (
                <option key={p.value} value={p.value}>{tr(p.label, locale)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {s.peopleCount}
            </label>
            <input
              className={field}
              type="number"
              min={0}
              value={peopleCount}
              onChange={(e) => setPeopleCount(e.target.value)}
            />
          </div>
        </div>

        {/* Location text */}
        <div className="grid gap-3 sm:grid-cols-2">
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
            <label className="mb-1 block text-sm font-medium">{s.parroquiaLabel}</label>
            <input className={field} value={parroquia} onChange={(e) => setParroquia(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.addressLabel}</label>
            <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.descriptionLabel}</label>
          <textarea
            className={field}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={s.descriptionPlaceholder}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            {s.contactLabel}
          </label>
          <input
            className={field}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={s.contactPlaceholder}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {status === 'backend-missing' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {s.backendMissing}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {status === 'submitting' ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
