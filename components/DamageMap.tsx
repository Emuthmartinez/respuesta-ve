'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DEMO_BUILDINGS } from '@/lib/demoData';
import { MAP_STYLE, REGION_CENTER } from '@/lib/mapStyle';
import {
  DAMAGE_BY_VALUE, PEOPLE_BY_VALUE, PLACARDS,
  INSPECTION_STATUS_LABEL, damageColor,
} from '@/lib/taxonomy';
import type { BuildingPublic, BuildingProvisionalPublic } from '@/lib/types';
import { MapLegend } from './MapLegend';

type ConfirmResult =
  | { ok: true; status: 'confirmed'; source?: string }
  | { ok: true; status: 'provisional'; confirmations: number; needed: number }
  | { ok: false; error: string };

export function DamageMap() {
  const [buildings, setBuildings] = useState<BuildingPublic[]>([]);
  const [provisional, setProvisional] = useState<BuildingProvisionalPublic[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [selected, setSelected] = useState<BuildingPublic | null>(null);
  const [selectedProv, setSelectedProv] = useState<BuildingProvisionalPublic | null>(null);
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);
  const [showProvisional, setShowProvisional] = useState(false);

  // Drag-to-confirm state for the selected provisional pin.
  const [confirming, setConfirming] = useState<BuildingProvisionalPublic | null>(null);
  const [dragPos, setDragPos] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setBuildings(DEMO_BUILDINGS);
      setIsDemo(true);
      return;
    }
    sb.from('buildings_public').select('*').then(({ data }) => {
      setBuildings((data ?? []) as BuildingPublic[]);
    });
    sb.from('buildings_provisional_public').select('*').then(({ data }) => {
      setProvisional((data ?? []) as BuildingProvisionalPublic[]);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const shown = useMemo(
    () =>
      buildings.filter(
        (b) =>
          !onlyAtRisk ||
          b.people_status === 'confirmed_trapped' ||
          b.people_status === 'possible',
      ),
    [buildings, onlyAtRisk],
  );

  function startConfirm(b: BuildingProvisionalPublic) {
    setSelectedProv(null);
    setConfirming(b);
    setDragPos({ lat: b.lat, lng: b.lng });
    setToast(null);
  }

  async function submitConfirm() {
    if (!confirming || !dragPos) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/confirm-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: confirming.id, lat: dragPos.lat, lng: dragPos.lng }),
      });
      const data = (await res.json()) as ConfirmResult;
      if (data.ok && data.status === 'confirmed') {
        setToast('¡Ubicación confirmada! Gracias. El reporte ya aparece en el mapa principal.');
        loadData();
      } else if (data.ok && data.status === 'provisional') {
        setToast(
          `Gracias. Confirmaciones: ${data.confirmations}/${data.needed}. ` +
            'Cuando varias personas coincidan, se ubicará en el mapa principal.',
        );
        loadData();
      } else if (!data.ok && data.error === 'not_confirmable') {
        setToast('Este reporte ya fue ubicado o no está disponible para confirmar.');
        loadData();
      } else {
        setToast('No se pudo registrar la confirmación. Inténtalo de nuevo.');
      }
    } catch {
      setToast('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
      setConfirming(null);
      setDragPos(null);
    }
  }

  return (
    <div className="relative h-full w-full">
      <Map
        initialViewState={REGION_CENTER}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" />

        {/* Confirmed pins (default layer) */}
        {shown.map((b) => (
          <Marker
            key={b.id}
            longitude={b.lng}
            latitude={b.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(b);
              setSelectedProv(null);
            }}
          >
            <span
              className="block h-3.5 w-3.5 cursor-pointer rounded-full shadow ring-2 ring-white"
              style={{ backgroundColor: damageColor(b.damage_level) }}
            />
          </Marker>
        ))}

        {/* Provisional pins ("Por confirmar" layer) — hollow dashed ring */}
        {showProvisional && !confirming &&
          provisional.map((b) => (
            <Marker
              key={b.id}
              longitude={b.lng}
              latitude={b.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedProv(b);
                setSelected(null);
              }}
            >
              <span
                className="block h-4 w-4 cursor-pointer rounded-full border-2 border-dashed bg-white/70 shadow"
                style={{ borderColor: damageColor(b.damage_level) }}
                title="Ubicación por confirmar"
              />
            </Marker>
          ))}

        {/* Drag-to-confirm marker */}
        {confirming && dragPos && (
          <Marker
            longitude={dragPos.lng}
            latitude={dragPos.lat}
            anchor="bottom"
            draggable
            onDragEnd={(e) => setDragPos({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
          >
            <span className="block -translate-y-1 text-2xl drop-shadow" aria-label="Punto a confirmar">
              📍
            </span>
          </Marker>
        )}

        {/* Confirmed-pin popup */}
        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            anchor="top"
            closeOnClick={false}
            onClose={() => setSelected(null)}
            maxWidth="260px"
          >
            <div className="space-y-1 text-xs">
              <div className="text-sm font-semibold" style={{ color: damageColor(selected.damage_level) }}>
                {DAMAGE_BY_VALUE[selected.damage_level]?.label}
              </div>
              <div>
                {[selected.parroquia, selected.municipio, selected.estado].filter(Boolean).join(', ') ||
                  'Ubicación sin detallar'}
              </div>
              <div>Personas: {PEOPLE_BY_VALUE[selected.people_status]?.label}</div>
              <div>Inspección: {INSPECTION_STATUS_LABEL[selected.inspection_status]}</div>
              {selected.official_placard !== 'none' && (
                <div style={{ color: PLACARDS[selected.official_placard].color }}>
                  {PLACARDS[selected.official_placard].label}
                </div>
              )}
              <Link
                href={`/solicitar-inspeccion?building=${selected.id}`}
                className="mt-1 inline-block font-medium text-red-600 underline"
              >
                Solicitar inspección
              </Link>
              <div className="pt-1 text-[10px] text-zinc-400">Ubicación aproximada por privacidad</div>
            </div>
          </Popup>
        )}

        {/* Provisional-pin popup → confirm CTA */}
        {selectedProv && (
          <Popup
            longitude={selectedProv.lng}
            latitude={selectedProv.lat}
            anchor="top"
            closeOnClick={false}
            onClose={() => setSelectedProv(null)}
            maxWidth="280px"
          >
            <div className="space-y-1 text-xs">
              <div className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                Por confirmar
              </div>
              <div className="text-sm font-semibold" style={{ color: damageColor(selectedProv.damage_level) }}>
                {DAMAGE_BY_VALUE[selectedProv.damage_level]?.label}
              </div>
              <div>
                {[selectedProv.parroquia, selectedProv.municipio, selectedProv.estado].filter(Boolean).join(', ') ||
                  'Zona sin detallar'}
              </div>
              <div className="text-[11px] text-zinc-500">
                Ubicación aproximada
                {selectedProv.location_radius_m ? ` (~${selectedProv.location_radius_m} m)` : ''} · reporte de
                redes sociales sin verificar.
              </div>
              <div className="text-[11px]">
                Confirmaciones: {selectedProv.location_confirmation_count}/3
              </div>
              <button
                onClick={() => startConfirm(selectedProv)}
                className="mt-1 inline-block rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
              >
                Confirmar ubicación
              </button>
              <div className="pt-1 text-[10px] text-zinc-400">
                ¿Conoces este edificio? Ayúdanos a ubicarlo en el mapa.
              </div>
            </div>
          </Popup>
        )}
      </Map>

      <MapLegend isDemo={isDemo} />

      {/* Filters (top-left) */}
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 bg-white/95 px-3 py-2 text-xs shadow dark:border-white/10 dark:bg-zinc-900/95">
          <input type="checkbox" checked={onlyAtRisk} onChange={(e) => setOnlyAtRisk(e.target.checked)} />
          Solo con personas en riesgo
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-amber-300 bg-white/95 px-3 py-2 text-xs shadow dark:border-amber-500/40 dark:bg-zinc-900/95">
          <input
            type="checkbox"
            checked={showProvisional}
            onChange={(e) => {
              setShowProvisional(e.target.checked);
              if (!e.target.checked) { setSelectedProv(null); setConfirming(null); }
            }}
          />
          <span>
            <span className="inline-block h-2.5 w-2.5 -mb-0.5 mr-1 rounded-full border-2 border-dashed border-amber-600 align-middle" />
            Reportes por confirmar
            {provisional.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                {provisional.length}
              </span>
            )}
          </span>
        </label>
      </div>

      {/* Confirm-mode banner */}
      {confirming && (
        <div className="absolute left-1/2 top-4 z-20 w-[90%] max-w-md -translate-x-1/2 rounded-lg border border-amber-300 bg-white p-3 text-xs shadow-lg dark:border-amber-500/40 dark:bg-zinc-900">
          <div className="font-semibold">Arrastra 📍 a la ubicación exacta del edificio</div>
          <div className="mt-0.5 text-zinc-500">
            {[confirming.parroquia, confirming.municipio].filter(Boolean).join(', ')} — luego confirma.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitConfirm}
              disabled={submitting}
              className="rounded bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Confirmar aquí'}
            </button>
            <button
              onClick={() => { setConfirming(null); setDragPos(null); }}
              className="rounded border border-black/10 px-3 py-1.5 dark:border-white/15"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 z-20 w-[90%] max-w-md -translate-x-1/2 rounded-lg border border-black/10 bg-white p-3 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-start gap-2">
            <span className="flex-1">{toast}</span>
            <button onClick={() => setToast(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
