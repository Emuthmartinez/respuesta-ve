import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';

export function Principles({ locale }: { locale: Locale }) {
  const d = t(locale);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <h2 className="text-lg font-semibold">{d.principles.heading}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {d.principles.items.map((p) => {
          const body = (
            <>
              <div className="text-2xl" aria-hidden>{p.icon}</div>
              <div className="mt-2 text-sm font-semibold">{p.title}</div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{p.text}</p>
              {'cta' in p && p.cta && (
                <span className="mt-2 inline-block text-xs font-medium text-red-600">{p.cta}</span>
              )}
            </>
          );
          return 'href' in p && p.href ? (
            <Link key={p.title} href={p.href}
              className="rounded-lg border border-black/10 p-4 transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
              {body}
            </Link>
          ) : (
            <div key={p.title} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
