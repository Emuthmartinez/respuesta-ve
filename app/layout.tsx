import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Header } from '@/components/Header';
import { Disclaimer } from '@/components/Disclaimer';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { LocaleProvider } from '@/lib/locale-context';
import { CONTEXT_SCRIPT } from '@/lib/site-context';
import { getSupabasePublicConfig } from '@/lib/supabase/server';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://respuesta-ve.e-muth-martinez.workers.dev';
const DESC =
  'Backend federado y superficie pública de coordinación tras el terremoto en Venezuela: datos con procedencia, revisión, deduplicación, donaciones, ayuda mutua y búsqueda de personas.';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = t(locale).meta.default;
  const ogLocale = locale === 'en' ? 'en_US' : 'es_VE';
  const ogTitle = locale === 'en' ? 'Respuesta VE — Venezuela Earthquake 2026' : 'Respuesta VE — Terremoto Venezuela 2026';
  return {
    metadataBase: new URL(BASE),
    applicationName: 'Respuesta VE',
    title: m.title,
    description: m.description,
    keywords: [
      'terremoto Venezuela 2026', 'sismo Venezuela', 'mapa de daños', 'donar Venezuela',
      'centros de acopio Venezuela', 'personas desaparecidas Venezuela', 'La Guaira', 'Caracas',
      'ayuda humanitaria Venezuela', 'inspección estructural', 'Venezuela earthquake',
    ],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: 'Respuesta VE',
      locale: ogLocale,
      url: BASE,
      title: ogTitle,
      description: m.description,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: m.description,
      images: ['/og.png'],
    },
  };
}

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

// Inline script to apply dark/light class before first paint (prevents FOUC).
// Reads the 'theme' cookie; falls back to OS preference when absent.
const THEME_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);var t=c?c[1]:null;if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const d = t(locale);
  const supabaseConfig = getSupabasePublicConfig();
  const supabaseConfigScript = supabaseConfig
    ? `window.__RESPUESTA_SUPABASE_CONFIG__=${JSON.stringify(supabaseConfig).replace(/</g, '\\u003c')};`
    : null;

  // Read theme cookie server-side so the initial HTML class matches the cookie.
  const jar = await cookies();
  const themeCookie = jar.get('theme')?.value;
  const serverDark = themeCookie === 'dark' ? true : themeCookie === 'light' ? false : null;
  // null means "unknown at SSR time" — let the inline script decide.
  const htmlClass = `h-full antialiased${serverDark === true ? ' dark' : ''}`;

  return (
    <html lang={locale} className={htmlClass}>
      <head>
        {/* Must be first in <head> so they run before any CSS paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: CONTEXT_SCRIPT }} />
        {supabaseConfigScript && <script dangerouslySetInnerHTML={{ __html: supabaseConfigScript }} />}
      </head>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <LocaleProvider locale={locale}>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-black/10 px-4 py-6 text-xs text-zinc-500 dark:border-white/10">
            <div className="mx-auto max-w-6xl space-y-3">
              <Disclaimer locale={locale} />
              <p className="text-center">{d.footer.text}</p>
              <p className="text-center">
                <a href="/desarrolladores" className="font-medium text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-400">
                  {locale === 'en' ? 'Developer API · MCP' : 'API para desarrolladores · MCP'}
                </a>
                <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
                <a href="/red" className="font-medium text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-400">
                  {locale === 'en' ? 'Powered partner network' : 'Red de sitios conectados'}
                </a>
              </p>
            </div>
          </footer>
        </LocaleProvider>
      </body>
    </html>
  );
}
