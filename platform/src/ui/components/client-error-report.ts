/**
 * Sends one browser-side error to /api/client-errors, which forwards it to
 * Sentry from the server (src/instrumentation.ts explains why the browser SDK
 * is not used). The report is the error's name, its message, its stack and
 * the page's path — no cookie, no query string, nothing typed into a form.
 *
 * At most a few per page load, each distinct message once: a loop that throws
 * every frame must not become a flood from one phone.
 */

const MAX_PER_PAGE = 3;
const sent = new Set<string>();

/** Pages whose errors are not reported at all: nothing from Espacio Violeta leaves it. */
const SILENT = /^\/violeta(\/|$)/;

export function reportClientError(error: unknown, kind: 'boundary' | 'error' | 'rejection'): void {
  try {
    if (sent.size >= MAX_PER_PAGE) return;
    const path = window.location.pathname;
    if (SILENT.test(path)) return;
    const err = error instanceof Error ? error : null;
    const name = (err?.name || 'Error').slice(0, 80);
    const message = (err ? err.message : String(error)).slice(0, 500);
    if (!message || sent.has(name + message)) return;
    sent.add(name + message);
    const body = JSON.stringify({ kind, name, message, stack: (err?.stack ?? '').slice(0, 3000), path: path.slice(0, 200) });
    fetch('/api/client-errors', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
  } catch {
    // Reporting an error must never cause one.
  }
}
