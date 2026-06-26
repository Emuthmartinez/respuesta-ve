import Link from 'next/link';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { LangToggle } from '@/components/LangToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileNav } from '@/components/MobileNav';

export async function Header() {
  const locale = await getLocale();
  const d = t(locale);

  const NAV = [
    { href: '/', label: d.nav.map },
    { href: '/reportar', label: d.nav.report },
    { href: '/afuera', label: d.nav.donate },
    { href: '/intercambio', label: d.nav.exchange },
    { href: '/recursos', label: d.nav.resources },
    { href: '/personas', label: d.nav.people },
    { href: '/desmentidos', label: d.nav.debunks },
    { href: '/voluntarios', label: d.nav.volunteers },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
          <span>{d.nav.brand}</span>
          <span className="hidden text-xs font-normal text-zinc-500 sm:inline">
            {d.nav.tagline}
          </span>
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-2 py-1 text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {n.label}
            </Link>
          ))}
          <LangToggle locale={locale} />
          <ThemeToggle />
        </nav>

        {/* Mobile right side: toggles + hamburger */}
        <div className="flex items-center gap-1 lg:hidden">
          <LangToggle locale={locale} />
          <ThemeToggle />
          <MobileNav nav={NAV} />
        </div>
      </div>
    </header>
  );
}
