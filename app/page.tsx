import Link from 'next/link';
import { DamageMap } from '@/components/DamageMap';
import { LocationGate } from '@/components/LocationGate';
import { Principles } from '@/components/Principles';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

export default async function Home() {
  const locale = await getLocale();
  const d = t(locale);

  return (
    <div className="flex flex-1 flex-col">
      <LocationGate locale={locale} />
      <section className="mx-auto w-full max-w-6xl px-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {d.home.heading}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              {d.home.subtext}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/reportar"
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {d.home.cta_report}
            </Link>
            <Link
              href="/voluntarios"
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {d.home.cta_volunteer}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 w-full max-w-6xl px-4 pb-4">
        <div className="h-[70vh] overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          <DamageMap />
        </div>
      </section>

      <Principles locale={locale} />
    </div>
  );
}
