// =====================================================================
// DAMAGE TAXONOMY — the single most user-facing classification in the app.
// Drives the map legend, marker colors, and the report form simultaneously.
// This is a DOMAIN/POLICY decision: adjust labels, order, and colors here
// and the whole UI follows. Order is most-severe → least-severe.
// Labels are bilingual ({es,en}); render them with tr(label, locale) or the
// accessor helpers at the bottom of this file.
// =====================================================================

import { tr, type Bilingual, type Locale } from './i18n';

export type DamageLevel =
  | 'collapsed' | 'severe' | 'moderate' | 'minor' | 'no_visible_damage' | 'unknown';

export type PeopleStatus =
  | 'confirmed_trapped' | 'possible' | 'none_reported' | 'unknown';

export type Placard = 'none' | 'green_inspected' | 'yellow_restricted' | 'red_unsafe';

export type InspectionStatus = 'not_requested' | 'requested' | 'claimed' | 'assessed';

export const DAMAGE_LEVELS: {
  value: DamageLevel; label: Bilingual; help: Bilingual; color: string;
}[] = [
  { value: 'collapsed',         label: { es: 'Colapsado',        en: 'Collapsed' },        help: { es: 'Derrumbe total o casi total',                       en: 'Total or near-total collapse' },                        color: '#7f1d1d' },
  { value: 'severe',            label: { es: 'Daño severo',      en: 'Severe damage' },    help: { es: 'Falla estructural — no entrar',                     en: 'Structural failure — do not enter' },                   color: '#dc2626' },
  { value: 'moderate',          label: { es: 'Daño moderado',    en: 'Moderate damage' },  help: { es: 'Grietas importantes — inspeccionar antes de entrar', en: 'Major cracks — inspect before entering' },              color: '#f59e0b' },
  { value: 'minor',             label: { es: 'Daño leve',        en: 'Minor damage' },     help: { es: 'Grietas cosméticas — probablemente habitable',      en: 'Cosmetic cracks — likely habitable' },                  color: '#fcd34d' },
  { value: 'no_visible_damage', label: { es: 'Sin daño visible', en: 'No visible damage' }, help: { es: 'En pie, sin daño aparente',                        en: 'Standing, no apparent damage' },                        color: '#16a34a' },
  { value: 'unknown',           label: { es: 'Desconocido',      en: 'Unknown' },          help: { es: 'Sin evaluar todavía',                              en: 'Not yet assessed' },                                    color: '#9ca3af' },
];

export const DAMAGE_BY_VALUE: Record<DamageLevel, (typeof DAMAGE_LEVELS)[number]> =
  Object.fromEntries(DAMAGE_LEVELS.map((d) => [d.value, d])) as never;

export const PEOPLE_STATUS: { value: PeopleStatus; label: Bilingual; urgent?: boolean }[] = [
  { value: 'confirmed_trapped', label: { es: 'Personas atrapadas (confirmado)', en: 'People trapped (confirmed)' }, urgent: true },
  { value: 'possible',          label: { es: 'Posibles personas dentro',         en: 'Possible people inside' } },
  { value: 'none_reported',     label: { es: 'Sin personas reportadas',          en: 'No people reported' } },
  { value: 'unknown',           label: { es: 'Se desconoce',                     en: 'Unknown' } },
];

export const PEOPLE_BY_VALUE: Record<PeopleStatus, (typeof PEOPLE_STATUS)[number]> =
  Object.fromEntries(PEOPLE_STATUS.map((p) => [p.value, p])) as never;

export const PLACARDS: Record<Placard, { label: Bilingual; color: string }> = {
  none:              { label: { es: 'Sin inspección oficial',              en: 'No official inspection' },        color: '#9ca3af' },
  green_inspected:   { label: { es: 'Verde — Inspeccionado, habitable',    en: 'Green — Inspected, habitable' },   color: '#16a34a' },
  yellow_restricted: { label: { es: 'Amarillo — Acceso restringido',       en: 'Yellow — Restricted access' },     color: '#f59e0b' },
  red_unsafe:        { label: { es: 'Rojo — Inseguro, no entrar',          en: 'Red — Unsafe, do not enter' },     color: '#dc2626' },
};

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, Bilingual> = {
  not_requested: { es: 'Sin solicitar',          en: 'Not requested' },
  requested:     { es: 'Inspección solicitada',  en: 'Inspection requested' },
  claimed:       { es: 'Inspector asignado',     en: 'Inspector assigned' },
  assessed:      { es: 'Evaluado',               en: 'Assessed' },
};

// Affected states (estados). Proper place names — not translated.
export const ESTADOS = [
  'Distrito Capital', 'La Guaira', 'Miranda', 'Aragua', 'Carabobo',
  'Trujillo', 'Yaracuy', 'Falcón', 'Lara', 'Otro',
] as const;

export function damageColor(level: DamageLevel): string {
  return DAMAGE_BY_VALUE[level]?.color ?? '#9ca3af';
}

// ---- Locale accessor helpers ---------------------------------------
export const damageLabel = (level: DamageLevel, locale: Locale): string =>
  DAMAGE_BY_VALUE[level] ? tr(DAMAGE_BY_VALUE[level].label, locale) : tr(DAMAGE_BY_VALUE.unknown.label, locale);
export const damageHelp = (level: DamageLevel, locale: Locale): string =>
  DAMAGE_BY_VALUE[level] ? tr(DAMAGE_BY_VALUE[level].help, locale) : '';
export const peopleLabel = (status: PeopleStatus, locale: Locale): string =>
  PEOPLE_BY_VALUE[status] ? tr(PEOPLE_BY_VALUE[status].label, locale) : tr(PEOPLE_BY_VALUE.unknown.label, locale);
export const placardLabel = (placard: Placard, locale: Locale): string =>
  PLACARDS[placard] ? tr(PLACARDS[placard].label, locale) : tr(PLACARDS.none.label, locale);
export const inspectionStatusLabel = (status: InspectionStatus, locale: Locale): string =>
  INSPECTION_STATUS_LABEL[status] ? tr(INSPECTION_STATUS_LABEL[status], locale) : '';
