'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: {
    title: 'Guarda este enlace',
    body: 'Es la única forma de ver el estado de tu envío o retirarlo más tarde. No requiere cuenta. No lo compartas.',
    copy: 'Copiar enlace',
    copied: '¡Copiado!',
    open: 'Gestionar ahora',
  },
  en: {
    title: 'Save this link',
    body: 'It is the only way to check your submission or withdraw it later. No account needed. Do not share it.',
    copy: 'Copy link',
    copied: 'Copied!',
    open: 'Manage now',
  },
} as const;

// Shown on a submit success screen. Renders the private /gestionar/<token>
// link (the submitter's only handle to manage/retract their content).
export function ManageLink({ token }: { token: string }) {
  const locale = useLocale();
  const s = STR[locale];
  const [copied, setCopied] = useState(false);
  const path = `/gestionar/${token}`;
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the visible link is still usable */
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-900/60 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{s.title}</p>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/90">{s.body}</p>
      <code className="mt-2 block truncate rounded-md bg-white/70 px-2 py-1.5 text-xs text-zinc-700 dark:bg-black/30 dark:text-zinc-300">
        {path}
      </code>
      <div className="mt-3 flex gap-2">
        <button
          onClick={copy}
          className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {copied ? s.copied : s.copy}
        </button>
        <a
          href={path}
          className="rounded-full border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          {s.open}
        </a>
      </div>
    </div>
  );
}
