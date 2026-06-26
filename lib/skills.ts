// Skill categories for the skills<->needs marketplace (es-VE).
// `high` = high-stakes → requires coordinator credential verification before
// the offer is public and before it can be matched.
export const SKILL_CATEGORIES = [
  { value: 'structural_engineer', label: 'Ingeniero(a) estructural', high: true },
  { value: 'civil_engineer', label: 'Ingeniero(a) civil', high: true },
  { value: 'architect', label: 'Arquitecto(a)', high: true },
  { value: 'medical_doctor', label: 'Médico(a)', high: true },
  { value: 'nurse', label: 'Enfermero(a)', high: true },
  { value: 'psychologist', label: 'Psicólogo(a)', high: true },
  { value: 'therapist', label: 'Terapeuta / apoyo psicosocial', high: true },
  { value: 'search_and_rescue', label: 'Búsqueda y rescate', high: true },
  { value: 'firefighter', label: 'Bombero(a)', high: false },
  { value: 'driver_logistics', label: 'Transporte / logística', high: false },
  { value: 'translator', label: 'Traductor(a) / intérprete', high: false },
  { value: 'legal', label: 'Apoyo legal', high: false },
  { value: 'electrician', label: 'Electricista', high: false },
  { value: 'plumber', label: 'Plomero(a)', high: false },
  { value: 'childcare', label: 'Cuidado de niños', high: true },
  { value: 'it_comms', label: 'IT / comunicaciones', high: false },
  { value: 'shelter_host', label: 'Hospedaje / refugio', high: true },
  { value: 'volunteer_general', label: 'Voluntariado general', high: false },
  { value: 'other', label: 'Otro', high: false },
] as const;

export const SKILL_LABEL: Record<string, string> = Object.fromEntries(
  SKILL_CATEGORIES.map((s) => [s.value, s.label]),
);
export const HIGH_STAKES = new Set<string>(SKILL_CATEGORIES.filter((s) => s.high).map((s) => s.value));

export const URGENCY_OPTS = [
  { value: 'critical', label: 'Crítica' },
  { value: 'high', label: 'Alta' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Baja' },
];

export const REQUEST_STATUS_ES: Record<string, string> = {
  open: 'Abierta — buscando ayuda',
  matched: 'Asignada — un coordinador te conectará',
  in_progress: 'En progreso',
  fulfilled: 'Atendida',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};
