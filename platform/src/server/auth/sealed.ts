import 'server-only';
import { createHmac } from 'node:crypto';
import { serverEnv } from '@/config/env';
import { safeEqual } from '@/server/security/crypto';

/**
 * Short-lived values the browser carries between two requests but cannot
 * alter: `base64url(json).hmac`. Used for the Google round trip, where what
 * comes back must be what we sent, and for an address Google has confirmed
 * while the person accepts the rules on the next page — which, forged, would
 * be a way to claim any address.
 *
 * Each use has its own purpose string, so a value sealed for one step is
 * worthless at another.
 */
function mac(purpose: string, body: string): string {
  return createHmac('sha256', serverEnv().SESSION_SECRET).update(`${purpose}.${body}`, 'utf8').digest('base64url');
}

export function seal(purpose: string, payload: Record<string, unknown>, ttlSeconds: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }), 'utf8').toString('base64url');
  return `${body}.${mac(purpose, body)}`;
}

export function unseal<T extends Record<string, unknown>>(purpose: string, value: string | undefined | null, now = Date.now()): T | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  if (!safeEqual(value.slice(dot + 1), mac(purpose, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
