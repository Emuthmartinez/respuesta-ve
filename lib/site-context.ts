// Audience context: is the visitor inside Venezuela ("dentro") or abroad
// ("fuera")? Chosen once via the LocationGate and kept ONLY in localStorage —
// never a cookie — so the choice is never sent to any server. This protects
// diaspora users who may have fled persecution. The nav adapts to this value
// purely on the client (CSS driven by [data-context] on <html>).

export const CONTEXT_KEY = 'respuesta_ve_context';

export type Side = 'dentro' | 'fuera';

// Pre-paint inline script (mirrors THEME_SCRIPT in layout.tsx). Runs before
// first paint to set <html data-context>, so the audience-specific nav renders
// correctly with no flash and no hydration mismatch. Defaults to "dentro".
export const CONTEXT_SCRIPT = `(function(){try{var r=localStorage.getItem('${CONTEXT_KEY}');var s=r?(JSON.parse(r)||{}).side:null;document.documentElement.setAttribute('data-context',s==='fuera'?'fuera':'dentro');}catch(e){document.documentElement.setAttribute('data-context','dentro');}})();`;

/** Persist a context choice and apply it live (no reload needed). */
export function setSide(side: Side): void {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({ side, set_at: Date.now() }));
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-context', side);
  }
}
