'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';

const STR = {
  es: { close_menu: 'Cerrar menú', open_menu: 'Abrir menú' },
  en: { close_menu: 'Close menu',  open_menu: 'Open menu'  },
} as const;

interface NavItem {
  href: string;
  label: string;
}

export function MobileNav({ nav }: { nav: NavItem[] }) {
  const locale = useLocale();
  const s = STR[locale];
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? s.close_menu : s.open_menu}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        {open ? (
          /* X icon */
          <svg
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          /* Hamburger icon */
          <svg
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="mobile-menu"
          role="menu"
          className="absolute right-0 top-full mt-2 w-52 origin-top-right rounded-xl border border-black/10 bg-white shadow-lg ring-1 ring-black/5 dark:border-white/10 dark:bg-zinc-900 dark:ring-white/5"
        >
          <nav className="flex flex-col py-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-zinc-700 transition-colors hover:bg-black/5 hover:text-black dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
