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
  // Exposed by migration 0015 for the federated search: age helps families
  // disambiguate, and possible_duplicate_ids lets the UI cluster scattered
  // hits into one "posible misma persona" card (advisory — never a merge).
  age_estimate: number | null;
  possible_duplicate_ids: string[] | null;
  // Dedup engine (migration 0016): cluster_id groups the same person's
  // scattered records; cedula_confirmed drives the "Identificados" section;
  // cluster_size badges the count; is_multi_person flags a group report.
  cluster_id: string | null;
  cedula_confirmed: boolean;
  cluster_size: number;
  is_multi_person: boolean;
  last_seen_at: string | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
}
