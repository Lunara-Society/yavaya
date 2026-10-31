import 'server-only';
import { headers } from 'next/headers';
import { db } from '@/server/db/client';
import { signalHash } from '@/server/security/crypto';
import { serverEnv } from '@/config/env';
import { clientAddress, describeNetwork } from '@/server/security/network';
import type { RequestContext } from '@/server/domains/identity/service';
import { SESSION_RULES } from '@/config/business-rules';
import { touchSession, validateSession, type ValidatedSession } from './session';
import { readSessionCookie } from './cookies';

/**
 * Per-request context.
 *
 * Every mutating server action starts here. The signals it gathers (network,
 * device, user agent) are hashed immediately — raw values never travel further
 * into the application.
 */
export async function requestContext(): Promise<RequestContext> {
  const headerStore = await headers();
  const env = serverEnv();
  const address = clientAddress(headerStore, {
    trustedProxyCount: env.TRUSTED_PROXY_COUNT,
    header: env.CLIENT_IP_HEADER,
  });
  const network = describeNetwork(address);
  const userAgent = headerStore.get('user-agent');

  return {
    networkHash: network.networkHash,
    addressHash: network.addressHash,
    // A real device fingerprint is collected client-side and posted with the
    // form. Absent one, device matching simply does not contribute to risk —
    // it is never faked from the user agent, which would produce mass false
    // matches across identical phone models.
    deviceFingerprint: null,
    userAgent,
  };
}

/**
 * The signed-in user, or null. Never throws.
 *
 * Reading the session is also what keeps it alive: the idle window runs from
 * the last activity, so each visit pushes it forward (at most every few
 * minutes, to spare the database).
 */
export async function currentSession(): Promise<ValidatedSession | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const session = await validateSession(db(), token);
  if (session && Date.now() - session.lastUsedAt.getTime() >= SESSION_RULES.touchAfterMinutes * 60_000) {
    await touchSession(db(), session.sessionId, session.remember).catch(() => {});
  }
  return session;
}


/** Hash of the user agent, for audit records that must not store the raw value. */
export async function userAgentHash(): Promise<string | null> {
  const headerStore = await headers();
  const userAgent = headerStore.get('user-agent');
  return userAgent ? signalHash('ua', userAgent) : null;
}
