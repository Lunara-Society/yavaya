import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, externalIdentities, sessions, users, verificationChallenges } from '@/server/db/schema';
import { authenticate, register } from '@/server/domains/identity/service';
import { authorizationUrl, readIdToken, registerWithGoogle, signInWithGoogle, verifyBrowserIdToken, type GoogleProfile } from '@/server/domains/identity/google';
import { generateKeyPairSync, sign } from 'node:crypto';
import { vi } from 'vitest';
import { getBalance } from '@/server/domains/tokens/service';
import { createSession, validateSession } from '@/server/auth/session';
import { seal, unseal } from '@/server/auth/sealed';
import { safeNext } from '@/server/auth/return-path';
import { SESSION_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'google-test', deviceFingerprint: null, userAgent: 'vitest' };
const CLIENT = 'client-123.apps.googleusercontent.com';

function idToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}
const good = (over: Record<string, unknown> = {}) =>
  idToken({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', sub: 'g-1', email: 'Ana@Gmail.com', email_verified: true, name: 'Ana Pérez', ...over });

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({ subject: `g-${crypto.randomUUID()}`, email: `ana-${crypto.randomUUID()}@gmail.com`, name: 'Ana Pérez', ...over });

describe('Google sign-in: what Google sends back', () => {
  it('accepts only a current token, for us, answering our request, with a confirmed address', () => {
    expect(readIdToken(good(), { clientId: CLIENT, nonce: 'n1' })).toEqual({ subject: 'g-1', email: 'Ana@Gmail.com', name: 'Ana Pérez' });
    expect(readIdToken(good({ aud: 'someone-else' }), { clientId: CLIENT, nonce: 'n1' })).toBeNull();
    expect(readIdToken(good({ iss: 'https://evil.example' }), { clientId: CLIENT, nonce: 'n1' })).toBeNull();
    expect(readIdToken(good({ exp: Math.floor(Date.now() / 1000) - 5 }), { clientId: CLIENT, nonce: 'n1' })).toBeNull();
    expect(readIdToken(good(), { clientId: CLIENT, nonce: 'other' })).toBeNull();
    expect(readIdToken(good({ email_verified: false }), { clientId: CLIENT, nonce: 'n1' })).toBeNull();
    expect(readIdToken('not-a-token', { clientId: CLIENT, nonce: 'n1' })).toBeNull();
  });

  it('goes straight back to the remembered account, or lets the person choose', () => {
    const config = { clientId: CLIENT, clientSecret: 'secret', redirectUri: 'https://yavaya.lat/auth/google/callback' };
    const back = new URL(authorizationUrl(config, { state: 's', nonce: 'n', challenge: 'c', loginHint: 'g-1' }));
    expect(back.searchParams.get('login_hint')).toBe('g-1');
    expect(back.searchParams.get('prompt')).toBeNull();
    expect(back.searchParams.get('code_challenge_method')).toBe('S256');
    const choose = new URL(authorizationUrl(config, { state: 's', nonce: 'n', challenge: 'c', loginHint: 'g-1', chooseAccount: true }));
    expect(choose.searchParams.get('login_hint')).toBeNull();
    expect(choose.searchParams.get('prompt')).toBe('select_account');
  });

  it('seals what the browser carries so it cannot be altered or reused elsewhere', () => {
    const sealed = seal('google-signup', { email: 'a@b.c' }, 60);
    expect(unseal('google-signup', sealed)).toMatchObject({ email: 'a@b.c' });
    expect(unseal('google-flow', sealed)).toBeNull();
    const [body, mac] = sealed.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'victim@b.c', exp: 9e9 })).toString('base64url');
    expect(unseal('google-signup', `${forged}.${mac}`)).toBeNull();
    expect(unseal('google-signup', `${body}.${mac}`, Date.now() + 61_000)).toBeNull();
  });

  it('only ever returns to a page on this site', () => {
    expect(safeNext('/mercadito?q=bici')).toBe('/mercadito?q=bici');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('Google sign-in prompt: tokens that came through the browser', () => {
  it('accepts only a token signed with one of Google\'s published keys', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=60' } }));
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const claims = { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', sub: 'g-9', email: 'b@gmail.com', email_verified: true, name: 'B' };
    const signed = (header: object, body: object) => {
      const data = `${part(header)}.${part(body)}`;
      return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
    };
    try {
      expect(await verifyBrowserIdToken(signed({ alg: 'RS256', kid: 'k1' }, claims), { clientId: CLIENT, nonce: 'n1' })).toMatchObject({ subject: 'g-9' });
      const genuine = signed({ alg: 'RS256', kid: 'k1' }, claims);
      const [h, , sig] = genuine.split('.');
      expect(await verifyBrowserIdToken(`${h}.${part({ ...claims, email: 'victim@gmail.com' })}.${sig}`, { clientId: CLIENT, nonce: 'n1' })).toBeNull();
      expect(await verifyBrowserIdToken(`${part({ alg: 'none' })}.${part(claims)}.`, { clientId: CLIENT, nonce: 'n1' })).toBeNull();
      expect(await verifyBrowserIdToken(signed({ alg: 'RS256', kid: 'unknown' }, claims), { clientId: CLIENT, nonce: 'n1' })).toBeNull();
      expect(await verifyBrowserIdToken(signed({ alg: 'RS256', kid: 'k1' }, claims), { clientId: CLIENT, nonce: 'other' })).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('Google sign-in: whose account it is', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('creates a member only after the rules are accepted, with the address already confirmed', async () => {
    const ana = profile();
    expect(await signInWithGoogle(db(), ana, context)).toEqual({ kind: 'new_member', profile: ana });
    const created = await registerWithGoogle(db(), { profile: ana, displayName: 'Ana', locale: 'es', acceptedTerms: true }, context);
    expect(created.status).toBe('active');
    expect(created.emailVerificationCode).toBeNull();
    const [user] = await db().select().from(users).where(eq(users.id, created.userId));
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(await db().select().from(verificationChallenges).where(eq(verificationChallenges.userId, created.userId))).toHaveLength(0);
    expect(await getBalance(db(), created.userId)).toBeGreaterThan(0); // starter tokens begin, as after the emailed code
    // and the next time, straight in
    expect(await signInWithGoogle(db(), ana, context)).toEqual({ kind: 'signed_in', userId: created.userId });
  });

  it('joins an account that already confirmed the same address, and its password keeps working', async () => {
    const email = `luis-${crypto.randomUUID()}@gmail.com`;
    const created = await register(db(), { email, password: 'a-sufficiently-long-passphrase', displayName: 'Luis', locale: 'es', acceptedTerms: true }, context);
    await db().update(users).set({ emailVerifiedAt: new Date(), status: 'active' }).where(eq(users.id, created.userId));
    const outcome = await signInWithGoogle(db(), profile({ email: email.toUpperCase() }), context);
    expect(outcome).toEqual({ kind: 'signed_in', userId: created.userId });
    expect((await authenticate(db(), { email, password: 'a-sufficiently-long-passphrase' }, context)).ok).toBe(true);
    const [link] = await db().select().from(auditEvents).where(eq(auditEvents.action, 'identity.provider_linked'));
    expect(link!.metadata).toMatchObject({ provider: 'google', confirmedAddress: false });
  });

  it('gives an account whose address was never confirmed to the person Google vouches for', async () => {
    const email = `marta-${crypto.randomUUID()}@gmail.com`;
    // someone registered with Marta's address and set a password, but never proved they own it
    const squatter = await register(db(), { email, password: 'squatters-long-passphrase', displayName: 'Marta?', locale: 'es', acceptedTerms: true }, context);
    const squatterSession = await db().transaction((tx) => createSession(tx, { userId: squatter.userId }));

    const outcome = await signInWithGoogle(db(), profile({ email }), context);
    expect(outcome).toEqual({ kind: 'signed_in', userId: squatter.userId });
    expect((await authenticate(db(), { email, password: 'squatters-long-passphrase' }, context)).ok).toBe(false);
    expect(await validateSession(db(), squatterSession.token)).toBeNull();
    const [user] = await db().select().from(users).where(eq(users.id, squatter.userId));
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(user!.status).toBe('active');
  });

  it('refuses an account that is suspended or banned', async () => {
    const email = `x-${crypto.randomUUID()}@gmail.com`;
    const created = await register(db(), { email, password: 'a-sufficiently-long-passphrase', displayName: 'Xavi', locale: 'es', acceptedTerms: true }, context);
    await db().update(users).set({ status: 'banned' }).where(eq(users.id, created.userId));
    expect(await signInWithGoogle(db(), profile({ email }), context)).toEqual({ kind: 'refused' });
    expect(await db().select().from(externalIdentities).where(eq(externalIdentities.userId, created.userId))).toHaveLength(0);
  });
});

describe('sessions: two hours without activity', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });

  it('stays open while used, and closes after the idle window', async () => {
    const created = await register(db(), { email: `s-${crypto.randomUUID()}@gmail.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Sara', locale: 'es', acceptedTerms: true }, context);
    const session = await db().transaction((tx) => createSession(tx, { userId: created.userId }));
    expect(await validateSession(db(), session.token)).not.toBeNull();
    // the cookie outlives the idle window: the server decides
    expect(session.absoluteExpiresAt.getTime()).toBeGreaterThan(session.expiresAt.getTime());

    const idle = SESSION_RULES.idleTimeoutMinutes * 60_000;
    const setLastUsed = (msAgo: number) =>
      db().update(sessions).set({ lastUsedAt: new Date(Date.now() - msAgo), expiresAt: new Date(Date.now() - msAgo + idle) }).where(and(eq(sessions.id, session.sessionId)));
    await setLastUsed(idle - 60_000);
    expect(await validateSession(db(), session.token)).not.toBeNull();
    await setLastUsed(idle + 60_000);
    expect(await validateSession(db(), session.token)).toBeNull();
  });
});
