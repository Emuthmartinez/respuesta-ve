// Labels for the donation directory (es-VE).

export const ORG_CATEGORY_LABEL: Record<string, string> = {
  emergency_relief: 'Ayuda de emergencia',
  donation: 'Donaciones',
  food: 'Alimentos',
  medical: 'Médico',
  find_people: 'Buscar personas',
  mental_health: 'Salud mental',
  news_info: 'Noticias',
  shelter: 'Refugio',
  legal: 'Legal',
  rescue: 'Rescate',
  volunteer: 'Voluntariado',
  other: 'Otro',
};

export const ORG_SCOPE_LABEL: Record<string, string> = {
  internacional: 'Internacional',
  en_venezuela: 'En Venezuela',
  ambos: 'Internacional y local',
};

export const DONATION_ITEMS = [
  { value: 'agua_potable', label: 'Agua potable' },
  { value: 'alimentos', label: 'Alimentos no perecederos' },
  { value: 'medicamentos', label: 'Medicamentos / botiquín' },
  { value: 'higiene', label: 'Higiene personal' },
  { value: 'panales', label: 'Pañales' },
  { value: 'abrigo_carpas', label: 'Mantas / carpas / abrigo' },
  { value: 'herramientas_rescate', label: 'Herramientas de rescate' },
  { value: 'energia', label: 'Energía / iluminación' },
  { value: 'apoyo_psicosocial', label: 'Apoyo psicosocial' },
  { value: 'ropa', label: 'Ropa / calzado' },
  { value: 'dinero', label: 'Dinero' },
  { value: 'equipos_medicos', label: 'Equipos médicos' },
  { value: 'otro', label: 'Otro' },
] as const;

export const DONATION_ITEM_LABEL: Record<string, string> = Object.fromEntries(
  DONATION_ITEMS.map((i) => [i.value, i.label]),
);

export interface OrgPublic {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  website_url: string | null;
  donation_url: string | null;
  category: string;
  scope: string;
  is_in_country: boolean;
  verified: boolean;
}

export interface CenterPublic {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  contact_public_display: string | null;
  social_handle: string | null;
  hours_notes: string | null;
  accepts_items: string[] | null;
  priority_items: string[] | null;
  needs_notes: string | null;
  status: string;
  accepts_monetary: boolean;
  monetary_url: string | null;
}
