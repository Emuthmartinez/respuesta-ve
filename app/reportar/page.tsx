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
import { reportSchema } from '@/lib/reportSchema';
import { Disclaimer } from '@/components/Disclaimer';

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'backend-missing';

const field =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900';

export default function ReportarPage() {
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
      setErrorMsg('Tu dispositivo no permite geolocalización. Toca el mapa.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErrorMsg('No se pudo obtener tu ubicación. Toca el mapa para marcarla.'),
    );
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!coords) {
      setErrorMsg('Marca la ubicación del edificio tocando el mapa.');
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
      setErrorMsg('Revisa los datos del formulario.');
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
            ? 'Has enviado demasiados reportes desde esta red. Intenta más tarde.'
            : json.error === 'out_of_bounds'
              ? 'La ubicación está fuera de Venezuela.'
              : json.error || 'No se pudo enviar el reporte.',
        );
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg('Error de red. Intenta de nuevo.');
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Reporte enviado</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Gracias. Tu reporte será revisado antes de aparecer en el mapa
          público (con ubicación aproximada), para evitar información falsa.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
            Ver el mapa
          </Link>
          <button
            onClick={() => { setStatus('idle'); setCoords(null); }}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Reportar otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Reportar un edificio dañado</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Puedes reportar de forma anónima. Si hay personas en peligro, indícalo
        para priorizar.
      </p>
      <Disclaimer className="mt-3" />

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {/* Location picker */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">Ubicación del edificio</label>
            <button
              type="button"
              onClick={useMyLocation}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Usar mi ubicación
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
            {coords
              ? `Marcado: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
              : 'Toca el mapa para marcar el edificio.'}
          </p>
        </div>

        {/* Damage level */}
        <div>
          <label className="mb-1 block text-sm font-medium">Nivel de daño</label>
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
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* People */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">¿Hay personas?</label>
            <select
              className={field}
              value={people}
              onChange={(e) => setPeople(e.target.value as PeopleStatus)}
            >
              {PEOPLE_STATUS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Personas estimadas (opcional)
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
          <div>
            <label className="mb-1 block text-sm font-medium">Parroquia / sector</label>
            <input className={field} value={parroquia} onChange={(e) => setParroquia(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Dirección (opcional)</label>
            <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Descripción (opcional)</label>
          <textarea
            className={field}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: grietas en columnas del primer piso, vecinos evacuados…"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Contacto (privado, opcional)
          </label>
          <input
            className={field}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Teléfono o correo — solo visible para responders"
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {status === 'backend-missing' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            El formulario es válido, pero la base de datos aún no está
            conectada. Conéctala (Supabase) para guardar reportes.
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {status === 'submitting' ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </form>
    </div>
  );
}
