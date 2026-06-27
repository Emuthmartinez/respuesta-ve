import Link from 'next/link';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { LangToggle } from '@/components/LangToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileNav, type NavItem } from '@/components/MobileNav';
import { ContextSwitch } from '@/components/ContextSwitch';

export async function Header() {
  const locale = await getLocale();
  const d = t(locale);

  // ctx 'in' = shown only to visitors in Venezuela, 'out' = only abroad,
  // undefined = both. Array order is display order; hidden items collapse.
  const NAV: NavItem[] = [
    { href: '/', label: d.nav.map, ctx: 'in' },
    { href: '/reportar', label: d.nav.report, ctx: 'in' },
    { href: '/recursos', label: d.nav.resources, ctx: 'in' },
    { href: '/intercambio', label: d.nav.exchange, ctx: 'in' },
    { href: '/afuera', label: d.nav.donate, ctx: 'out' },
    { href: '/personas', label: d.nav.people },
    { href: '/red', label: d.nav.network },
    { href: '/voluntarios', label: d.nav.volunteers },
    { href: '/desmentidos', label: d.nav.debunks },
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
              data-ctx={n.ctx}
              className="rounded-md px-2 py-1 text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {n.label}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/15" />
          <ContextSwitch />
          <LangToggle locale={locale} />
          <ThemeToggle />
        </nav>

        {/* Mobile right side: toggles + hamburger */}
        <div className="flex items-center gap-1 lg:hidden">
          <ContextSwitch />
          <LangToggle locale={locale} />
          <ThemeToggle />
          <MobileNav nav={NAV} />
        </div>
      </div>
    </header>
  );
}
