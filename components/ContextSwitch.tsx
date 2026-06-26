'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSide, type Side } from '@/lib/site-context';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: { inside: 'En Venezuela', outside: 'Fuera', aria: 'Cambiar ubicación' },
  en: { inside: 'In Venezuela', outside: 'Outside', aria: 'Switch location' },
} as const;

// Segmented control reflecting the current audience context. The pre-paint
// script sets <html data-context>; we read it on mount (so the highlighted
// segment matches reality without a hydration mismatch). Switching updates
// localStorage + the attribute live, then routes to the matching hub.
export function ContextSwitch() {
  const locale = useLocale();
  const s = STR[locale];
  const router = useRouter();
  const [side, setSideState] = useState<Side>('dentro');

  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-context');
    setSideState(cur === 'fuera' ? 'fuera' : 'dentro');
  }, []);

  function pick(next: Side) {
    if (next === side) return;
    setSideState(next);
    setSide(next);
    router.push(next === 'fuera' ? '/afuera' : '/');
  }

  const base =
    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors';
  const active = 'bg-red-600 text-white';
  const idle =
    'text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white';

  return (
    <div
      role="group"
      aria-label={s.aria}
      className="flex items-center gap-0.5 rounded-full border border-black/10 p-0.5 dark:border-white/15"
    >
      <button type="button" onClick={() => pick('dentro')} className={`${base} ${side === 'dentro' ? active : idle}`}>
        {s.inside}
      </button>
      <button type="button" onClick={() => pick('fuera')} className={`${base} ${side === 'fuera' ? active : idle}`}>
        {s.outside}
      </button>
    </div>
  );
}
