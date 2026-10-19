import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { serverEnv } from '@/config/env';
import type { Database } from '@/server/db/client';
import { externalIdentities, users } from '@/server/db/schema';
import { errors } from '@/server/errors';
import { generateToken, hashPassword } from '@/server/security/crypto';
import { RATE_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import { recordAudit } from '@/server/domains/audit/service';
import { revokeAllSessions } from '@/server/auth/session';
import { canonicalEmail } from './normalize';
import { markEmailVerified, register, type RegistrationResult, type RequestContext } from './service';

/**
 * "Continuar con Google": the OpenID Connect authorization-code flow, with
 * PKCE, a state value and a nonce, against Google's own endpoints.
 *
 * Google is trusted for one thing only: that the person controls the address
 * it names (`email_verified`). Everything else about the account — the risk
 * checks, the 72-hour watch, the one-person-one-account rule — applies exactly
 * as it does to a password registration.
 */

export const GOOGLE = 'google';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleSignIn(): ({ available: true } & GoogleConfig) | { available: false; reason: string } {
  const env = serverEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return { available: false, reason: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from an OAuth client (web application) in Google Cloud; see docs/CONFIGURATION.md.' };
  }
  return {
    available: true,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.APP_URL.replace(/\/$/, '')}/auth/google/callback`,
  };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = generateToken(48);
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizationUrl(
  config: GoogleConfig,
  params: { state: string; nonce: string; challenge: string; loginHint?: string; chooseAccount?: boolean },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    // With a hint from the last sign-in, Google goes straight back in when
    // that account is already open in the browser — the "one tap" after a
    // sign-out. Without one, or on request, it lets the person choose.
    ...(params.loginHint && !params.chooseAccount ? { login_hint: params.loginHint } : {}),
    ...(params.chooseAccount ? { prompt: 'select_account' } : {}),
  }).toString();
  return url.toString();
}

export type GoogleProfile = { subject: string; email: string; name: string };

/**
 * Reads the ID token Google's token endpoint returned.
 *
 * The token came straight from Google over TLS in exchange for our client
 * secret, so OpenID Connect allows trusting its signature to that channel
 * (Core §3.1.3.7). The claims are still checked: who issued it, for which
 * client, that it is current, that it answers our own request (nonce), and
 * that Google confirmed the address.
 */
export function readIdToken(idToken: string, expect: { clientId: string; nonce: string; now?: number }): GoogleProfile | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) return null;
  if (!audience.includes(expect.clientId)) return null;
  if (typeof claims.exp !== 'number' || claims.exp < now) return null;
  if (claims.nonce !== expect.nonce) return null;
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null;
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email.includes('@')) return null;
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : claims.email.split('@')[0]!;
  return { subject: claims.sub, email: claims.email, name: name.slice(0, 60) };
}

/** Trades the one-time code for an ID token. Null on any failure; nothing about it is shown to the visitor. */
export async function exchangeCode(config: GoogleConfig, code: string, verifier: string): Promise<string | null> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
    if (!response.ok) {
      // Google's short reason ("invalid_client" is a wrong secret, "invalid_grant"
      // a used or expired code) is what an operator needs; it carries nothing secret.
      console.warn(`google sign-in: token exchange refused (${response.status} ${typeof body.error === 'string' ? body.error : 'no reason'})`);
      return null;
    }
    return typeof body.id_token === 'string' ? body.id_token : null;
  } catch (error) {
    console.warn(`google sign-in: token exchange failed (${error instanceof Error ? error.name : 'error'})`);
    return null;
  }
}

export type GoogleOutcome = { kind: 'signed_in'; userId: string } | { kind: 'new_member'; profile: GoogleProfile } | { kind: 'refused' };

/**
 * Who this Google account is on Yavaya.
 *
 * Already linked: that account. Not linked, but an account uses the address:
 * the two are joined — and if that account had never confirmed its address,
 * whoever set its password never proved they own it, so the password stops
 * working and its other sessions end; the person Google vouches for keeps the
 * account. No account: a new member, who still has to accept the rules first.
 */
export async function signInWithGoogle(database: Database, profile: GoogleProfile, context: RequestContext): Promise<GoogleOutcome> {
  const rate = await consumeRateLimit(database, RATE_LIMITS.login, context.addressHash ?? 'unknown');
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  return database.transaction(async (tx) => {
    const [linked] = await tx
      .select({ userId: externalIdentities.userId, identityId: externalIdentities.id })
      .from(externalIdentities)
      .where(and(eq(externalIdentities.provider, GOOGLE), eq(externalIdentities.subject, profile.subject)))
      .limit(1);

    const email = canonicalEmail(profile.email);
    const [user] = await tx
      .select({ id: users.id, status: users.status, deactivatedAt: users.deactivatedAt, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(linked ? eq(users.id, linked.userId) : eq(users.email, email))
      .limit(1);

    if (!user) return { kind: 'new_member', profile } as const;
    if (user.deactivatedAt || user.status === 'banned' || user.status === 'suspended') return { kind: 'refused' } as const;

    const now = new Date();
    if (linked) {
      await tx.update(externalIdentities).set({ lastUsedAt: now }).where(eq(externalIdentities.id, linked.identityId));
    } else {
      await tx.insert(externalIdentities).values({ userId: user.id, provider: GOOGLE, subject: profile.subject, emailAtLink: email });
      const claimed = !user.emailVerifiedAt;
      if (claimed) {
        await tx.update(users).set({ passwordHash: await hashPassword(generateToken(32)), passwordUpdatedAt: now }).where(eq(users.id, user.id));
        await revokeAllSessions(tx, user.id, 'address_confirmed_by_owner');
        await markEmailVerified(tx, { userId: user.id, method: 'google', now });
      }
      await recordAudit(tx, {
        actorType: 'user',
        actorUserId: user.id,
        action: 'identity.provider_linked',
        subjectType: 'user',
        subjectId: user.id,
        ipHash: context.addressHash,
        metadata: { provider: GOOGLE, confirmedAddress: claimed },
      });
    }
    await tx.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));
    return { kind: 'signed_in', userId: user.id } as const;
  });
}

/**
 * A new member through Google, after accepting the rules. Same registration
 * as everyone (risk checks, YAY ID, watch window, invitation); the address is
 * confirmed already, and the password is a random one nobody knows — this
 * account signs in with Google.
 */
export async function registerWithGoogle(
  database: Database,
  input: { profile: GoogleProfile; displayName: string; locale: 'es' | 'en'; acceptedTerms: boolean; inviter?: string },
  context: RequestContext,
): Promise<RegistrationResult> {
  return register(
    database,
    {
      email: input.profile.email,
      password: generateToken(36),
      displayName: input.displayName,
      locale: input.locale,
      acceptedTerms: input.acceptedTerms as true,
      inviter: input.inviter,
    },
    context,
    { provider: GOOGLE, subject: input.profile.subject },
  );
}
