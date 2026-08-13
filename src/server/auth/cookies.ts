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
