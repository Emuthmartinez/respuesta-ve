'use client';

// Client-side locale context. The VALUE is supplied by the server root layout
// (which reads the 'locale' cookie via getLocale()), so the provider renders
// SSR-correct — no hydration flash for EN users — while still letting any
// nested client component read the locale without prop-drilling.
//
// Server components must keep using getLocale() from lib/i18n-server.ts.
// Client components anywhere under <LocaleProvider> can call useLocale().

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './i18n';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Read the active locale inside any client component. Defaults to 'es'. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
