import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { t, type Dict, type Locale } from './i18n';

/** Read locale from the 'locale' cookie (server-side, async). Defaults to 'es'. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const val = store.get('locale')?.value;
  return val === 'en' ? 'en' : 'es';
}

/**
 * Locale-aware page metadata. Use in App Router pages:
 *   export const generateMetadata = () => metaFor('afuera');
 * Reads the active locale and returns the matching title/description from the
 * central `meta` dictionary, so browser titles + share previews are bilingual.
 */
export async function metaFor(key: keyof Dict['meta']): Promise<Metadata> {
  const locale = await getLocale();
  const m = t(locale).meta[key] as { title: string; description?: string };
  return { title: m.title, description: m.description };
}
