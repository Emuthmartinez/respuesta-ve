const DEFAULT_AUTH_NEXT = '/voluntarios';

const AUTH_FALLBACK_BY_NEXT = new Map([
  ['/desarrolladores/claves', '/desarrolladores/acceder'],
]);

// Validates a post-login destination. Only same-origin *relative* paths are
// allowed — the open-redirect guard for the sign-in flow. Absolute
// (`https://…`), protocol-relative (`//host`), and backslash-tricked
// (`/\host`) values fall back to DEFAULT_AUTH_NEXT. A relative-path rule rather
// than a fixed allowlist lets any internal page be a return target, including
// dynamic routes like /voluntarios/evaluar/[id].
export function normalizeAuthNext(rawNext?: string | null) {
  if (!rawNext || !rawNext.startsWith('/')) return DEFAULT_AUTH_NEXT;
  if (rawNext.startsWith('//') || rawNext.startsWith('/\\')) return DEFAULT_AUTH_NEXT;
  return rawNext;
}

export function authFallbackForNext(nextPath: string) {
  return AUTH_FALLBACK_BY_NEXT.get(nextPath) ?? '/voluntarios';
}

export function withAuthError(path: string, error = 'auth') {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}error=${encodeURIComponent(error)}`;
}
