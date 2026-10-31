import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { sessions, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { activeSessions, createSession, needsFreshSignIn, revokeAllSessions, touchSession, validateSession } from '@/server/auth/session';
import { SESSION_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

/**
 * "Mantener mi sesión iniciada": a session the member asked to keep. Only the
 * idle window changes; the absolute lifetime, revocation, suspension and the
 * fresh sign-in for sensitive changes all still apply.
 */

const context = { networkHash: null, addressHash: 'remember-test', deviceFingerprint: null, userAgent: 'vitest' };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function member() {
  const { userId } = await register(
    db(),
    { email: `remember-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Ana', locale: 'es', acceptedTerms: true },
    { ...context, addressHash: `remember-${crypto.randomUUID()}` },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

/** Pretends the session was last used `ago` milliseconds ago. */
async function idle(sessionId: string, ago: number) {
  await db().update(sessions).set({ lastUsedAt: new Date(Date.now() - ago) }).where(eq(sessions.id, sessionId));
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('remembered sessions', () => {
  it('signs a plain session out after two hours without use, and keeps a remembered one', async () => {
    const userId = await member();
    const plain = await db().transaction((tx) => createSession(tx, { userId }));
    const kept = await db().transaction((tx) => createSession(tx, { userId, remember: true }));
    await idle(plain.sessionId, 3 * HOUR);
    await idle(kept.sessionId, 3 * HOUR);
    expect(await validateSession(db(), plain.token)).toBeNull();
    expect(await validateSession(db(), kept.token)).toMatchObject({ remember: true, user: { userId } });
  });

  it('ends a remembered session after its own idle window', async () => {
    const userId = await member();
    const kept = await db().transaction((tx) => createSession(tx, { userId, remember: true }));
    await idle(kept.sessionId, (SESSION_RULES.rememberedIdleDays + 1) * DAY);
    expect(await validateSession(db(), kept.token)).toBeNull();
  });

  it('never outlives the absolute lifetime, however often it is used', async () => {
    const userId = await member();
    const kept = await db().transaction((tx) => createSession(tx, { userId, remember: true }));
    await db().update(sessions).set({ absoluteExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, kept.sessionId));
    await touchSession(db(), kept.sessionId, true);
    expect(await validateSession(db(), kept.token)).toBeNull();
  });

  it('still ends at once on sign-out everywhere and on suspension', async () => {
    const userId = await member();
    const kept = await db().transaction((tx) => createSession(tx, { userId, remember: true }));
    await db().transaction((tx) => revokeAllSessions(tx, userId, 'test'));
    expect(await validateSession(db(), kept.token)).toBeNull();

    const other = await member();
    const second = await db().transaction((tx) => createSession(tx, { userId: other, remember: true }));
    await db().update(users).set({ status: 'suspended' }).where(eq(users.id, other));
    expect(await validateSession(db(), second.token)).toBeNull();
  });

  it('keeps a remembered session idle for a day in the list of where the member is signed in', async () => {
    const userId = await member();
    const kept = await db().transaction((tx) => createSession(tx, { userId, remember: true }));
    const plain = await db().transaction((tx) => createSession(tx, { userId }));
    await idle(kept.sessionId, DAY);
    await idle(plain.sessionId, 3 * HOUR);
    const listed = await activeSessions(db(), userId);
    expect(listed.map((s) => s.id)).toEqual([kept.sessionId]);
    expect(listed[0]!.remember).toBe(true);
  });

  it('asks a remembered session for a fresh sign-in before sensitive changes, after a while', () => {
    const signedIn = new Date();
    expect(needsFreshSignIn({ remember: true, createdAt: signedIn })).toBe(false);
    expect(needsFreshSignIn({ remember: true, createdAt: new Date(Date.now() - (SESSION_RULES.freshSignInMinutes + 1) * 60_000) })).toBe(true);
    // A plain session already ends after two hours of quiet; it is not asked.
    expect(needsFreshSignIn({ remember: false, createdAt: new Date(Date.now() - DAY) })).toBe(false);
  });
});
