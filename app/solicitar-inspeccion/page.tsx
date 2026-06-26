'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, REGION_CENTER } from '@/lib/mapStyle';
import { NEEDS_TYPES, ESTADOS } from '@/lib/responder';
import { Disclaimer } from '@/components/Disclaimer';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export default function SolicitarInspeccionPage() {
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
      () => setErr('No se pudo obtener tu ubicación. Toca el mapa.'),
    );
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErr('');
    if (!buildingId && !coords) {
      setErr('Marca la ubicación del edificio en el mapa.');
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
        setErr(json.error === 'out_of_bounds' ? 'La ubicación está fuera de Venezuela.' : (json.error || 'No se pudo enviar.'));
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
          Guarda este código para consultar el estado de tu solicitud:
        </p>
        <code className="mt-3 inline-block break-all rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">{token}</code>
        <p className="mt-3 text-xs text-zinc-500">
          Si reportaste personas dentro, tu solicitud se priorizó automáticamente.
        </p>
        <div className="mt-6">
          <Link href="/" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">Volver al mapa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Solicitar inspección de un edificio</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Si no puedes entrar a un edificio o no sabes si es seguro, pide que un
        responder con credenciales lo evalúe. Puedes hacerlo de forma anónima.
      </p>
      <Disclaimer className="mt-3" />

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {!buildingId && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium">Ubicación del edificio</label>
              <button type="button" onClick={useMyLocation} className="text-xs font-medium text-red-600 hover:underline">
                Usar mi ubicación
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
              {coords ? `Marcado: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Toca el mapa para marcar.'}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Tipo de necesidad</label>
          <select className={field} value={needsType} onChange={(e) => setNeedsType(e.target.value)}>
            {NEEDS_TYPES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <input type="checkbox" checked={peopleInside} onChange={(e) => setPeopleInside(e.target.checked)} />
          Hay personas dentro o atrapadas en este momento
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Contacto (privado)</label>
            <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Teléfono / WhatsApp" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">¿Cuándo ubicarte?</label>
            <input className={field} value={contactWindow} onChange={(e) => setContactWindow(e.target.value)} placeholder="Ej: estaré en el sitio en la mañana" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Estado</label>
            <select className={field} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Seleccionar…</option>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Municipio</label>
            <input className={field} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Acceso / contexto</label>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Quién dará acceso? ¿Qué se observa? ¿Hay riesgos?" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={saving} className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {saving ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}
