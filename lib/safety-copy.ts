// Non-negotiable anti-scam / safety copy (ES/EN). Kept in one place so the
// wording is consistent and reviewable. Disasters attract fraud — these are
// always-visible warnings, not dismissible nags.
// Render with tr(SAFETY_COPY.x, locale) or the safetyCopy(locale) accessor.
import { tr, type Bilingual, type Locale } from './i18n';

export const SAFETY_COPY: Record<'donation' | 'scamWarning' | 'skills', Bilingual> = {
  donation: {
    es: 'Nunca dones por transferencia a cuentas personales, tarjetas de regalo ni criptomonedas. Las organizaciones legítimas usan plataformas de donación establecidas.',
    en: 'Never donate via wire transfer to personal accounts, gift cards, or cryptocurrency. Legitimate organizations use established donation platforms.',
  },
  scamWarning: {
    es: 'Los estafadores crean cuentas nuevas con nombres casi idénticos a organizaciones reales. Verifica que la organización aparezca en esta lista antes de donar.',
    en: 'Scammers create new accounts with names nearly identical to real organizations. Verify the organization appears in this list before donating.',
  },
  skills: {
    es: 'El contacto es anónimo y mediado. Nunca compartas tu número de teléfono, cédula ni dirección exacta en los mensajes.',
    en: 'Contact is anonymous and mediated. Never share your phone number, national ID, or exact address in messages.',
  },
};

export const safetyCopy = (locale: Locale) => ({
  donation: tr(SAFETY_COPY.donation, locale),
  scamWarning: tr(SAFETY_COPY.scamWarning, locale),
  skills: tr(SAFETY_COPY.skills, locale),
});

export const EMERGENCY_NUMBERS: { label: string; note: Bilingual; tel: string }[] = [
  { label: '911', note: { es: 'Movistar', en: 'Movistar' }, tel: '911' },
  { label: '112', note: { es: 'Digitel', en: 'Digitel' }, tel: '112' },
  { label: '*1', note: { es: 'Movilnet', en: 'Movilnet' }, tel: '*1' },
  { label: '171', note: { es: 'CANTV fijo', en: 'CANTV landline' }, tel: '171' },
];
