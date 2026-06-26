import type { BuildingPublic } from './types';

// Sample data shown ONLY before the backend is provisioned, so the map is
// never empty during development. Clearly flagged as demo in the UI.
type DemoRow = Omit<BuildingPublic, 'location_status' | 'location_radius_m' | 'location_confirmation_count'>;

const ROWS: DemoRow[] = [
  { id: 'd1', lat: 10.602, lng: -66.933, estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Maiquetía',
    damage_level: 'collapsed', people_status: 'confirmed_trapped', inspection_status: 'requested',
    official_placard: 'none', verified: false, created_at: new Date().toISOString() },
  { id: 'd2', lat: 10.613, lng: -66.916, estado: 'La Guaira', municipio: 'Vargas', parroquia: 'Playa Grande',
    damage_level: 'severe', people_status: 'possible', inspection_status: 'requested',
    official_placard: 'none', verified: true, created_at: new Date().toISOString() },
  { id: 'd3', lat: 10.506, lng: -66.914, estado: 'Distrito Capital', municipio: 'Libertador', parroquia: 'El Recreo',
    damage_level: 'moderate', people_status: 'none_reported', inspection_status: 'claimed',
    official_placard: 'yellow_restricted', verified: true, created_at: new Date().toISOString() },
  { id: 'd4', lat: 10.491, lng: -66.853, estado: 'Miranda', municipio: 'Sucre', parroquia: 'Petare',
    damage_level: 'minor', people_status: 'none_reported', inspection_status: 'not_requested',
    official_placard: 'none', verified: false, created_at: new Date().toISOString() },
  { id: 'd5', lat: 10.234, lng: -67.595, estado: 'Aragua', municipio: 'Girardot', parroquia: 'Maracay',
    damage_level: 'severe', people_status: 'possible', inspection_status: 'requested',
    official_placard: 'red_unsafe', verified: true, created_at: new Date().toISOString() },
  { id: 'd6', lat: 10.171, lng: -68.005, estado: 'Carabobo', municipio: 'Valencia', parroquia: 'San José',
    damage_level: 'moderate', people_status: 'unknown', inspection_status: 'not_requested',
    official_placard: 'none', verified: false, created_at: new Date().toISOString() },
];

export const DEMO_BUILDINGS: BuildingPublic[] = ROWS.map((b) => ({
  ...b,
  location_status: 'confirmed',
  location_radius_m: null,
  location_confirmation_count: 0,
}));
