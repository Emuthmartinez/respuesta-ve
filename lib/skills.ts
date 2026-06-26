// Skill categories for the skills<->needs marketplace (ES/EN).
// `high` = high-stakes → requires coordinator credential verification before
// the offer is public and before it can be matched.
// Labels are bilingual ({es,en}); render with tr(label, locale).
import { tr, type Bilingual, type Locale } from './i18n';

export const SKILL_CATEGORIES: { value: string; label: Bilingual; high: boolean }[] = [
  { value: 'structural_engineer', label: { es: 'Ingeniero(a) estructural', en: 'Structural engineer' }, high: true },
  { value: 'civil_engineer', label: { es: 'Ingeniero(a) civil', en: 'Civil engineer' }, high: true },
  { value: 'architect', label: { es: 'Arquitecto(a)', en: 'Architect' }, high: true },
  { value: 'medical_doctor', label: { es: 'Médico(a)', en: 'Doctor' }, high: true },
  { value: 'nurse', label: { es: 'Enfermero(a)', en: 'Nurse' }, high: true },
  { value: 'psychologist', label: { es: 'Psicólogo(a)', en: 'Psychologist' }, high: true },
  { value: 'therapist', label: { es: 'Terapeuta / apoyo psicosocial', en: 'Therapist / psychosocial support' }, high: true },
  { value: 'search_and_rescue', label: { es: 'Búsqueda y rescate', en: 'Search and rescue' }, high: true },
  { value: 'firefighter', label: { es: 'Bombero(a)', en: 'Firefighter' }, high: false },
  { value: 'driver_logistics', label: { es: 'Transporte / logística', en: 'Transport / logistics' }, high: false },
  { value: 'translator', label: { es: 'Traductor(a) / intérprete', en: 'Translator / interpreter' }, high: false },
  { value: 'legal', label: { es: 'Apoyo legal', en: 'Legal support' }, high: false },
  { value: 'electrician', label: { es: 'Electricista', en: 'Electrician' }, high: false },
  { value: 'plumber', label: { es: 'Plomero(a)', en: 'Plumber' }, high: false },
  { value: 'childcare', label: { es: 'Cuidado de niños', en: 'Childcare' }, high: true },
  { value: 'it_comms', label: { es: 'IT / comunicaciones', en: 'IT / communications' }, high: false },
  { value: 'shelter_host', label: { es: 'Hospedaje / refugio', en: 'Lodging / shelter' }, high: true },
  { value: 'volunteer_general', label: { es: 'Voluntariado general', en: 'General volunteering' }, high: false },
  { value: 'other', label: { es: 'Otro', en: 'Other' }, high: false },
];

export const SKILL_LABEL: Record<string, Bilingual> = Object.fromEntries(
  SKILL_CATEGORIES.map((s) => [s.value, s.label]),
);
export const skillLabel = (value: string, locale: Locale): string =>
  SKILL_LABEL[value] ? tr(SKILL_LABEL[value], locale) : value;
export const HIGH_STAKES = new Set<string>(SKILL_CATEGORIES.filter((s) => s.high).map((s) => s.value));

export const URGENCY_OPTS: { value: string; label: Bilingual }[] = [
  { value: 'critical', label: { es: 'Crítica', en: 'Critical' } },
  { value: 'high', label: { es: 'Alta', en: 'High' } },
  { value: 'normal', label: { es: 'Normal', en: 'Normal' } },
  { value: 'low', label: { es: 'Baja', en: 'Low' } },
];

export const REQUEST_STATUS_SKILLS: Record<string, Bilingual> = {
  open: { es: 'Abierta — buscando ayuda', en: 'Open — seeking help' },
  matched: { es: 'Asignada — un coordinador te conectará', en: 'Matched — a coordinator will connect you' },
  in_progress: { es: 'En progreso', en: 'In progress' },
  fulfilled: { es: 'Atendida', en: 'Fulfilled' },
  cancelled: { es: 'Cancelada', en: 'Cancelled' },
  expired: { es: 'Expirada', en: 'Expired' },
};
export const requestStatusSkills = (value: string, locale: Locale): string =>
  REQUEST_STATUS_SKILLS[value] ? tr(REQUEST_STATUS_SKILLS[value], locale) : value;

/** @deprecated use REQUEST_STATUS_SKILLS / requestStatusSkills. Kept for ES fallback. */
export const REQUEST_STATUS_ES: Record<string, string> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_SKILLS).map(([k, v]) => [k, v.es]),
);
