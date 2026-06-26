// Labels + option lists for the responder / inspection surfaces (es-VE).
import { ESTADOS } from './taxonomy';

export { ESTADOS };

export const CREDENTIAL_TYPES = [
  { value: 'structural_engineer', label: 'Ingeniero(a) estructural' },
  { value: 'civil_engineer', label: 'Ingeniero(a) civil' },
  { value: 'architect', label: 'Arquitecto(a)' },
  { value: 'search_and_rescue', label: 'Búsqueda y rescate' },
  { value: 'medical', label: 'Personal médico' },
  { value: 'firefighter', label: 'Bombero(a)' },
  { value: 'civil_protection', label: 'Protección Civil' },
  { value: 'other', label: 'Otro' },
] as const;

export const CREDENTIAL_LABEL: Record<string, string> = Object.fromEntries(
  CREDENTIAL_TYPES.map((c) => [c.value, c.label]),
);

export const VERIFICATION_LABEL: Record<string, string> = {
  pending: 'En revisión',
  verified: 'Verificado',
  rejected: 'Rechazado',
};

export const TIER_LABEL: Record<string, string> = {
  provisional: 'Provisional',
  verified: 'Verificado',
  senior: 'Coordinador',
};

export const NEEDS_TYPES = [
  { value: 'structural_safety', label: 'Seguridad estructural' },
  { value: 'reentry_clearance', label: 'Autorización de reingreso' },
  { value: 'search_and_rescue_support', label: 'Apoyo de búsqueda y rescate' },
  { value: 'utilities_assessment', label: 'Evaluación de servicios' },
] as const;
export const NEEDS_LABEL: Record<string, string> = Object.fromEntries(
  NEEDS_TYPES.map((n) => [n.value, n.label]),
);

export const URGENCY: { value: string; label: string; color: string }[] = [
  { value: 'critical', label: 'Crítica', color: '#7f1d1d' },
  { value: 'high', label: 'Alta', color: '#dc2626' },
  { value: 'normal', label: 'Normal', color: '#f59e0b' },
  { value: 'low', label: 'Baja', color: '#16a34a' },
];
export const URGENCY_LABEL: Record<string, string> = Object.fromEntries(
  URGENCY.map((u) => [u.value, u.label]),
);
export const URGENCY_COLOR: Record<string, string> = Object.fromEntries(
  URGENCY.map((u) => [u.value, u.color]),
);

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  submitted: 'Recibida',
  triaged: 'En cola',
  claimed: 'Asignada',
  in_progress: 'En sitio',
  assessed: 'Evaluada',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

// ---- ATC-20 assessment options -------------------------------------
export const PLACARD_OPTIONS = [
  { value: 'green_inspected', label: 'Verde — Inspeccionado (habitable)', color: '#16a34a' },
  { value: 'yellow_restricted', label: 'Amarillo — Acceso restringido', color: '#f59e0b' },
  { value: 'red_unsafe', label: 'Rojo — Inseguro (no entrar)', color: '#dc2626' },
] as const;

export const HAZARD_CATEGORIES = [
  { key: 'hazard_collapse', label: 'Colapso' },
  { key: 'hazard_leaning', label: 'Inclinación' },
  { key: 'hazard_racking', label: 'Distorsión (racking)' },
  { key: 'hazard_falling', label: 'Caída de elementos' },
  { key: 'hazard_geotechnical', label: 'Geotécnico (suelo/talud)' },
] as const;
export const HAZARD_GRADES = [
  { value: 'none', label: 'Ninguno' },
  { value: 'minor', label: 'Leve' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'severe', label: 'Severo' },
] as const;

export const DAMAGE_PCT = ['0-1', '1-10', '10-30', '30-60', '60-100'] as const;
