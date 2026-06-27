import type { Metadata } from 'next';
import { FederationNetwork } from '@/components/FederationNetwork';
import { getLocale } from '@/lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const es = locale === 'es';
  return {
    title: es ? 'Red federada · Respuesta VE' : 'Federation network · Respuesta VE',
    description: es
      ? 'Sitios y superficies que Respuesta VE apoya como backend de limpieza, deduplicación, normalización y sincronización humanitaria.'
      : 'Sites and surfaces powered by Respuesta VE as a backend for humanitarian cleanup, dedupe, normalization, and sync.',
    alternates: { canonical: '/red' },
  };
}

export default async function RedPage() {
  const locale = await getLocale();
  return <FederationNetwork locale={locale} variant="page" />;
}
