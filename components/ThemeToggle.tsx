'use client';

import { useLocale } from '@/lib/locale-context';

const STR = {
  es: { toggle_theme: 'Cambiar tema' },
  en: { toggle_theme: 'Toggle theme' },
} as const;

export function ThemeToggle() {
  const locale = useLocale();
  const s = STR[locale];

  function toggle() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    const next = isDark ? 'dark' : 'light';
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <button
      onClick={toggle}
      aria-label={s.toggle_theme}
      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
    >
      {/* Sun icon — shown in dark mode (click to go light) */}
      <svg
        className="hidden h-4 w-4 dark:block"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      {/* Moon icon — shown in light mode (click to go dark) */}
      <svg
        className="block h-4 w-4 dark:hidden"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
