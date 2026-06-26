// =====================================================================
// DAMAGE TAXONOMY — the single most user-facing classification in the app.
// Drives the map legend, marker colors, and the report form simultaneously.
// This is a DOMAIN/POLICY decision: adjust labels, order, and colors here
// and the whole UI follows. Order is most-severe → least-severe.
// =====================================================================

export type DamageLevel =
  | 'collapsed' | 'severe' | 'moderate' | 'minor' | 'no_visible_damage' | 'unknown';

export type PeopleStatus =
  | 'confirmed_trapped' | 'possible' | 'none_reported' | 'unknown';

export type Placard = 'none' | 'green_inspected' | 'yellow_restricted' | 'red_unsafe';

export type InspectionStatus = 'not_requested' | 'requested' | 'claimed' | 'assessed';

export const DAMAGE_LEVELS: {
  value: DamageLevel; label: string; help: string; color: string;
}[] = [
  { value: 'collapsed',         label: 'Colapsado',         help: 'Derrumbe total o casi total',                       color: '#7f1d1d' },
  { value: 'severe',            label: 'Daño severo',       help: 'Falla estructural — no entrar',                     color: '#dc2626' },
  { value: 'moderate',          label: 'Daño moderado',     help: 'Grietas importantes — inspeccionar antes de entrar', color: '#f59e0b' },
  { value: 'minor',             label: 'Daño leve',         help: 'Grietas cosméticas — probablemente habitable',      color: '#fcd34d' },
  { value: 'no_visible_damage', label: 'Sin daño visible',  help: 'En pie, sin daño aparente',                         color: '#16a34a' },
  { value: 'unknown',           label: 'Desconocido',       help: 'Sin evaluar todavía',                               color: '#9ca3af' },
];

export const DAMAGE_BY_VALUE: Record<DamageLevel, (typeof DAMAGE_LEVELS)[number]> =
  Object.fromEntries(DAMAGE_LEVELS.map((d) => [d.value, d])) as never;

export const PEOPLE_STATUS: { value: PeopleStatus; label: string; urgent?: boolean }[] = [
  { value: 'confirmed_trapped', label: 'Personas atrapadas (confirmado)', urgent: true },
  { value: 'possible',          label: 'Posibles personas dentro' },
  { value: 'none_reported',     label: 'Sin personas reportadas' },
  { value: 'unknown',           label: 'Se desconoce' },
];

export const PEOPLE_BY_VALUE: Record<PeopleStatus, (typeof PEOPLE_STATUS)[number]> =
  Object.fromEntries(PEOPLE_STATUS.map((p) => [p.value, p])) as never;

export const PLACARDS: Record<Placard, { label: string; color: string }> = {
  none:              { label: 'Sin inspección oficial', color: '#9ca3af' },
  green_inspected:   { label: 'Verde — Inspeccionado, habitable', color: '#16a34a' },
  yellow_restricted: { label: 'Amarillo — Acceso restringido', color: '#f59e0b' },
  red_unsafe:        { label: 'Rojo — Inseguro, no entrar', color: '#dc2626' },
};

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  not_requested: 'Sin solicitar',
  requested:     'Inspección solicitada',
  claimed:       'Inspector asignado',
  assessed:      'Evaluado',
};

// Affected states (estados). Used by the report form dropdown.
export const ESTADOS = [
  'Distrito Capital', 'La Guaira', 'Miranda', 'Aragua', 'Carabobo',
  'Trujillo', 'Yaracuy', 'Falcón', 'Lara', 'Otro',
] as const;

export function damageColor(level: DamageLevel): string {
  return DAMAGE_BY_VALUE[level]?.color ?? '#9ca3af';
}
