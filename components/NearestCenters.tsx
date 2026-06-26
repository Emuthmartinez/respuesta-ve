'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { haversineKm, COUNTRY_NAME } from '@/lib/geo';
import { DONATION_ITEM_LABEL } from '@/lib/orgs';
import type { CenterPublic } from '@/lib/orgs';

type GeoState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'granted'; coords: [number, number] }
  | { phase: 'denied'; reason: string };

const ALL_COUNTRIES = 'all';

function distanceLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function NearestCenters({ centers }: { centers: CenterPublic[] }) {
  const [geo, setGeo] = useState<GeoState>({ phase: 'idle' });
  const [countryFilter, setCountryFilter] = useState<string>(ALL_COUNTRIES);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeo({ phase: 'denied', reason: 'Tu navegador no soporta geolocalización.' });
      return;
    }
    setGeo({ phase: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ phase: 'granted', coords: [pos.coords.latitude, pos.coords.longitude] }),
      (err) =>
        setGeo({
          phase: 'denied',
          reason: err.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener tu ubicación.',
        }),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  const countries = useMemo(() => {
    const seen = new Set<string>();
    for (const c of centers) if (c.country_code) seen.add(c.country_code);
    return [...seen].sort();
  }, [centers]);

  const sorted = useMemo(() => {
    let list = centers;
    if (geo.phase === 'granted') {
      list = [...centers].sort((a, b) => {
        const dA = a.lat != null && a.lng != null ? haversineKm(geo.coords, [a.lat, a.lng]) : Infinity;
        const dB = b.lat != null && b.lng != null ? haversineKm(geo.coords, [b.lat, b.lng]) : Infinity;
        return dA - dB;
      });
    } else if (countryFilter !== ALL_COUNTRIES) {
      list = centers.filter((c) => c.country_code === countryFilter);
    }
    return list;
  }, [centers, geo, countryFilter]);

  if (centers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-5 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-400">
        Aún no hay centros de acopio publicados.{' '}
        <Link href="/afuera/agregar-centro" className="font-medium text-amber-600 hover:underline">
          ¿Conoces uno? Agrégalo aquí
        </Link>{' '}
        — lo verificamos antes de publicarlo.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {geo.phase === 'requesting' && <span className="animate-pulse">Obteniendo tu ubicación…</span>}
        {geo.phase === 'granted' && <span className="text-green-600 dark:text-green-400">Ordenados por distancia a ti</span>}
        {(geo.phase === 'denied' || geo.phase === 'idle') && (
          <>
            <span>{geo.phase === 'denied' ? geo.reason : ''} Filtrar por país:</span>
            <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded border border-black/15 bg-transparent px-2 py-0.5 text-xs dark:border-white/20">
              <option value={ALL_COUNTRIES}>Todos los países</option>
              {countries.map((cc) => <option key={cc} value={cc}>{COUNTRY_NAME[cc] ?? cc}</option>)}
            </select>
          </>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No hay centros en {countryFilter === ALL_COUNTRIES ? 'ningún país' : (COUNTRY_NAME[countryFilter] ?? countryFilter)}.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((c) => {
            const distKm = geo.phase === 'granted' && c.lat != null && c.lng != null ? haversineKm(geo.coords, [c.lat, c.lng]) : null;
            return (
              <div key={c.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium leading-tight">{c.name}</div>
                  {distKm != null && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      {distanceLabel(distKm)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {[c.city, c.state_province, COUNTRY_NAME[c.country_code ?? ''] ?? c.country_code].filter(Boolean).join(', ')}
                </div>
                {c.priority_items && c.priority_items.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Qué se necesita</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.priority_items.map((it) => (
                        <span key={it} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          {DONATION_ITEM_LABEL[it] ?? it}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {c.needs_notes && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{c.needs_notes}</p>}
                {c.contact_public_display && <p className="mt-1 text-xs text-zinc-500">Contacto: {c.contact_public_display}</p>}
                {c.hours_notes && <p className="text-xs text-zinc-500">{c.hours_notes}</p>}
                {c.accepts_monetary && c.monetary_url && (
                  <div className="mt-3">
                    <a href={c.monetary_url} target="_blank" rel="noreferrer"
                      className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      Donar dinero →
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-400">
        ¿Conoces un centro que no aparece?{' '}
        <Link href="/afuera/agregar-centro" className="font-medium text-amber-600 hover:underline">Agrégalo aquí</Link>.
        Los centros se verifican antes de publicarse. Las coordenadas se muestran con imprecisión intencional para proteger la privacidad.
      </p>
    </div>
  );
}
