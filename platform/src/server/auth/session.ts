import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { sessions, users } from '@/server/db/schema';
import { SESSION_RULES } from '@/config/business-rules';
import { generateToken, sha256 } from '@/server/security/crypto';

/**
 * Sessions.
 *
 * The raw token exists in exactly two places: the user's cookie and the memory
 * of the request that created it. The database stores only its SHA-256, so a
 * database leak cannot be replayed as a login.
 *
 * Three independent expiries apply: idle timeout, absolute lifetime, and
 * explicit revocation. Tokens rotate periodically to limit the value of one
 * that has been stolen.
 */

export type SessionUser = {
  userId: string;
  yayId: string;
  status: string;
  trustState: string;
  locale: string;
  monitoredUntil: Date;
};

export type ValidatedSession = {
  sessionId: string;
  user: SessionUser;
  /** True when the caller should issue a fresh token and replace the cookie. */
  shouldRotate: boolean;
};

export async function createSession(
  tx: Executor,
  params: { userId: string; deviceId?: string | null; ipHash?: string | null; userAgent?: string | null },
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_RULES.idleTimeoutMinutes * 60_000);
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_RULES.absoluteTimeoutDays * 86_400_000);

  const [row] = await tx
    .insert(sessions)
    .values({
      userId: params.userId,
      tokenHash: sha256(token),
      deviceId: params.deviceId ?? null,
      ipHash: params.ipHash ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
      expiresAt,
      absoluteExpiresAt,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('session insert returned no row');
  return { token, sessionId: row.id, expiresAt };
}

/**
 * Resolves a raw session token to its user, or null.
 *
 * Returns null for every failure mode — unknown, expired, revoked, or belonging
 * to a removed account — so a caller cannot distinguish them and probe for
 * valid tokens.
 */
export async function validateSession(
  executor: Executor,
  rawToken: string | null | undefined,
): Promise<ValidatedSession | null> {
  if (!rawToken) return null;

  const [row] = await executor
    .select({
      sessionId: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      yayId: users.yayId,
      status: users.status,
      trustState: users.trustState,
      locale: users.locale,
      monitoredUntil: users.monitoredUntil,
      deactivatedAt: users.deactivatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(rawToken)))
    .limit(1);

  if (!row) return null;

  const now = new Date();
  if (row.revokedAt) return null;
  if (row.expiresAt <= now) return null;
  if (row.absoluteExpiresAt <= now) return null;
  if (row.deactivatedAt) return null;
  // A banned account's sessions stop working immediately, without waiting for
  // a revocation sweep to run.
  if (row.status === 'banned' || row.status === 'suspended') return null;

  const rotateAfter = new Date(row.lastUsedAt.getTime() + SESSION_RULES.rotateAfterMinutes * 60_000);

  return {
    sessionId: row.sessionId,
    shouldRotate: now >= rotateAfter,
    user: {
      userId: row.userId,
      yayId: row.yayId,
      status: row.status,
      trustState: row.trustState,
      locale: row.locale,
      monitoredUntil: row.monitoredUntil,
    },
  };
}

/** Extends the idle window and records activity. */
export async function touchSession(executor: Executor, sessionId: string): Promise<void> {
  const now = new Date();
  await executor
    .update(sessions)
    .set({
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_RULES.idleTimeoutMinutes * 60_000),
    })
    .where(eq(sessions.id, sessionId));
}

/**
 * Replaces a session's token in place, keeping its identity and absolute
 * expiry. The old token stops working the moment this commits.
 */
export async function rotateSession(tx: Executor, sessionId: string): Promise<string> {
  const token = generateToken(32);
  const now = new Date();
  await tx
    .update(sessions)
    .set({
      tokenHash: sha256(token),
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_RULES.idleTimeoutMinutes * 60_000),
    })
    .where(eq(sessions.id, sessionId));
  return token;
}

export async function revokeSession(
  tx: Executor,
  sessionId: string,
  reason: string,
): Promise<void> {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Used on password change, ban, and "sign out everywhere". */
export async function revokeAllSessions(
  tx: Executor,
  userId: string,
  reason: string,
  options: { exceptSessionId?: string } = {},
): Promise<number> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (options.exceptSessionId) {
    conditions.push(sql`${sessions.id} <> ${options.exceptSessionId}`);
  }
  const revoked = await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(...conditions))
    .returning({ id: sessions.id });
  return revoked.length;
}

/** Housekeeping: drops sessions that can no longer authenticate anyone. */
export async function purgeExpiredSessions(executor: Executor): Promise<number> {
  const removed = await executor
    .delete(sessions)
    .where(lt(sessions.absoluteExpiresAt, new Date()))
    .returning({ id: sessions.id });
  return removed.length;
}
