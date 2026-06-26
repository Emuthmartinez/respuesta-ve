import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { Disclaimer } from '@/components/Disclaimer';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://respuesta-ve.e-muth-martinez.workers.dev';
const DESC =
  'Plataforma comunitaria de coordinación tras el terremoto en Venezuela: mapa de edificios dañados, inspección estructural, donaciones verificadas, ayuda mutua y búsqueda de personas.';

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  applicationName: 'Respuesta VE',
  title: 'Respuesta VE — Mapa de daños · Terremoto Venezuela 2026',
  description: DESC,
  keywords: [
    'terremoto Venezuela 2026', 'sismo Venezuela', 'mapa de daños', 'donar Venezuela',
    'centros de acopio Venezuela', 'personas desaparecidas Venezuela', 'La Guaira', 'Caracas',
    'ayuda humanitaria Venezuela', 'inspección estructural', 'Venezuela earthquake',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Respuesta VE',
    locale: 'es_VE',
    url: BASE,
    title: 'Respuesta VE — Terremoto Venezuela 2026',
    description: DESC,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Respuesta VE — Terremoto Venezuela 2026' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Respuesta VE — Terremoto Venezuela 2026',
    description: DESC,
    images: ['/og.png'],
  },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BASE}/#org`,
      name: 'Respuesta VE',
      url: BASE,
      description: DESC,
      logo: `${BASE}/og.png`,
      areaServed: { '@type': 'Country', name: 'Venezuela' },
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE}/#website`,
      url: BASE,
      name: 'Respuesta VE',
      inLanguage: ['es', 'en'],
      description: DESC,
      publisher: { '@id': `${BASE}/#org` },
    },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const d = t(locale);
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <Header />
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-black/10 px-4 py-6 text-xs text-zinc-500 dark:border-white/10">
          <div className="mx-auto max-w-6xl space-y-3">
            <Disclaimer locale={locale} />
            <p className="text-center">{d.footer.text}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
