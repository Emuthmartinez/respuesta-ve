'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { CONTEXT_KEY, setSide } from '@/lib/site-context';

// First-visit gate: "¿Estás dentro o fuera de Venezuela?" — purely client-side
// (localStorage), never sent to the server. Protects diaspora users who may
// have fled persecution. Choosing "fuera" routes to the donation hub. The
// choice also drives the audience-specific nav (see lib/site-context).
export function LocationGate({ locale }: { locale: Locale }) {
  const [show, setShow] = useState(false);
  const router = useRouter();
  const d = t(locale).gate;

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONTEXT_KEY)) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  function choose(side: 'dentro' | 'fuera') {
    setSide(side);
    setShow(false);
    if (side === 'fuera') router.push('/afuera');
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-4 text-center text-white">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className="inline-block h-3 w-3 rounded-full bg-red-600" /> {d.brand_label}
      </div>
      <h1 className="mt-6 max-w-lg text-2xl font-bold sm:text-3xl">{d.heading}</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-400">
        {d.subtext}
      </p>
      <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <button
          onClick={() => choose('dentro')}
          className="flex-1 rounded-xl bg-red-600 px-6 py-5 text-base font-semibold hover:bg-red-700"
        >
          {d.inside_btn}
          <span className="mt-1 block text-xs font-normal text-red-100">
            {d.inside_sub}
          </span>
        </button>
        <button
          onClick={() => choose('fuera')}
          className="flex-1 rounded-xl border border-white/25 px-6 py-5 text-base font-semibold hover:bg-white/10"
        >
          {d.outside_btn}
          <span className="mt-1 block text-xs font-normal text-zinc-400">
            {d.outside_sub}
          </span>
        </button>
      </div>
    </div>
  );
}
