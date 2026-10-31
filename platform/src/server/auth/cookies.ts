import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_RULES } from '@/config/business-rules';
import { serverEnv } from '@/config/env';

/**
 * Session cookie handling.
 *
 * `httpOnly` keeps the token out of JavaScript, so an XSS bug cannot read it.
 * `sameSite: lax` blocks cross-site form submissions from carrying it while
 * still allowing ordinary top-level navigation back into Yavaya.
 * `secure` is on everywhere except local development over plain HTTP.
 *
 * The cookie lives until the session's absolute expiry. The idle window is
 * enforced by the server, which extends it on activity; a cookie that expired
 * on its own after two hours would sign out someone who was still using the
 * site, because the browser cannot see that activity moved the window.
 */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_RULES.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv().APP_ENV !== 'local',
    path: '/',
    expires: expiresAt,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_RULES.cookieName)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_RULES.cookieName);
}

/**
 * The answer to "Mantener mi sesión iniciada", taken once by whichever sign-in
 * finishes. The box writes it as a short-lived cookie in the browser, so it
 * survives the trip through Google or the two-step code page. It is only a
 * preference: all it can do is lengthen the idle window of a session the
 * person is opening themselves.
 */
export async function takeRememberChoice(): Promise<boolean> {
  const store = await cookies();
  const chosen = store.get(SESSION_RULES.rememberCookie)?.value === '1';
  if (store.has(SESSION_RULES.rememberCookie)) store.delete(SESSION_RULES.rememberCookie);
  return chosen;
}
