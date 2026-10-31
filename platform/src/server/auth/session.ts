import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
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
 * Three independent expiries apply: idle timeout (from the last activity),
 * absolute lifetime, and explicit revocation. When a token is due for
 * re-issue is computed below, but nothing re-issues it yet — see the known
 * gaps in docs/SECURITY.md.
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
  /** The member chose "Mantener mi sesión iniciada" when signing in here. */
  remember: boolean;
  /** When the member signed in. Rotation keeps it: it is the login, not the token. */
  createdAt: Date;
  /** When the session last saw activity; the idle window runs from here. */
  lastUsedAt: Date;
  user: SessionUser;
  /** True when the caller should issue a fresh token and replace the cookie. */
  shouldRotate: boolean;
};

/**
 * A remembered session that has not signed in for a while. On a device that
 * stays signed in, someone else may be holding it: the change that could lock
 * the owner out (turning on two-step with another phone) asks for a fresh
 * sign-in first. Changing the password already asks for the current one, and
 * turning two-step off or renewing its codes asks for a code.
 */
export function needsFreshSignIn(session: { remember: boolean; createdAt: Date }, now = Date.now()): boolean {
  return session.remember && now - session.createdAt.getTime() > SESSION_RULES.freshSignInMinutes * 60_000;
}

/** How long a session may go unused: two hours, or the remembered window if the member asked for it. */
export function idleWindowMs(remember: boolean): number {
  return remember ? SESSION_RULES.rememberedIdleDays * 86_400_000 : SESSION_RULES.idleTimeoutMinutes * 60_000;
}

export async function createSession(
  tx: Executor,
  params: { userId: string; deviceId?: string | null; ipHash?: string | null; userAgent?: string | null; remember?: boolean },
): Promise<{ token: string; sessionId: string; expiresAt: Date; absoluteExpiresAt: Date }> {
  const token = generateToken(32);
  const now = new Date();
  const remember = params.remember ?? false;
  const expiresAt = new Date(now.getTime() + idleWindowMs(remember));
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
      remember,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('session insert returned no row');
  return { token, sessionId: row.id, expiresAt, absoluteExpiresAt };
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
      remember: sessions.remember,
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
  // The idle rule is checked from the last activity too, so a change to it
  // applies to sessions issued under the old one.
  if (row.lastUsedAt.getTime() + idleWindowMs(row.remember) <= now.getTime()) return null;
  if (row.absoluteExpiresAt <= now) return null;
  if (row.deactivatedAt) return null;
  // A banned account's sessions stop working immediately, without waiting for
  // a revocation sweep to run.
  if (row.status === 'banned' || row.status === 'suspended') return null;

  const rotateAfter = new Date(row.lastUsedAt.getTime() + SESSION_RULES.rotateAfterMinutes * 60_000);

  return {
    sessionId: row.sessionId,
    remember: row.remember,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
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
export async function touchSession(executor: Executor, sessionId: string, remember = false): Promise<void> {
  const now = new Date();
  await executor
    .update(sessions)
    .set({
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + idleWindowMs(remember)),
    })
    .where(eq(sessions.id, sessionId));
}

/**
 * Replaces a session's token in place, keeping its identity and absolute
 * expiry. The old token stops working the moment this commits.
 */
export async function rotateSession(tx: Executor, sessionId: string, remember = false): Promise<string> {
  const token = generateToken(32);
  const now = new Date();
  await tx
    .update(sessions)
    .set({
      tokenHash: sha256(token),
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + idleWindowMs(remember)),
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

/** Sessions that can still sign someone in, newest activity first — for "where you're signed in". */
export async function activeSessions(
  executor: Executor,
  userId: string,
  now = new Date(),
): Promise<{ id: string; userAgent: string | null; createdAt: Date; lastUsedAt: Date; remember: boolean }[]> {
  // Each session by its own idle window: a remembered one left a day ago is still live, and must be listed.
  const idleCutoff = new Date(now.getTime() - idleWindowMs(false));
  const rememberedCutoff = new Date(now.getTime() - idleWindowMs(true));
  return executor
    .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt, remember: sessions.remember })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
        or(and(eq(sessions.remember, false), gt(sessions.lastUsedAt, idleCutoff)), and(eq(sessions.remember, true), gt(sessions.lastUsedAt, rememberedCutoff))),
      ),
    )
    .orderBy(sql`${sessions.lastUsedAt} desc`)
    .limit(20);
}

/**
 * A device as a person would name it — browser and system — from the user
 * agent. Rough on purpose: enough to recognise one's own phone, nothing more.
 */
export function describeDevice(userAgent: string | null): { browser: string | null; system: string | null } {
  if (!userAgent) return { browser: null, system: null };
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /SamsungBrowser/.test(userAgent) ? 'Samsung Internet'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null;
  const system =
    /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /CrOS/.test(userAgent) ? 'ChromeOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;
  return { browser, system };
}
