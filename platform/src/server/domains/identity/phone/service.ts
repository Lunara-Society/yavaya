import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { users, verificationChallenges } from '@/server/db/schema';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { sha256, signalHash } from '@/server/security/crypto';
import { RATE_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import { recordAudit } from '@/server/domains/audit/service';
import { applyRule } from '@/server/domains/reputation/service';
import { recordPhoneSignal } from '../risk';
import { phoneVerifier } from './verifier';

/**
 * Phone verification.
 *
 * A member proves they hold a number by typing back a code sent to it. Only
 * then is the number written to the account, with `phoneVerifiedAt` — so a
 * number on an account is always one its owner has shown they hold. Starting
 * a verification for a new number leaves the old verified one in place until
 * the new one is confirmed.
 *
 * The provider is called outside any transaction: a slow SMS gateway must not
 * hold database locks. The checks before it are advisory; the rate limits are
 * what bound a member who races them.
 */

export type PhoneState = {
  phoneE164: string | null;
  verifiedAt: Date | null;
  pending: { target: string; expiresAt: Date } | null;
};

export async function phoneState(executor: Executor, userId: string): Promise<PhoneState> {
  const [user] = await executor
    .select({ phoneE164: users.phoneE164, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw errors.notFound('user');

  const [pending] = await executor
    .select({ target: verificationChallenges.target, expiresAt: verificationChallenges.expiresAt })
    .from(verificationChallenges)
    .where(
      and(
        eq(verificationChallenges.userId, userId),
        eq(verificationChallenges.kind, 'phone'),
        eq(verificationChallenges.status, 'pending'),
        sql`${verificationChallenges.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(verificationChallenges.createdAt))
    .limit(1);

  return { phoneE164: user.phoneE164, verifiedAt: user.verifiedAt, pending: pending ?? null };
}

export type PhoneStartResult =
  | { ok: true; target: string; expiresAt: Date; provider: string; localCode?: string }
  | {
      ok: false;
      reason: 'unavailable' | 'already_verified' | 'cooldown' | 'daily_limit' | 'invalid_number' | 'blocked' | 'delivery_failed';
      retryAfterSeconds?: number;
    };

/** Sends a code to `phoneE164` (already normalised by the caller). */
export async function startPhoneVerification(
  database: Database,
  params: { userId: string; phoneE164: string; locale: 'es' | 'en' },
): Promise<PhoneStartResult> {
  const verifier = phoneVerifier();
  if (!verifier || !verifier.availability().available) return { ok: false, reason: 'unavailable' };

  const [user] = await database
    .select({ phoneE164: users.phoneE164, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (!user) throw errors.notFound('user');
  if (user.verifiedAt && user.phoneE164 === params.phoneE164) return { ok: false, reason: 'already_verified' };

  const [recent] = await database
    .select({ createdAt: verificationChallenges.createdAt })
    .from(verificationChallenges)
    .where(and(eq(verificationChallenges.userId, params.userId), eq(verificationChallenges.kind, 'phone')))
    .orderBy(desc(verificationChallenges.createdAt))
    .limit(1);
  const now = new Date();
  if (recent) {
    const readyAt = recent.createdAt.getTime() + VERIFICATION_RULES.resendCooldownSeconds * 1000;
    if (readyAt > now.getTime()) {
      return { ok: false, reason: 'cooldown', retryAfterSeconds: Math.ceil((readyAt - now.getTime()) / 1000) };
    }
  }

  const [issuedToday] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(verificationChallenges)
    .where(
      and(
        eq(verificationChallenges.userId, params.userId),
        eq(verificationChallenges.kind, 'phone'),
        sql`${verificationChallenges.createdAt} > now() - interval '24 hours'`,
      ),
    );
  if ((issuedToday?.count ?? 0) >= VERIFICATION_RULES.maxChallengesPerDay) return { ok: false, reason: 'daily_limit' };

  const perMember = await consumeRateLimit(database, RATE_LIMITS.phoneStart, params.userId);
  if (!perMember.allowed) throw errors.rateLimited(perMember.retryAfterSeconds);
  // Keyed by a hash: the rate-limit table should not become a list of numbers.
  const perNumber = await consumeRateLimit(database, RATE_LIMITS.phoneTarget, signalHash('phone_e164', params.phoneE164));
  if (!perNumber.allowed) throw errors.rateLimited(perNumber.retryAfterSeconds);

  const sent = await verifier.start({ to: params.phoneE164, locale: params.locale });
  if (!sent.ok) return { ok: false, reason: sent.reason };

  const expiresAt = new Date(Date.now() + VERIFICATION_RULES.phoneCodeTtlMinutes * 60_000);
  await database.transaction(async (tx) => {
    // One live code at a time, as with email.
    await tx
      .update(verificationChallenges)
      .set({ status: 'expired' })
      .where(
        and(
          eq(verificationChallenges.userId, params.userId),
          eq(verificationChallenges.kind, 'phone'),
          eq(verificationChallenges.status, 'pending'),
        ),
      );
    await tx.insert(verificationChallenges).values({
      userId: params.userId,
      kind: 'phone',
      target: params.phoneE164,
      codeHash: sent.codeHash,
      maxAttempts: VERIFICATION_RULES.maxAttemptsPerChallenge,
      sentAt: new Date(),
      expiresAt,
    });
    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: params.userId,
      action: 'identity.verification_code_issued',
      subjectType: 'user',
      subjectId: params.userId,
      // Neither the code nor the number: only that one was sent, and how.
      metadata: { kind: 'phone', provider: sent.provider },
    });
  });

  return { ok: true, target: params.phoneE164, expiresAt, provider: sent.provider, localCode: sent.localCode };
}

export type PhoneConfirmResult =
  | { ok: true; phoneE164: string }
  | { ok: false; reason: 'no_challenge' | 'expired' | 'too_many_attempts' | 'mismatch' | 'failed' };

export async function confirmPhoneVerification(
  database: Database,
  params: { userId: string; code: string },
): Promise<PhoneConfirmResult> {
  const rate = await consumeRateLimit(database, RATE_LIMITS.verifyCode, params.userId);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  const [challenge] = await database
    .select()
    .from(verificationChallenges)
    .where(
      and(
        eq(verificationChallenges.userId, params.userId),
        eq(verificationChallenges.kind, 'phone'),
        eq(verificationChallenges.status, 'pending'),
      ),
    )
    .orderBy(desc(verificationChallenges.createdAt))
    .limit(1);
  if (!challenge) return { ok: false, reason: 'no_challenge' };

  const expire = () =>
    database.update(verificationChallenges).set({ status: 'expired' }).where(eq(verificationChallenges.id, challenge.id));

  if (challenge.expiresAt <= new Date()) {
    await expire();
    return { ok: false, reason: 'expired' };
  }
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, reason: 'too_many_attempts' };

  let outcome: 'approved' | 'mismatch' | 'expired' | 'failed';
  if (challenge.codeHash) {
    outcome = challenge.codeHash === sha256(params.code) ? 'approved' : 'mismatch';
  } else {
    const verifier = phoneVerifier();
    outcome = verifier ? await verifier.check({ to: challenge.target, code: params.code }) : 'failed';
  }

  if (outcome === 'expired') {
    await expire();
    return { ok: false, reason: 'expired' };
  }
  if (outcome === 'failed') return { ok: false, reason: 'failed' };

  return database.transaction(async (tx) => {
    // Re-read under lock: a second tab may have consumed or replaced it.
    const [locked] = await tx
      .select({ status: verificationChallenges.status, attempts: verificationChallenges.attempts })
      .from(verificationChallenges)
      .where(eq(verificationChallenges.id, challenge.id))
      .for('update');
    if (!locked || locked.status !== 'pending') return { ok: false as const, reason: 'no_challenge' as const };

    if (outcome === 'mismatch') {
      await tx
        .update(verificationChallenges)
        .set({ attempts: locked.attempts + 1 })
        .where(eq(verificationChallenges.id, challenge.id));
      return { ok: false as const, reason: 'mismatch' as const };
    }

    const now = new Date();
    await tx
      .update(verificationChallenges)
      .set({ status: 'approved', consumedAt: now })
      .where(eq(verificationChallenges.id, challenge.id));
    await tx
      .update(users)
      .set({ phoneE164: challenge.target, phoneVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, params.userId));
    await recordPhoneSignal(tx, { userId: params.userId, phoneE164: challenge.target });
    // The reputation rule rewards having a verified phone, once per member:
    // verifying a second number is not a second achievement.
    await applyRule(tx, {
      userId: params.userId,
      ruleKey: 'phone_verified',
      source: 'verification',
      idempotencyKey: `identity.phone_verified:${params.userId}`,
    });
    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: params.userId,
      action: 'identity.phone_verified',
      subjectType: 'user',
      subjectId: params.userId,
    });
    return { ok: true as const, phoneE164: challenge.target };
  });
}
