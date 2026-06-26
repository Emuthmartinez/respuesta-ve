// lib/geocode.ts — Client-side geocoder using Photon (OpenStreetMap-based).
// Pure fetch — caller is responsible for debouncing.
// Returns [] on any error so the UI never blows up.

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lng, lat]
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

function buildLabel(p: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (p.street) {
    parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  }
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.country) parts.push(p.country);
  return parts.join(', ');
}

export async function geocodeSearch(q: string): Promise<GeoResult[]> {
  if (!q.trim()) return [];
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=es`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { features: PhotonFeature[] };
    return (data.features ?? []).map((f) => ({
      label: buildLabel(f.properties) || q,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
  } catch {
    return [];
  }
}
