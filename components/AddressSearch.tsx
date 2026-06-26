'use client';

import { useState, useEffect, useRef } from 'react';
import { geocodeSearch, type GeoResult } from '@/lib/geocode';
import type { Locale } from '@/lib/i18n';

const STR = {
  es: {
    placeholder: 'Buscar dirección…',
    searching: 'Buscando…',
    no_results: 'Sin resultados',
    attribution: '© OpenStreetMap',
  },
  en: {
    placeholder: 'Search address…',
    searching: 'Searching…',
    no_results: 'No results',
    attribution: '© OpenStreetMap',
  },
} as const;

export interface PickedLocation {
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  locale: Locale;
  onPick: (loc: PickedLocation) => void;
  className?: string;
  placeholder?: string;
}

export function AddressSearch({ locale, onPick, className = '', placeholder }: Props) {
  const s = STR[locale];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const r = await geocodeSearch(query);
      setResults(r);
      setOpen(r.length > 0 || query.trim().length >= 2);
      setLoading(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function pick(r: GeoResult) {
    setQuery(r.label);
    setOpen(false);
    setResults([]);
    onPick({ lat: r.lat, lng: r.lng, label: r.label });
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder ?? s.placeholder}
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-white/15 dark:bg-zinc-900"
        autoComplete="off"
        spellCheck={false}
        aria-label={placeholder ?? s.placeholder}
        aria-expanded={open}
        aria-haspopup="listbox"
        role="combobox"
      />

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900"
          role="listbox"
        >
          {loading && (
            <div className="px-3 py-2 text-xs text-zinc-500">{s.searching}</div>
          )}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-zinc-500">{s.no_results}</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              role="option"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click
                pick(r);
              }}
              className="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span className="mr-2 mt-0.5 shrink-0 text-zinc-400">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                  <path d="M6 0a4 4 0 0 0-4 4c0 3 4 8 4 8s4-5 4-8a4 4 0 0 0-4-4Zm0 5.5A1.5 1.5 0 1 1 6 2.5a1.5 1.5 0 0 1 0 3Z" />
                </svg>
              </span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
          {/* Attribution */}
          <div className="border-t border-black/5 px-3 py-1 text-right text-[10px] text-zinc-400 dark:border-white/5">
            {s.attribution}
          </div>
        </div>
      )}
    </div>
  );
}
