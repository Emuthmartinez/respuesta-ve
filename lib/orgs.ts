// Labels for the donation directory (ES/EN).
// Labels are bilingual ({es,en}); render with tr(label, locale).
import { tr, type Bilingual, type Locale } from './i18n';

export const ORG_CATEGORY_LABEL: Record<string, Bilingual> = {
  emergency_relief: { es: 'Ayuda de emergencia', en: 'Emergency relief' },
  donation: { es: 'Donaciones', en: 'Donations' },
  food: { es: 'Alimentos', en: 'Food' },
  medical: { es: 'Médico', en: 'Medical' },
  find_people: { es: 'Buscar personas', en: 'Find people' },
  mental_health: { es: 'Salud mental', en: 'Mental health' },
  news_info: { es: 'Noticias', en: 'News' },
  shelter: { es: 'Refugio', en: 'Shelter' },
  legal: { es: 'Legal', en: 'Legal' },
  rescue: { es: 'Rescate', en: 'Rescue' },
  volunteer: { es: 'Voluntariado', en: 'Volunteering' },
  other: { es: 'Otro', en: 'Other' },
};
export const orgCategoryLabel = (value: string, locale: Locale): string =>
  ORG_CATEGORY_LABEL[value] ? tr(ORG_CATEGORY_LABEL[value], locale) : value;

export const ORG_SCOPE_LABEL: Record<string, Bilingual> = {
  internacional: { es: 'Internacional', en: 'International' },
  en_venezuela: { es: 'En Venezuela', en: 'In Venezuela' },
  ambos: { es: 'Internacional y local', en: 'International & local' },
};
export const orgScopeLabel = (value: string, locale: Locale): string =>
  ORG_SCOPE_LABEL[value] ? tr(ORG_SCOPE_LABEL[value], locale) : value;

export const DONATION_ITEMS: { value: string; label: Bilingual }[] = [
  { value: 'agua_potable', label: { es: 'Agua potable', en: 'Drinking water' } },
  { value: 'alimentos', label: { es: 'Alimentos no perecederos', en: 'Non-perishable food' } },
  { value: 'medicamentos', label: { es: 'Medicamentos / botiquín', en: 'Medicine / first-aid kit' } },
  { value: 'higiene', label: { es: 'Higiene personal', en: 'Personal hygiene' } },
  { value: 'panales', label: { es: 'Pañales', en: 'Diapers' } },
  { value: 'abrigo_carpas', label: { es: 'Mantas / carpas / abrigo', en: 'Blankets / tents / warm clothing' } },
  { value: 'herramientas_rescate', label: { es: 'Herramientas de rescate', en: 'Rescue tools' } },
  { value: 'energia', label: { es: 'Energía / iluminación', en: 'Power / lighting' } },
  { value: 'apoyo_psicosocial', label: { es: 'Apoyo psicosocial', en: 'Psychosocial support' } },
  { value: 'ropa', label: { es: 'Ropa / calzado', en: 'Clothing / footwear' } },
  { value: 'dinero', label: { es: 'Dinero', en: 'Money' } },
  { value: 'equipos_medicos', label: { es: 'Equipos médicos', en: 'Medical equipment' } },
  { value: 'otro', label: { es: 'Otro', en: 'Other' } },
];

export const DONATION_ITEM_LABEL: Record<string, Bilingual> = Object.fromEntries(
  DONATION_ITEMS.map((i) => [i.value, i.label]),
);
export const donationItemLabel = (value: string, locale: Locale): string =>
  DONATION_ITEM_LABEL[value] ? tr(DONATION_ITEM_LABEL[value], locale) : value;

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
