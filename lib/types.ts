import type {
  DamageLevel, PeopleStatus, Placard, InspectionStatus,
} from './taxonomy';

// Row shape of the PUBLIC view `buildings_public` (fuzzed coordinates).
export interface BuildingPublic {
  id: string;
  lat: number;
  lng: number;
  estado: string | null;
  municipio: string | null;
  parroquia: string | null;
  damage_level: DamageLevel;
  people_status: PeopleStatus;
  inspection_status: InspectionStatus;
  official_placard: Placard;
  verified: boolean;
  // Placement axis (migration 0010). 'confirmed' on the default layer;
  // 'provisional' on the "Por confirmar" layer (buildings_provisional_public).
  location_status: 'provisional' | 'confirmed';
  location_radius_m: number | null;
  location_confirmation_count: number;
  created_at: string;
}

// Row shape of `buildings_provisional_public` — the "Por confirmar" layer.
// Same as BuildingPublic plus the ingest channel (e.g. 'x_social').
export interface BuildingProvisionalPublic extends BuildingPublic {
  source_channel: string | null;
}

export type MissingStatus =
  | 'missing' | 'found_safe' | 'found_injured' | 'deceased' | 'unknown';

export interface MissingPinPublic {
  id: string;
  display_name: string | null;
  lat: number | null;
  lng: number | null;
  estado: string | null;
  municipio: string | null;
  status: MissingStatus;
  source: string;
  external_url: string | null;
  photo_url: string | null;
  last_seen_at: string | null;
  created_at: string;
}
