'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DEMO_BUILDINGS } from '@/lib/demoData';
import { damageColor, damageLabel, peopleLabel, inspectionStatusLabel } from '@/lib/taxonomy';
import type { BuildingPublic } from '@/lib/types';
import type { Locale } from '@/lib/i18n';

const STR = {
  es: {
    title: 'Edificios reportados',
    at_risk_only: 'Solo en riesgo',
    show_map: 'Ver mapa',
    people: 'Personas',
    inspection: 'Inspección',
    location_missing: 'Ubicación sin detallar',
    no_results: 'Sin edificios en riesgo por el momento.',
    no_buildings: 'No hay edificios reportados todavía.',
    demo_note: 'Datos de muestra — el sistema aún no está conectado.',
    request_inspection: 'Solicitar inspección',
    show_map_cta: 'ver ubicaciones en el mapa',
  },
  en: {
    title: 'Reported buildings',
    at_risk_only: 'At-risk only',
    show_map: 'View map',
    people: 'People',
    inspection: 'Inspection',
    location_missing: 'Location not specified',
    no_results: 'No at-risk buildings at this time.',
    no_buildings: 'No buildings reported yet.',
    demo_note: 'Sample data — system is not yet connected.',
    request_inspection: 'Request inspection',
    show_map_cta: 'view locations on the map',
  },
} as const;

interface Props {
  locale: Locale;
  onShowMap: () => void;
}

export function BuildingList({ locale, onShowMap }: Props) {
  const s = STR[locale];
  const [buildings, setBuildings] = useState<BuildingPublic[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [onlyAtRisk, setOnlyAtRisk] = useState(true);

  const loadData = useCallback(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setBuildings(DEMO_BUILDINGS);
      setIsDemo(true);
      return;
    }
    sb.from('buildings_public')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setBuildings((data ?? []) as BuildingPublic[]);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const shown = onlyAtRisk
    ? buildings.filter(
        (b) =>
          b.people_status === 'confirmed_trapped' || b.people_status === 'possible',
      )
    : buildings;

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{s.title}</h2>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={onlyAtRisk}
              onChange={(e) => setOnlyAtRisk(e.target.checked)}
              className="accent-red-600"
            />
            {s.at_risk_only}
          </label>
          <button
            onClick={onShowMap}
            className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {s.show_map} →
          </button>
        </div>
      </div>

      {/* Demo badge */}
      {isDemo && (
        <div className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-500 dark:bg-zinc-800">
          {s.demo_note}
        </div>
      )}

      {/* List */}
      {shown.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {onlyAtRisk ? s.no_results : s.no_buildings}
        </p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {shown.map((b) => {
            const dLabel = damageLabel(b.damage_level, locale);
            const pLabel = peopleLabel(b.people_status, locale);
            const iLabel = inspectionStatusLabel(b.inspection_status, locale);
            const location = [b.parroquia, b.municipio, b.estado]
              .filter(Boolean)
              .join(', ') || s.location_missing;
            // people urgency: confirmed_trapped or possible
            const isUrgent =
              b.people_status === 'confirmed_trapped' || b.people_status === 'possible';

            return (
              <li key={b.id} className="flex items-start gap-3 py-3">
                {/* Damage color dot */}
                <span
                  className="mt-1 block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: damageColor(b.damage_level) }}
                  aria-label={dLabel}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium" style={{ color: damageColor(b.damage_level) }}>
                      {dLabel}
                    </span>
                    <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {location}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>
                      {s.people}:{' '}
                      <span className={isUrgent ? 'font-semibold text-red-600' : ''}>
                        {pLabel}
                      </span>
                    </span>
                    <span>
                      {s.inspection}: {iLabel}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Map CTA — always visible at the bottom */}
      <button
        onClick={onShowMap}
        className="mt-1 w-full rounded-xl border border-black/10 bg-zinc-50 py-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {s.show_map} — {s.show_map_cta}
      </button>
    </div>
  );
}
