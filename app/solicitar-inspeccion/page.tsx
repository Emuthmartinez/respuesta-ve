'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, REGION_CENTER } from '@/lib/mapStyle';
import { NEEDS_TYPES, ESTADOS } from '@/lib/responder';
import { tr } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';
import { Disclaimer } from '@/components/Disclaimer';
import { ManageLink } from '@/components/ManageLink';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

const STR = {
  es: {
    heading: 'Solicitar inspección de un edificio',
    subtext: 'Si no puedes entrar a un edificio o no sabes si es seguro, pide que un responder con credenciales lo evalúe. Puedes hacerlo de forma anónima.',
    locationLabel: 'Ubicación del edificio',
    useMyLocation: 'Usar mi ubicación',
    marked: (lat: number, lng: number) => `Marcado: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    tapToMark: 'Toca el mapa para marcar.',
    needsTypeLabel: 'Tipo de necesidad',
    peopleInsideLabel: 'Hay personas dentro o atrapadas en este momento',
    contactLabel: 'Contacto (privado)',
    contactPlaceholder: 'Teléfono / WhatsApp',
    whenLabel: '¿Cuándo ubicarte?',
    whenPlaceholder: 'Ej: estaré en el sitio en la mañana',
    estadoLabel: 'Estado',
    selectPlaceholder: 'Seleccionar…',
    municipioLabel: 'Municipio',
    accessLabel: 'Acceso / contexto',
    accessPlaceholder: '¿Quién dará acceso? ¿Qué se observa? ¿Hay riesgos?',
    submit: 'Enviar solicitud',
    submitting: 'Enviando…',
    successHeading: 'Solicitud enviada',
    successText: 'Guarda este código para consultar el estado de tu solicitud:',
    priorityNote: 'Si reportaste personas dentro, tu solicitud se priorizó automáticamente.',
    backToMap: 'Volver al mapa',
    errNoLocation: 'Marca la ubicación del edificio en el mapa.',
    errGeoFailed: 'No se pudo obtener tu ubicación. Toca el mapa.',
    errOutOfBounds: 'La ubicación está fuera de Venezuela.',
    errGeneric: 'No se pudo enviar.',
    errNetwork: 'Error de red. Intenta de nuevo.',
  },
  en: {
    heading: 'Request a building inspection',
    subtext: 'If you cannot enter a building or do not know if it is safe, ask a credentialed responder to evaluate it. You can do this anonymously.',
    locationLabel: 'Building location',
    useMyLocation: 'Use my location',
    marked: (lat: number, lng: number) => `Marked: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    tapToMark: 'Tap the map to mark.',
    needsTypeLabel: 'Type of need',
    peopleInsideLabel: 'People inside or trapped right now',
    contactLabel: 'Contact (private)',
    contactPlaceholder: 'Phone / WhatsApp',
    whenLabel: 'When can we reach you?',
    whenPlaceholder: 'E.g.: I will be on site in the morning',
    estadoLabel: 'State',
    selectPlaceholder: 'Select…',
    municipioLabel: 'Municipality',
    accessLabel: 'Access / context',
    accessPlaceholder: 'Who will grant access? What is observed? Any hazards?',
    submit: 'Submit request',
    submitting: 'Submitting…',
    successHeading: 'Request submitted',
    successText: 'Save this code to check your request status:',
    priorityNote: 'If you reported people inside, your request was automatically prioritized.',
    backToMap: 'Back to the map',
    errNoLocation: 'Mark the building location on the map.',
    errGeoFailed: 'Could not get your location. Tap the map.',
    errOutOfBounds: 'The location is outside Venezuela.',
    errGeneric: 'Could not submit.',
    errNetwork: 'Network error. Please try again.',
  },
} as const;

export default function SolicitarInspeccionPage() {
  const locale = useLocale();
  const s = STR[locale];

  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [needsType, setNeedsType] = useState('structural_safety');
  const [peopleInside, setPeopleInside] = useState(false);
  const [contact, setContact] = useState('');
  const [contactWindow, setContactWindow] = useState('');
  const [estado, setEstado] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [description, setDescription] = useState('');

  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBuildingId(params.get('building'));
    const lat = params.get('lat');
    const lng = params.get('lng');
    if (lat && lng) setCoords({ lat: Number(lat), lng: Number(lng) });
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErr(s.errGeoFailed),
    );
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (!buildingId && !coords) {
      setErr(s.errNoLocation);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/inspection-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: buildingId,
          needs_type: needsType,
          people_inside_at_submission: peopleInside,
          requester_contact: contact || null,
          contact_window: contactWindow || null,
          access_status: null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          estado: estado || null,
          municipio: municipio || null,
          description: description || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error === 'out_of_bounds' ? s.errOutOfBounds : (json.error || s.errGeneric));
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
        <ManageLink token={token} />
        <p className="mt-3 text-xs text-zinc-500">
          {s.priorityNote}
        </p>
        <div className="mt-6">
          <Link href="/" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">{s.backToMap}</Link>
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
      <Disclaimer className="mt-3" />

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {!buildingId && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium">{s.locationLabel}</label>
              <button type="button" onClick={useMyLocation} className="text-xs font-medium text-red-600 hover:underline">
                {s.useMyLocation}
              </button>
            </div>
            <div className="h-56 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
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
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">{s.needsTypeLabel}</label>
          <select className={field} value={needsType} onChange={(e) => setNeedsType(e.target.value)}>
            {NEEDS_TYPES.map((n) => <option key={n.value} value={n.value}>{tr(n.label, locale)}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <input type="checkbox" checked={peopleInside} onChange={(e) => setPeopleInside(e.target.checked)} />
          {s.peopleInsideLabel}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{s.contactLabel}</label>
            <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={s.contactPlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{s.whenLabel}</label>
            <input className={field} value={contactWindow} onChange={(e) => setContactWindow(e.target.value)} placeholder={s.whenPlaceholder} />
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
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{s.accessLabel}</label>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={s.accessPlaceholder} />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={saving} className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {saving ? s.submitting : s.submit}
        </button>
      </form>
    </div>
  );
}
