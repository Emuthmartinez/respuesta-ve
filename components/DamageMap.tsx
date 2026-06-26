'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DEMO_BUILDINGS } from '@/lib/demoData';
import { MAP_STYLE, REGION_CENTER } from '@/lib/mapStyle';
import {
  PLACARDS,
  damageColor, damageLabel, peopleLabel, placardLabel, inspectionStatusLabel,
} from '@/lib/taxonomy';
import type { BuildingPublic, BuildingProvisionalPublic } from '@/lib/types';
import type { Locale } from '@/lib/i18n';
import { MapLegend } from './MapLegend';
import { AddressSearch } from './AddressSearch';

const STR = {
  es: {
    location_missing: 'Ubicación sin detallar',
    zone_missing: 'Zona sin detallar',
    people_prefix: 'Personas',
    inspection_prefix: 'Inspección',
    request_inspection: 'Solicitar inspección',
    approx_privacy: 'Ubicación aproximada por privacidad',
    to_confirm: 'Por confirmar',
    approx_location: 'Ubicación aproximada',
    unverified_social: 'reporte de redes sociales sin verificar.',
    confirmations: 'Confirmaciones',
    confirm_location_btn: 'Confirmar ubicación',
    know_building: '¿Conoces este edificio? Ayúdanos a ubicarlo en el mapa.',
    only_at_risk: 'Solo con personas en riesgo',
    reports_to_confirm: 'Reportes por confirmar',
    drag_instruction: 'Arrastra 📍 a la ubicación exacta del edificio',
    then_confirm: '— luego confirma.',
    submitting: 'Enviando…',
    confirm_here: 'Confirmar aquí',
    cancel: 'Cancelar',
    pin_label: 'Punto a confirmar',
    toast_confirmed: '¡Ubicación confirmada! Gracias. El reporte ya aparece en el mapa principal.',
    toast_provisional: (count: number, needed: number) =>
      `Gracias. Confirmaciones: ${count}/${needed}. Cuando varias personas coincidan, se ubicará en el mapa principal.`,
    toast_not_confirmable: 'Este reporte ya fue ubicado o no está disponible para confirmar.',
    toast_error: 'No se pudo registrar la confirmación. Inténtalo de nuevo.',
    toast_offline: 'Sin conexión. Inténtalo de nuevo.',
  },
  en: {
    location_missing: 'Location not specified',
    zone_missing: 'Area not specified',
    people_prefix: 'People',
    inspection_prefix: 'Inspection',
    request_inspection: 'Request inspection',
    approx_privacy: 'Approximate location for privacy',
    to_confirm: 'To confirm',
    approx_location: 'Approximate location',
    unverified_social: 'unverified social media report.',
    confirmations: 'Confirmations',
    confirm_location_btn: 'Confirm location',
    know_building: 'Do you know this building? Help us place it on the map.',
    only_at_risk: 'Only people at risk',
    reports_to_confirm: 'Reports to confirm',
    drag_instruction: 'Drag 📍 to the building\'s exact location',
    then_confirm: '— then confirm.',
    submitting: 'Submitting…',
    confirm_here: 'Confirm here',
    cancel: 'Cancel',
    pin_label: 'Pin to confirm',
    toast_confirmed: 'Location confirmed! Thank you. The report now appears on the main map.',
    toast_provisional: (count: number, needed: number) =>
      `Thank you. Confirmations: ${count}/${needed}. Once enough people agree, it will appear on the main map.`,
    toast_not_confirmable: 'This report has already been located or is not available to confirm.',
    toast_error: 'Could not save the confirmation. Please try again.',
    toast_offline: 'No connection. Please try again.',
  },
} as const;

type ConfirmResult =
  | { ok: true; status: 'confirmed'; source?: string }
  | { ok: true; status: 'provisional'; confirmations: number; needed: number }
  | { ok: false; error: string };

interface DamageMapProps {
  locale?: Locale;
}

export function DamageMap({ locale = 'es' }: DamageMapProps) {
  const s = STR[locale];
  const mapRef = useRef<MapRef>(null);
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
        setToast(s.toast_confirmed);
        loadData();
      } else if (data.ok && data.status === 'provisional') {
        setToast(s.toast_provisional(data.confirmations, data.needed));
        loadData();
      } else if (!data.ok && data.error === 'not_confirmable') {
        setToast(s.toast_not_confirmable);
        loadData();
      } else {
        setToast(s.toast_error);
      }
    } catch {
      setToast(s.toast_offline);
    } finally {
      setSubmitting(false);
      setConfirming(null);
      setDragPos(null);
    }
  }

  return (
    <div className="relative h-full w-full">
      {/* Address search — positioned top-center, above map controls */}
      <div className="absolute left-1/2 top-4 z-10 w-[min(340px,calc(100%-4rem))] -translate-x-1/2">
        <AddressSearch
          locale={locale}
          onPick={({ lat, lng }) => {
            mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
          }}
        />
      </div>

      <Map
        ref={mapRef}
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
                title={s.to_confirm}
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
            <span className="block -translate-y-1 text-2xl drop-shadow" aria-label={s.pin_label}>
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
                {damageLabel(selected.damage_level, locale)}
              </div>
              <div>
                {[selected.parroquia, selected.municipio, selected.estado].filter(Boolean).join(', ') ||
                  s.location_missing}
              </div>
              <div>{s.people_prefix}: {peopleLabel(selected.people_status, locale)}</div>
              <div>{s.inspection_prefix}: {inspectionStatusLabel(selected.inspection_status, locale)}</div>
              {selected.official_placard !== 'none' && (
                <div style={{ color: PLACARDS[selected.official_placard].color }}>
                  {placardLabel(selected.official_placard, locale)}
                </div>
              )}
              <Link
                href={`/solicitar-inspeccion?building=${selected.id}`}
                className="mt-1 inline-block font-medium text-red-600 underline"
              >
                {s.request_inspection}
              </Link>
              <div className="pt-1 text-[10px] text-zinc-400">{s.approx_privacy}</div>
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
                {s.to_confirm}
              </div>
              <div className="text-sm font-semibold" style={{ color: damageColor(selectedProv.damage_level) }}>
                {damageLabel(selectedProv.damage_level, locale)}
              </div>
              <div>
                {[selectedProv.parroquia, selectedProv.municipio, selectedProv.estado].filter(Boolean).join(', ') ||
                  s.zone_missing}
              </div>
              <div className="text-[11px] text-zinc-500">
                {s.approx_location}
                {selectedProv.location_radius_m ? ` (~${selectedProv.location_radius_m} m)` : ''} · {s.unverified_social}
              </div>
              <div className="text-[11px]">
                {s.confirmations}: {selectedProv.location_confirmation_count}/3
              </div>
              <button
                onClick={() => startConfirm(selectedProv)}
                className="mt-1 inline-block rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
              >
                {s.confirm_location_btn}
              </button>
              <div className="pt-1 text-[10px] text-zinc-400">
                {s.know_building}
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
          {s.only_at_risk}
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
            {s.reports_to_confirm}
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
          <div className="font-semibold">{s.drag_instruction}</div>
          <div className="mt-0.5 text-zinc-500">
            {[confirming.parroquia, confirming.municipio].filter(Boolean).join(', ')} {s.then_confirm}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitConfirm}
              disabled={submitting}
              className="rounded bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? s.submitting : s.confirm_here}
            </button>
            <button
              onClick={() => { setConfirming(null); setDragPos(null); }}
              className="rounded border border-black/10 px-3 py-1.5 dark:border-white/15"
            >
              {s.cancel}
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
