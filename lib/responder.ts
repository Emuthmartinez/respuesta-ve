// Labels + option lists for the responder / inspection surfaces (ES/EN).
// Labels are bilingual ({es,en}); render with tr(label, locale).
import { tr, type Bilingual, type Locale } from './i18n';
import { ESTADOS } from './taxonomy';

export { ESTADOS };

export const CREDENTIAL_TYPES: { value: string; label: Bilingual }[] = [
  { value: 'structural_engineer', label: { es: 'Ingeniero(a) estructural', en: 'Structural engineer' } },
  { value: 'civil_engineer', label: { es: 'Ingeniero(a) civil', en: 'Civil engineer' } },
  { value: 'architect', label: { es: 'Arquitecto(a)', en: 'Architect' } },
  { value: 'search_and_rescue', label: { es: 'Búsqueda y rescate', en: 'Search and rescue' } },
  { value: 'medical', label: { es: 'Personal médico', en: 'Medical personnel' } },
  { value: 'firefighter', label: { es: 'Bombero(a)', en: 'Firefighter' } },
  { value: 'civil_protection', label: { es: 'Protección Civil', en: 'Civil Protection' } },
  { value: 'other', label: { es: 'Otro', en: 'Other' } },
];

export const CREDENTIAL_LABEL: Record<string, Bilingual> = Object.fromEntries(
  CREDENTIAL_TYPES.map((c) => [c.value, c.label]),
);
export const credentialLabel = (value: string, locale: Locale): string =>
  CREDENTIAL_LABEL[value] ? tr(CREDENTIAL_LABEL[value], locale) : value;

export const VERIFICATION_LABEL: Record<string, Bilingual> = {
  pending: { es: 'En revisión', en: 'Under review' },
  verified: { es: 'Verificado', en: 'Verified' },
  rejected: { es: 'Rechazado', en: 'Rejected' },
};
export const verificationLabel = (value: string, locale: Locale): string =>
  VERIFICATION_LABEL[value] ? tr(VERIFICATION_LABEL[value], locale) : value;

export const TIER_LABEL: Record<string, Bilingual> = {
  provisional: { es: 'Provisional', en: 'Provisional' },
  verified: { es: 'Verificado', en: 'Verified' },
  senior: { es: 'Coordinador', en: 'Coordinator' },
};
export const tierLabel = (value: string, locale: Locale): string =>
  TIER_LABEL[value] ? tr(TIER_LABEL[value], locale) : value;

export const NEEDS_TYPES: { value: string; label: Bilingual }[] = [
  { value: 'structural_safety', label: { es: 'Seguridad estructural', en: 'Structural safety' } },
  { value: 'reentry_clearance', label: { es: 'Autorización de reingreso', en: 'Re-entry clearance' } },
  { value: 'search_and_rescue_support', label: { es: 'Apoyo de búsqueda y rescate', en: 'Search and rescue support' } },
  { value: 'utilities_assessment', label: { es: 'Evaluación de servicios', en: 'Utilities assessment' } },
];
export const NEEDS_LABEL: Record<string, Bilingual> = Object.fromEntries(
  NEEDS_TYPES.map((n) => [n.value, n.label]),
);
export const needsLabel = (value: string, locale: Locale): string =>
  NEEDS_LABEL[value] ? tr(NEEDS_LABEL[value], locale) : value;

export const URGENCY: { value: string; label: Bilingual; color: string }[] = [
  { value: 'critical', label: { es: 'Crítica', en: 'Critical' }, color: '#7f1d1d' },
  { value: 'high', label: { es: 'Alta', en: 'High' }, color: '#dc2626' },
  { value: 'normal', label: { es: 'Normal', en: 'Normal' }, color: '#f59e0b' },
  { value: 'low', label: { es: 'Baja', en: 'Low' }, color: '#16a34a' },
];
export const URGENCY_LABEL: Record<string, Bilingual> = Object.fromEntries(
  URGENCY.map((u) => [u.value, u.label]),
);
export const URGENCY_COLOR: Record<string, string> = Object.fromEntries(
  URGENCY.map((u) => [u.value, u.color]),
);
export const urgencyLabel = (value: string, locale: Locale): string =>
  URGENCY_LABEL[value] ? tr(URGENCY_LABEL[value], locale) : value;

export const REQUEST_STATUS_LABEL: Record<string, Bilingual> = {
  submitted: { es: 'Recibida', en: 'Received' },
  triaged: { es: 'En cola', en: 'Queued' },
  claimed: { es: 'Asignada', en: 'Assigned' },
  in_progress: { es: 'En sitio', en: 'On site' },
  assessed: { es: 'Evaluada', en: 'Assessed' },
  closed: { es: 'Cerrada', en: 'Closed' },
  cancelled: { es: 'Cancelada', en: 'Cancelled' },
};
export const requestStatusLabel = (value: string, locale: Locale): string =>
  REQUEST_STATUS_LABEL[value] ? tr(REQUEST_STATUS_LABEL[value], locale) : value;

// ---- ATC-20 assessment options -------------------------------------
export const PLACARD_OPTIONS: { value: string; label: Bilingual; color: string }[] = [
  { value: 'green_inspected', label: { es: 'Verde — Inspeccionado (habitable)', en: 'Green — Inspected (habitable)' }, color: '#16a34a' },
  { value: 'yellow_restricted', label: { es: 'Amarillo — Acceso restringido', en: 'Yellow — Restricted access' }, color: '#f59e0b' },
  { value: 'red_unsafe', label: { es: 'Rojo — Inseguro (no entrar)', en: 'Red — Unsafe (do not enter)' }, color: '#dc2626' },
];

export const HAZARD_CATEGORIES: { key: string; label: Bilingual }[] = [
  { key: 'hazard_collapse', label: { es: 'Colapso', en: 'Collapse' } },
  { key: 'hazard_leaning', label: { es: 'Inclinación', en: 'Leaning' } },
  { key: 'hazard_racking', label: { es: 'Distorsión (racking)', en: 'Racking' } },
  { key: 'hazard_falling', label: { es: 'Caída de elementos', en: 'Falling elements' } },
  { key: 'hazard_geotechnical', label: { es: 'Geotécnico (suelo/talud)', en: 'Geotechnical (soil/slope)' } },
];
export const HAZARD_GRADES: { value: string; label: Bilingual }[] = [
  { value: 'none', label: { es: 'Ninguno', en: 'None' } },
  { value: 'minor', label: { es: 'Leve', en: 'Minor' } },
  { value: 'moderate', label: { es: 'Moderado', en: 'Moderate' } },
  { value: 'severe', label: { es: 'Severo', en: 'Severe' } },
];

export const DAMAGE_PCT = ['0-1', '1-10', '10-30', '30-60', '60-100'] as const;
