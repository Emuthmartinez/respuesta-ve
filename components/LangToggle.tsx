'use client';

import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function switchTo(next: Locale) {
    document.cookie = `locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-black/10 px-1 py-0.5 text-xs dark:border-white/10">
      <button
        onClick={() => switchTo('es')}
        className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
          locale === 'es'
            ? 'bg-red-600 text-white'
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
        }`}
        aria-pressed={locale === 'es'}
      >
        ES
      </button>
      <button
        onClick={() => switchTo('en')}
        className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
          locale === 'en'
            ? 'bg-red-600 text-white'
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
        }`}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
