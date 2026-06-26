import React from 'react';

// Autolink URLs, emails and phone numbers inside coordinator-entered free text
// (e.g. center notes like "UNIDOS POR VENEZUELA drive · Fuente: https://…").
// Pure + hook-free, so it renders in both server and client components.

// Order matters: full URLs first, then emails, then bare domains. Bare-domain
// matching is intentionally limited to a TLD allow-list to avoid turning
// sentence fragments ("Cruz Roja, OMS…") into links. Fields here are
// coordinator-curated, so the false-positive risk is low.
const TOKEN =
  /((?:https?:\/\/|www\.)[^\s<]+|[^\s<@]+@[^\s<@]+\.[a-z]{2,}|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:org|com|net|edu|gov|io|co|info|app|ngo|int|ve|es|us|me)(?:\/[^\s<]*)?)/gi;

// Punctuation that commonly trails a URL in prose but isn't part of it.
const TRAILING = /[.,;:!?)\]}'"»]+$/;

const LINK_CLASS =
  'text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 break-words';

function nodesFor(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    const raw = m[0];
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));

    const trail = raw.match(TRAILING)?.[0] ?? '';
    const token = trail ? raw.slice(0, -trail.length) : raw;
    const isEmail = token.includes('@') && !token.includes('/');
    const href = isEmail
      ? `mailto:${token}`
      : token.startsWith('http')
        ? token
        : `https://${token}`;

    parts.push(
      <a
        key={key++}
        href={href}
        {...(isEmail ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        className={LINK_CLASS}
      >
        {token}
      </a>,
    );
    if (trail) parts.push(trail);
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Render free text with any URLs / emails turned into links. */
export function Linkify({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const text = children ?? '';
  if (!text) return null;
  const nodes = nodesFor(text);
  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>;
}

// A contact string is often just a phone number ("1-703-261-6456"). Render it
// as a tel: link; otherwise fall back to URL/email autolinking.
const PHONEISH = /^[+(]?[\d][\d\s().-]{5,}$/;

/** Render a contact value: tel: link for phone-like strings, else Linkify. */
export function ContactValue({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const v = value.trim();
  if (PHONEISH.test(v)) {
    const tel = v.replace(/[^\d+]/g, '');
    return (
      <a href={`tel:${tel}`} className={className ?? LINK_CLASS}>
        {v}
      </a>
    );
  }
  return <Linkify className={className}>{v}</Linkify>;
}
