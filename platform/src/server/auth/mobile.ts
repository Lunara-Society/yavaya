import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from '@/config/env';
import { safeEqual } from '@/server/security/crypto';
import { seal, unseal } from './sealed';

/**
 * Signing in from the Yavaya app.
 *
 * Google refuses to sign anyone in inside an app's embedded web view, and an
 * app cannot read the website's cookie, so the app signs in the way native
 * apps are meant to (RFC 8252): it opens the real browser on
 * `/api/mobile/v1/auth/start`, the person signs in on the website exactly as
 * they always do (Google, password, two-step, new-member terms), and the last
 * page sends the browser back to the app's own address with a one-time code.
 * The app trades the code, plus a secret only it holds (PKCE), for a session.
 *
 * Nothing new is trusted: who the person is comes from the website's own
 * sign-in, and the session the app receives is an ordinary session row.
 */

/** The only places a code may be sent: the app's own schemes. Anything else is refused. */
export const MOBILE_REDIRECTS = ['yavaya://auth', 'yavaya-dev://auth'] as const;
export type MobileRedirect = (typeof MOBILE_REDIRECTS)[number];

export function isMobileRedirect(value: string | null | undefined): value is MobileRedirect {
  return (MOBILE_REDIRECTS as readonly string[]).includes(value ?? '');
}

/**
 * PKCE values are base64url, 43 to 128 characters (RFC 7636).
 * Matches "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; rejects "short" and "has spaces in it".
 * Tester: https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%7B43%2C128%7D%24&testString=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk%0Ashort%0Ahas%20spaces%20in%20it
 */
const PKCE = /^[A-Za-z0-9_-]{43,128}$/;
/**
 * The state is the app's own nonce, base64url, 16 to 128 characters.
 * Matches "a1B2c3D4e5F6g7H8"; rejects "abc" and "a1B2c3D4/e5F6g7H8".
 * Tester: https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%7B16%2C128%7D%24&testString=a1B2c3D4e5F6g7H8%0Aabc%0Aa1B2c3D4%2Fe5F6g7H8
 */
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export function validPkceValue(value: string | null | undefined): value is string {
  return Boolean(value && PKCE.test(value));
}

export function validState(value: string | null | undefined): value is string {
  return Boolean(value && STATE.test(value));
}

/** S256: the challenge is base64url(sha256(verifier)). Only S256 is accepted; `plain` would defeat the point. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!validPkceValue(verifier) || !validPkceValue(challenge)) return false;
  return safeEqual(createHash('sha256').update(verifier).digest('base64url'), challenge);
}

export type MobileHandoff = { redirect: MobileRedirect; state: string; challenge: string };

const HANDOFF = 'yav_mobile_auth';
const HANDOFF_PATH = '/api/mobile/v1/auth';
// Long enough for a new member to read the terms and confirm, short enough to be one sitting.
const SECONDS_PER_MINUTE = 60;
const HANDOFF_MINUTES = 15;
const HANDOFF_SECONDS = HANDOFF_MINUTES * SECONDS_PER_MINUTE;

/** Remembers, in the browser doing the signing in, which app asked and with which challenge. */
export async function holdHandoff(handoff: MobileHandoff): Promise<void> {
  (await cookies()).set(HANDOFF, seal('mobile-handoff', handoff, HANDOFF_SECONDS), {
    httpOnly: true,
    secure: serverEnv().APP_ENV !== 'local',
    sameSite: 'lax',
    path: HANDOFF_PATH,
    maxAge: HANDOFF_SECONDS,
  });
}

export async function readHandoff(): Promise<MobileHandoff | null> {
  const value = unseal<MobileHandoff>('mobile-handoff', (await cookies()).get(HANDOFF)?.value);
  if (!value || !isMobileRedirect(value.redirect) || !validState(value.state) || !validPkceValue(value.challenge)) return null;
  return { redirect: value.redirect, state: value.state, challenge: value.challenge };
}

export async function dropHandoff(): Promise<void> {
  (await cookies()).delete({ name: HANDOFF, path: HANDOFF_PATH });
}

/**
 * The one-time code is encrypted, not merely signed: it travels in an address
 * (the app's scheme), and an address is no place to show whose account it
 * opens. It is bound to the PKCE challenge, so a code caught on the way is
 * useless without the verifier that never left the app.
 */
const CODE_SECONDS = 120;
const MS_PER_SECOND = 1000;
/** AES-256-GCM layout of a code: 12-byte nonce, 16-byte tag, then the ciphertext. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = IV_BYTES + TAG_BYTES;
/** A real code is about 150 characters; anything far longer is not one of ours. */
const MAX_CODE_LENGTH = 512;

function codeKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('yavaya mobile sign-in code v1', 'utf8').digest();
}

export function mobileCode(params: { userId: string; challenge: string }, now = Date.now(), secret = serverEnv().SESSION_SECRET): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', codeKey(secret), iv);
  const body = JSON.stringify({ u: params.userId, c: params.challenge, e: Math.floor(now / MS_PER_SECOND) + CODE_SECONDS });
  const sealed = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
}

function openWith(code: string, key: Buffer): { u: string; c: string; e: number } | null {
  try {
    const raw = Buffer.from(code, 'base64url');
    if (raw.length <= HEADER_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, HEADER_BYTES));
    const body = Buffer.concat([decipher.update(raw.subarray(HEADER_BYTES)), decipher.final()]).toString('utf8');
    const value = JSON.parse(body) as { u?: unknown; c?: unknown; e?: unknown };
    if (typeof value.u !== 'string' || typeof value.c !== 'string' || typeof value.e !== 'number') return null;
    return { u: value.u, c: value.c, e: value.e };
  } catch {
    return null;
  }
}

/** The account a code opens, if it is genuine, unexpired and the verifier answers its challenge. */
export function openMobileCode(code: string, verifier: string, now = Date.now()): { userId: string } | null {
  if (!code || code.length > MAX_CODE_LENGTH) return null;
  const env = serverEnv();
  const value = openWith(code, codeKey(env.SESSION_SECRET)) ?? (env.SESSION_SECRET_PREVIOUS ? openWith(code, codeKey(env.SESSION_SECRET_PREVIOUS)) : null);
  if (!value || value.e * MS_PER_SECOND <= now) return null;
  if (!pkceMatches(verifier, value.c)) return null;
  return { userId: value.u };
}

/** Where the browser is sent back to: the app's address with the code and the app's own state. */
export function returnAddress(handoff: MobileHandoff, code: string): string {
  return `${handoff.redirect}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(handoff.state)}`;
}
