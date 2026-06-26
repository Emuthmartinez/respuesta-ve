import { cookies } from 'next/headers';
import type { Locale } from './i18n';

/** Read locale from the 'locale' cookie (server-side, async). Defaults to 'es'. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const val = store.get('locale')?.value;
  return val === 'en' ? 'en' : 'es';
}
