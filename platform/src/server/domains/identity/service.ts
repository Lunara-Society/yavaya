import { and, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import {
  devices,
  duplicateCandidates,
  notificationPreferences,
  userDevices,
  userProfiles,
  users,
  verificationChallenges,
} from '@/server/db/schema';
import { NEW_USER_RULES, VERIFICATION_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { generateNumericCode, hashPassword, needsRehash, sha256, signalHash, verifyPassword } from '@/server/security/crypto';
import { RATE_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import { recordAudit } from '@/server/domains/audit/service';
import { applyRule, initializeReputation } from '@/server/domains/reputation/service';
import { ensureUserAccount, grantStarterTokensForPeriod } from '@/server/domains/tokens/service';
import { recordReferral, rewardReferral } from '@/server/domains/referrals/service';
import { grantRole } from '@/server/domains/access/authorize';
import { canonicalEmail, emailDomain, normalizeDisplayName, signalEmail } from './normalize';
import { evaluateRisk, recordSignals, storeAssessment } from './risk';
import { allocateYayId, attachYayIdOwner } from './yay-id';

/**
 * Identity service — registration, authentication and the 72-hour new-account
 * monitoring window.
 */

export const registrationSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z
    .string()
    .min(10, 'error.password.too_short')
    .max(200)
    // Length is the dominant factor; a long passphrase is not rejected for
    // lacking a symbol. Breached-password screening is a configuration point.
    .refine((value) => value.trim().length >= 10, 'error.password.too_short'),
  displayName: z.string().trim().min(2).max(60),
  locale: z.enum(['es', 'en']).default('es'),
  locationId: z.string().uuid().optional(),
  acceptedTerms: z.literal(true),
  /** The YAY ID from an invitation link, if the person arrived through one. */
  inviter: z.string().trim().max(20).optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export type RequestContext = {
  networkHash: string | null;
  addressHash: string | null;
  deviceFingerprint: string | null;
  userAgent: string | null;
};

export type RegistrationResult = {
  userId: string;
  yayId: string;
  status: 'pending_verification' | 'restricted';
  riskBand: 'low' | 'elevated' | 'review' | 'block';
  monitoredUntil: Date;
  /**
   * The email verification code. Returned so the caller can hand it to the
   * delivery layer. When no email provider is configured it is the only way to
   * complete verification, and the caller must say so rather than pretend a
   * message was sent.
   */
  emailVerificationCode: string;
};

/**
 * Registers an account.
 *
 * Risk handling, deliberately: a high score never bans at registration. It
 * restricts what the account may do and opens a human review case. Shared
 * networks, families and businesses legitimately collide on several signals,
 * so an automated permanent decision here would be wrong more often than right.
 */
export async function register(
  database: Database,
  input: RegistrationInput,
  context: RequestContext,
): Promise<RegistrationResult> {
  const parsed = registrationSchema.parse(input);

  const rateSubject = context.addressHash ?? 'unknown';
  const rate = await consumeRateLimit(database, RATE_LIMITS.register, rateSubject);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  const email = canonicalEmail(parsed.email);
  const folded = signalEmail(email);
  const domain = emailDomain(email);
  const displayName = normalizeDisplayName(parsed.displayName);

  const passwordHash = await hashPassword(parsed.password);
  const verificationCode = generateNumericCode(6);

  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      // Same message shape as success would produce at the API layer; the route
      // must not let this distinguish "registered" from "not registered".
      throw errors.conflict('error.registration.email_unavailable');
    }

    const evaluation = await evaluateRisk(tx, {
      emailSignal: folded,
      emailDomain: domain,
      deviceFingerprint: context.deviceFingerprint,
      networkHash: context.networkHash,
    });

    const now = new Date();
    const monitoredUntil = new Date(now.getTime() + NEW_USER_RULES.monitoringWindowHours * 3_600_000);
    const yayId = await allocateYayId(tx);

    // `block` means "a human must look at this before the account can act",
    // not "this person is banned".
    const status = evaluation.band === 'block' ? 'restricted' : 'pending_verification';

    const [created] = await tx
      .insert(users)
      .values({
        yayId,
        email,
        emailNormalized: folded,
        passwordHash,
        displayName,
        locale: parsed.locale,
        status,
        trustState: 'monitored',
        monitoredUntil,
      })
      .returning({ id: users.id });

    if (!created) throw errors.internal('user insert returned no row');
    const userId = created.id;

    await attachYayIdOwner(tx, yayId, userId);

    await tx.insert(userProfiles).values({
      userId,
      locationId: parsed.locationId ?? null,
    });

    await recordSignals(tx, {
      userId,
      emailSignal: folded,
      emailDomain: domain,
      deviceFingerprint: context.deviceFingerprint,
      networkHash: context.networkHash,
    });

    if (context.deviceFingerprint) {
      await linkDevice(tx, userId, context.deviceFingerprint);
    }

    const assessmentId = await storeAssessment(tx, {
      userId,
      context: 'registration',
      evaluation,
    });

    for (const matchedUserId of evaluation.matchedUserIds) {
      await tx
        .insert(duplicateCandidates)
        .values({
          userId,
          matchedUserId,
          score: evaluation.score,
          reasons: evaluation.factors.map((factor) => ({ code: factor.code, weight: factor.weight })),
        })
        .onConflictDoNothing({ target: [duplicateCandidates.userId, duplicateCandidates.matchedUserId] });
    }

    if (parsed.inviter) {
      await recordReferral(tx, { inviteeUserId: userId, inviterCode: parsed.inviter, matchedUserIds: evaluation.matchedUserIds });
    }

    await initializeReputation(tx, userId);
    await ensureUserAccount(tx, userId);
    await grantRole(tx, { userId, roleKey: 'member', grantedBy: null });
    await seedNotificationPreferences(tx, userId);

    // No starter tokens yet: they begin when the email address is verified.

    await tx.insert(verificationChallenges).values({
      userId,
      kind: 'email',
      target: email,
      codeHash: sha256(verificationCode),
      maxAttempts: VERIFICATION_RULES.maxAttemptsPerChallenge,
      expiresAt: new Date(now.getTime() + VERIFICATION_RULES.emailCodeTtlMinutes * 60_000),
    });

    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: userId,
      action: 'identity.account_created',
      subjectType: 'user',
      subjectId: userId,
      ipHash: context.addressHash,
      userAgentHash: context.userAgent ? signalHash('ua', context.userAgent) : null,
      metadata: {
        yayId,
        status,
        riskScore: evaluation.score,
        riskBand: evaluation.band,
        riskAssessmentId: assessmentId,
        monitoredUntil: monitoredUntil.toISOString(),
      },
    });

    return {
      userId,
      yayId,
      status,
      riskBand: evaluation.band,
      monitoredUntil,
      emailVerificationCode: verificationCode,
    };
  });
}

export type AuthenticationResult =
  | { ok: true; userId: string; yayId: string; status: string }
  | { ok: false; reason: 'invalid_credentials' | 'account_unavailable' };

/**
 * Verifies credentials.
 *
 * A wrong password and an unknown address produce the same result and take
 * comparable time — a dummy verification runs when no user matched, so the
 * response does not reveal which addresses are registered.
 */
export async function authenticate(
  database: Database,
  params: { email: string; password: string },
  context: RequestContext,
): Promise<AuthenticationResult> {
  const email = canonicalEmail(params.email);
  const subject = context.addressHash ?? 'unknown';

  const rate = await consumeRateLimit(database, RATE_LIMITS.login, subject);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  const [user] = await database
    .select({
      id: users.id,
      yayId: users.yayId,
      passwordHash: users.passwordHash,
      status: users.status,
      deactivatedAt: users.deactivatedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Equalises timing against the real verification path.
    await verifyPassword(params.password, DUMMY_HASH);
    return { ok: false, reason: 'invalid_credentials' };
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) return { ok: false, reason: 'invalid_credentials' };

  if (user.deactivatedAt || user.status === 'banned' || user.status === 'suspended') {
    return { ok: false, reason: 'account_unavailable' };
  }

  // Transparently upgrade a hash produced with weaker parameters.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPassword(params.password);
    await database
      .update(users)
      .set({ passwordHash: upgraded, passwordUpdatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  await database.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

  return { ok: true, userId: user.id, yayId: user.yayId, status: user.status };
}

/**
 * A hash of a value no user can supply, used only to spend comparable time
 * when no account matched.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Consumes an email verification code.
 *
 * Phone codes go through phone/service.ts instead: a phone check may have to
 * ask the provider, and confirming one writes the number to the account.
 */
export async function consumeVerificationCode(
  database: Database,
  params: { userId: string; kind: 'email'; code: string },
): Promise<{ ok: boolean; reason?: 'expired' | 'no_challenge' | 'too_many_attempts' | 'mismatch' }> {
  const rate = await consumeRateLimit(database, RATE_LIMITS.verifyCode, params.userId);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  return database.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.userId, params.userId),
          eq(verificationChallenges.kind, params.kind),
          eq(verificationChallenges.status, 'pending'),
        ),
      )
      .orderBy(sql`${verificationChallenges.createdAt} desc`)
      .limit(1)
      .for('update');

    if (!challenge) return { ok: false, reason: 'no_challenge' as const };

    if (challenge.expiresAt <= new Date()) {
      await tx
        .update(verificationChallenges)
        .set({ status: 'expired' })
        .where(eq(verificationChallenges.id, challenge.id));
      return { ok: false, reason: 'expired' as const };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return { ok: false, reason: 'too_many_attempts' as const };
    }

    if (!challenge.codeHash || challenge.codeHash !== sha256(params.code)) {
      await tx
        .update(verificationChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(verificationChallenges.id, challenge.id));
      return { ok: false, reason: 'mismatch' as const };
    }

    const now = new Date();
    await tx
      .update(verificationChallenges)
      .set({ status: 'approved', consumedAt: now })
      .where(eq(verificationChallenges.id, challenge.id));

    await tx
      .update(users)
      .set({
        emailVerifiedAt: now,
        // Verification lifts a pending account into normal use. A restricted
        // account stays restricted until a human clears its review case.
        status: sql`case when ${users.status} = 'pending_verification' then 'active'::account_status else ${users.status} end`,
      })
      .where(eq(users.id, params.userId));

    // Day 0 of the starter allocation; the scheduler grants days 1 to 6. A
    // restricted account waits: it gets nothing until a human clears it, and
    // by then its window may have passed — free tokens are not owed to an
    // account under review.
    const [verified] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.userId));
    if (verified?.status === 'active') {
      await grantStarterTokensForPeriod(tx, { userId: params.userId, verifiedAt: now, now });
      // An invitation is thanked here, not at registration: an unverified
      // throwaway address earns its inviter nothing.
      await rewardReferral(tx, { inviteeUserId: params.userId, now });
    }

    // The reputation table's own rule for it, once per member.
    await applyRule(tx, {
      userId: params.userId,
      ruleKey: 'email_verified',
      source: 'verification',
      idempotencyKey: `identity.email_verified:${params.userId}`,
    });

    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: params.userId,
      action: 'identity.email_verified',
      subjectType: 'user',
      subjectId: params.userId,
    });

    return { ok: true };
  });
}

export type VerificationReissue =
  | {
      ok: true;
      code: string;
      expiresAt: Date;
      /** Canonical address the code must be sent to — never the one a form supplied. */
      email: string;
      locale: 'es' | 'en';
    }
  | { ok: false; reason: 'already_verified' | 'cooldown' | 'daily_limit'; retryAfterSeconds?: number };

/**
 * Issues a fresh email verification code for an account that has not verified.
 *
 * The address is read from the account, never accepted from the caller: a
 * resend endpoint that took an address would be a way to mail an arbitrary
 * code to an arbitrary inbox.
 *
 * Issuing a new code **expires every pending one**. Otherwise every resend
 * would widen the window of simultaneously-valid codes, and a member who
 * clicks the button five times would leave five live codes behind them.
 *
 * Three limits apply, none of them invented here: the `resend_code` bucket
 * bounds abuse per account, `resendCooldownSeconds` stops rapid-fire requests,
 * and `maxChallengesPerDay` caps the total. The cooldown and the daily cap are
 * measured from the challenge rows rather than a counter, so they survive a
 * counter purge and mean exactly what they say.
 */
export async function reissueEmailVerificationCode(
  database: Database,
  params: { userId: string },
): Promise<VerificationReissue> {
  const rate = await consumeRateLimit(database, RATE_LIMITS.resendCode, params.userId);
  if (!rate.allowed) throw errors.rateLimited(rate.retryAfterSeconds);

  const code = generateNumericCode(6);

  return database.transaction(async (tx) => {
    const [user] = await tx
      .select({
        email: users.email,
        locale: users.locale,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!user) throw errors.notFound('user');
    if (user.emailVerifiedAt) return { ok: false as const, reason: 'already_verified' as const };

    const [recent] = await tx
      .select({ createdAt: verificationChallenges.createdAt })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.userId, params.userId),
          eq(verificationChallenges.kind, 'email'),
        ),
      )
      .orderBy(sql`${verificationChallenges.createdAt} desc`)
      .limit(1);

    const now = new Date();

    if (recent) {
      const readyAt = recent.createdAt.getTime() + VERIFICATION_RULES.resendCooldownSeconds * 1000;
      if (readyAt > now.getTime()) {
        return {
          ok: false as const,
          reason: 'cooldown' as const,
          retryAfterSeconds: Math.ceil((readyAt - now.getTime()) / 1000),
        };
      }
    }

    const [issuedToday] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.userId, params.userId),
          eq(verificationChallenges.kind, 'email'),
          sql`${verificationChallenges.createdAt} > now() - interval '24 hours'`,
        ),
      );

    if ((issuedToday?.count ?? 0) >= VERIFICATION_RULES.maxChallengesPerDay) {
      return { ok: false as const, reason: 'daily_limit' as const };
    }

    await tx
      .update(verificationChallenges)
      .set({ status: 'expired' })
      .where(
        and(
          eq(verificationChallenges.userId, params.userId),
          eq(verificationChallenges.kind, 'email'),
          eq(verificationChallenges.status, 'pending'),
        ),
      );

    const expiresAt = new Date(now.getTime() + VERIFICATION_RULES.emailCodeTtlMinutes * 60_000);

    await tx.insert(verificationChallenges).values({
      userId: params.userId,
      kind: 'email',
      target: user.email,
      codeHash: sha256(code),
      maxAttempts: VERIFICATION_RULES.maxAttemptsPerChallenge,
      expiresAt,
    });

    await recordAudit(tx, {
      actorType: 'user',
      actorUserId: params.userId,
      action: 'identity.verification_code_issued',
      subjectType: 'user',
      subjectId: params.userId,
      // The code itself is never recorded. Only that one was issued.
      metadata: { kind: 'email' },
    });

    return {
      ok: true as const,
      code,
      expiresAt,
      email: user.email,
      locale: user.locale === 'en' ? ('en' as const) : ('es' as const),
    };
  });
}

/**
 * Ends the 72-hour monitoring window for accounts that have completed it.
 *
 * Trust rises only for accounts that are still in good standing — a flagged or
 * restricted account does not graduate simply by waiting. Serious violations
 * are handled by enforcement regardless of account age, so nothing here needs
 * to special-case them.
 */
export async function graduateMonitoredAccounts(
  database: Database,
  options: { now?: Date; limit?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();

  const graduated = await database
    .update(users)
    .set({ trustState: 'standard', updatedAt: now })
    .where(
      and(
        eq(users.trustState, 'monitored'),
        lte(users.monitoredUntil, now),
        eq(users.status, 'active'),
      ),
    )
    .returning({ id: users.id });

  for (const row of graduated) {
    await database.transaction(async (tx) => {
      await recordAudit(tx, {
        actorType: 'system',
        action: 'identity.monitoring_completed',
        subjectType: 'user',
        subjectId: row.id,
        metadata: { trustState: 'standard' },
      });
    });
  }

  return graduated.length;
}

/** True while the account is inside its enhanced monitoring window. */
export function isUnderMonitoring(user: { monitoredUntil: Date; trustState: string }, now = new Date()): boolean {
  return user.trustState === 'monitored' && user.monitoredUntil > now;
}

async function linkDevice(tx: Executor, userId: string, fingerprint: string): Promise<void> {
  const fingerprintHash = signalHash('device_fingerprint', fingerprint);

  const [device] = await tx
    .insert(devices)
    .values({ fingerprintHash, accountCount: 1 })
    .onConflictDoUpdate({
      target: devices.fingerprintHash,
      set: { lastSeenAt: new Date(), accountCount: sql`${devices.accountCount} + 1` },
    })
    .returning({ id: devices.id });

  if (!device) return;

  await tx
    .insert(userDevices)
    .values({ userId, deviceId: device.id })
    .onConflictDoUpdate({
      target: [userDevices.userId, userDevices.deviceId],
      set: { lastSeenAt: new Date() },
    });
}

/** Sensible, privacy-respecting notification defaults. Marketing stays off. */
async function seedNotificationPreferences(tx: Executor, userId: string): Promise<void> {
  const defaults: Array<{ category: string; channel: 'in_app' | 'push' | 'email' | 'sms'; enabled: boolean }> = [
    { category: 'account', channel: 'in_app', enabled: true },
    { category: 'account', channel: 'email', enabled: true },
    { category: 'orders', channel: 'in_app', enabled: true },
    { category: 'moderation', channel: 'in_app', enabled: true },
    { category: 'tokens', channel: 'in_app', enabled: true },
    { category: 'live_activity', channel: 'in_app', enabled: true },
    { category: 'marketing', channel: 'in_app', enabled: false },
    { category: 'marketing', channel: 'email', enabled: false },
  ];

  await tx
    .insert(notificationPreferences)
    .values(defaults.map((row) => ({ userId, ...row })))
    .onConflictDoNothing();
}
