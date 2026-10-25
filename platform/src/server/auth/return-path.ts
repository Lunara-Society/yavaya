/**
 * Where to go once signed in. Someone who taps "Publica" or "Escribir al
 * vendedor" while signed out should land on that form after signing in, not
 * on the home page: until 25 October 2026 every sign-in ended on home or the
 * account page, so the intent was dropped at the moment it mattered most.
 *
 * Only a path on this site is honoured. `next` arrives in an address anyone
 * can write, and a sign-in page that forwards to another host is a phishing
 * kit; `//host` and `/\host` are other hosts to a browser, so neither passes.
 * The sign-in pages themselves are refused too: coming back to them after
 * signing in would only ask again.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value || !/^\/(?!\/)[\w\-./?=&%#]*$/.test(value)) return '/';
  if (/^\/(login|register)(?![\w-])/.test(value)) return '/';
  return value.slice(0, 200);
}

/** The sign-in (or registration) page, asked to come back to `next` afterwards. */
export function loginHref(next: string, page: '/login' | '/register' = '/login'): string {
  const path = safeNext(next);
  return path === '/' ? page : `${page}?next=${encodeURIComponent(path)}`;
}
