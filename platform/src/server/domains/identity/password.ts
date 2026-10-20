import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { passwordResets, users } from '@/server/db/schema';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { generateToken, hashPassword, sha256, signalHash, verifyPassword } from '@/server/security/crypto';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/domains/audit/service';
import { errors } from '@/server/errors';
import { canonicalEmail } from './normalize';
import type { RequestContext } from './service';

/**
 * Forgotten and changed passwords.
 *
 * A reset is proof of the mailbox, nothing more: it sets a new password and
 * signs out every device, but it does not get past two-step sign-in — the
 * next sign-in still asks for the code. Otherwise anyone who got into
 * someone's email would get their Yavaya account with it.
 */

export type ResetRequest = { token: string; email: string; locale: string };

/**
 * Issues a reset link for an address, if an account can use one.
 *
 * Returns null when there is no such account (or it cannot sign in). The caller
 * says the same thing either way, so this page cannot be used to learn who is
 * registered. The limits hold per network and per address, so it cannot be
 * used to flood someone's inbox either.
 */
export async function requestPasswordReset(
  database: Database,
  params: { email: string; context: RequestContext; now?: Date },
): Promise<ResetRequest | null> {
  const now = params.now ?? new Date();
  const email = canonicalEmail(params.email);

  const byNetwork = await consumeRateLimit(database, RATE_LIMITS.passwordResetNetwork, params.context.addressHash ?? 'unknown');
  if (!byNetwork.allowed) throw errors.rateLimited(byNetwork.retryAfterSeconds);
  const byAddress = await consumeRateLimit(database, RATE_LIMITS.passwordResetAddress, signalHash('reset', email));
  if (!byAddress.allowed) throw errors.rateLimited(byAddress.retryAfterSeconds);

  const [user] = await database
    .select({ id: users.id, email: users.email, locale: users.locale, status: users.status, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.deactivatedAt || user.status === 'banned' || user.status === 'suspended') return null;

  const token = generateToken(32);
  await database.transaction(async (tx) => {
    // One live link at a time: asking again voids the earlier ones.
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + VERIFICATION_RULES.passwordResetTtlMinutes * 60_000),
    });
    await recordAudit(tx, {
      actorType: 'anonymous',
      action: 'identity.password_reset_requested',
      subjectType: 'user',
      subjectId: user.id,
      ipHash: params.context.addressHash,
    });
  });
  return { token, email: user.email, locale: user.locale };
}

/** Whether a link can still be used — so the page can say so before asking for a password. */
export async function resetLinkUsable(executor: Executor, token: string, now = new Date()): Promise<boolean> {
  const [row] = await executor
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}

/**
 * Sets a new password from a reset link. The link is spent in the same
 * statement that checks it, so it works once even if submitted twice at once.
 */
export async function resetPassword(
  tx: Executor,
  params: { token: string; password: string; now?: Date },
): Promise<{ ok: true; userId: string; email: string; locale: string } | { ok: false }> {
  const now = params.now ?? new Date();
  const [spent] = await tx
    .update(passwordResets)
    .set({ usedAt: now })
    .where(and(eq(passwordResets.tokenHash, sha256(params.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
    .returning({ userId: passwordResets.userId });
  if (!spent) return { ok: false };

  const passwordHash = await hashPassword(params.password);
  const [user] = await tx
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: now, updatedAt: now })
    .where(eq(users.id, spent.userId))
    .returning({ email: users.email, locale: users.locale });
  // Whoever had the old password is out, on every device.
  await revokeAllSessions(tx, spent.userId, 'password_reset');
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: spent.userId,
    action: 'identity.password_reset',
    subjectType: 'user',
    subjectId: spent.userId,
  });
  return { ok: true, userId: spent.userId, email: user?.email ?? '', locale: user?.locale ?? 'es' };
}

/**
 * Changes the password of a signed-in member who knows the current one. Other
 * devices are signed out; this one stays.
 */
export async function changePassword(
  tx: Executor,
  params: { userId: string; current: string; next: string; keepSessionId: string; now?: Date },
): Promise<{ ok: true; email: string; locale: string } | { ok: false }> {
  const now = params.now ?? new Date();
  const [user] = await tx.select({ passwordHash: users.passwordHash, email: users.email, locale: users.locale }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user || !(await verifyPassword(params.current, user.passwordHash))) return { ok: false };

  await tx
    .update(users)
    .set({ passwordHash: await hashPassword(params.next), passwordUpdatedAt: now, updatedAt: now })
    .where(eq(users.id, params.userId));
  await revokeAllSessions(tx, params.userId, 'password_changed', { exceptSessionId: params.keepSessionId });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'identity.password_changed',
    subjectType: 'user',
    subjectId: params.userId,
  });
  return { ok: true, email: user.email, locale: user.locale };
}
