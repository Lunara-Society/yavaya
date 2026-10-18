import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_RULES } from '@/config/business-rules';
import { serverEnv } from '@/config/env';
import type { GoogleProfile } from '@/server/domains/identity/google';
import { seal, unseal } from './sealed';

/**
 * The three cookies of "Continuar con Google". All httpOnly: none of them is
 * any business of the page's JavaScript.
 *
 *   flow    — state, nonce and PKCE verifier for one round trip (10 minutes)
 *   signup  — the address Google confirmed, while a new member accepts the
 *             rules on the next page (15 minutes); sealed, since a forged one
 *             would claim any address
 *   hint    — which Google account last signed in here, so the next sign-in
 *             goes straight through; an opaque Google id, never shown
 */
const FLOW = 'yav_google_flow';
const SIGNUP = 'yav_google_signup';
const HINT = 'yav_google';

const base = () => ({ httpOnly: true, secure: serverEnv().APP_ENV !== 'local', sameSite: 'lax' as const });

export type GoogleFlow = { state: string; nonce: string; verifier: string; next: string; inviter?: string };
export type GoogleSignup = { profile: GoogleProfile; next: string; inviter?: string };

export async function startFlow(flow: GoogleFlow): Promise<void> {
  (await cookies()).set(FLOW, seal('google-flow', flow, 600), { ...base(), path: '/auth/google', maxAge: 600 });
}

export async function takeFlow(): Promise<GoogleFlow | null> {
  const store = await cookies();
  const value = store.get(FLOW)?.value;
  store.delete({ name: FLOW, path: '/auth/google' });
  return unseal<GoogleFlow>('google-flow', value);
}

export async function holdSignup(signup: GoogleSignup): Promise<void> {
  (await cookies()).set(SIGNUP, seal('google-signup', signup, 900), { ...base(), path: '/', maxAge: 900 });
}

export async function readSignup(): Promise<GoogleSignup | null> {
  return unseal<GoogleSignup>('google-signup', (await cookies()).get(SIGNUP)?.value);
}

export async function dropSignup(): Promise<void> {
  (await cookies()).delete(SIGNUP);
}

export async function rememberGoogle(subject: string): Promise<void> {
  (await cookies()).set(HINT, subject, { ...base(), path: '/', maxAge: SESSION_RULES.googleHintDays * 86_400 });
}

export async function googleHint(): Promise<string | null> {
  return (await cookies()).get(HINT)?.value ?? null;
}

export async function forgetGoogle(): Promise<void> {
  (await cookies()).delete(HINT);
}

/** A path on this site to return to; anything else (another host, `//x`) becomes home. */
export function safeNext(value: string | null | undefined): string {
  return value && /^\/(?!\/)[\w\-./?=&%#]*$/.test(value) ? value.slice(0, 200) : '/';
}
