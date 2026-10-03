import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import {
  duplicateCandidates,
  riskAssessments,
  tokenAccounts,
  users,
  verificationChallenges,
  yayIdRegistry,
} from '@/server/db/schema';
import {
  authenticate,
  consumeVerificationCode,
  graduateMonitoredAccounts,
  isUnderMonitoring,
  register,
  reissueEmailVerificationCode,
} from '@/server/domains/identity/service';
import { getScore } from '@/server/domains/reputation/service';
import { getBalance } from '@/server/domains/tokens/service';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { NEW_USER_RULES, VERIFICATION_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = {
  networkHash: null,
  addressHash: 'test-address-hash',
  deviceFingerprint: null,
  userAgent: 'vitest',
};

function registration(overrides: Partial<Parameters<typeof register>[1]> = {}) {
  return {
    email: `person-${crypto.randomUUID()}@example.com`,
    password: 'a-sufficiently-long-passphrase',
    displayName: 'Ana Pérez',
    locale: 'es' as const,
    acceptedTerms: true as const,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('registration', () => {
  it('creates one account with a permanent YAY ID and its supporting records', async () => {
    const result = await register(db(), registration(), context);

    expect(result.yayId).toMatch(/^[1-9]\d{7}$/);
    expect(result.status).toBe('pending_verification');

    const [user] = await db().select().from(users).where(eq(users.id, result.userId));
    expect(user?.yayId).toBe(result.yayId);
    expect(user?.trustState).toBe('monitored');
    expect(user?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(user?.passwordHash).not.toContain('passphrase');

    // The identifier is reserved permanently, so it can never be re-issued.
    const [reserved] = await db()
      .select()
      .from(yayIdRegistry)
      .where(eq(yayIdRegistry.yayId, result.yayId));
    expect(reserved?.userId).toBe(result.userId);

    // Reputation starts at 50. No starter tokens yet: they begin at verification.
    expect(await getScore(db(), result.userId)).toBe(500);
    expect(await getBalance(db(), result.userId)).toBe(0);
  });

  it('allocates a distinct YAY ID to every account', async () => {
    const created = await Promise.all([
      register(db(), registration(), context),
      register(db(), registration(), context),
      register(db(), registration(), context),
    ]);
    const ids = created.map((result) => result.yayId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opens a 72-hour monitoring window', async () => {
    const before = Date.now();
    const result = await register(db(), registration(), context);
    const expected = before + NEW_USER_RULES.monitoringWindowHours * 3_600_000;

    expect(result.monitoredUntil.getTime()).toBeGreaterThanOrEqual(expected - 5_000);
    expect(result.monitoredUntil.getTime()).toBeLessThanOrEqual(expected + 60_000);
    expect(isUnderMonitoring({ monitoredUntil: result.monitoredUntil, trustState: 'monitored' })).toBe(
      true,
    );
  });

  it('refuses a second account on the same address', async () => {
    const input = registration();
    await register(db(), input, context);
    await expect(register(db(), input, context)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('records a risk assessment that can be explained later', async () => {
    const result = await register(db(), registration(), context);
    const [assessment] = await db()
      .select()
      .from(riskAssessments)
      .where(eq(riskAssessments.userId, result.userId));

    expect(assessment).toBeDefined();
    expect(assessment?.context).toBe('registration');
    expect(Array.isArray(assessment?.factors)).toBe(true);
  });

  it('flags a duplicate for human review instead of banning', async () => {
    // Two accounts differing only by a Gmail alias: the folded-email signal
    // matches, which is evidence, not proof.
    const shared = `duplicate.candidate-${Date.now()}`;
    await register(db(), registration({ email: `${shared}@gmail.com` }), context);
    const second = await register(
      db(),
      registration({ email: `${shared.replace('.', '')}+alt@gmail.com` }),
      context,
    );

    const candidates = await db()
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.userId, second.userId));

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.status).toBe('open');

    // Crucially, the account still exists and was not banned.
    const [user] = await db().select().from(users).where(eq(users.id, second.userId));
    expect(user?.status).not.toBe('banned');
  });
});

describe('authentication', () => {
  it('accepts correct credentials and rejects wrong ones identically to unknown ones', async () => {
    const input = registration();
    const created = await register(db(), input, context);
    await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });

    const ok = await authenticate(db(), { email: input.email, password: input.password }, context);
    expect(ok).toMatchObject({ ok: true, userId: created.userId });

    const wrongPassword = await authenticate(
      db(),
      { email: input.email, password: 'not-the-password' },
      context,
    );
    const unknownAddress = await authenticate(
      db(),
      { email: 'nobody@example.com', password: 'not-the-password' },
      context,
    );

    expect(wrongPassword).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(unknownAddress).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('refuses a suspended account', async () => {
    const input = registration();
    const created = await register(db(), input, context);
    await db().update(users).set({ status: 'suspended' }).where(eq(users.id, created.userId));

    const result = await authenticate(db(), { email: input.email, password: input.password }, context);
    expect(result).toEqual({ ok: false, reason: 'account_unavailable' });
  });
});

describe('email verification', () => {
  it('activates the account and is single-use', async () => {
    const created = await register(db(), registration(), context);

    const first = await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });
    expect(first.ok).toBe(true);

    const [user] = await db().select().from(users).where(eq(users.id, created.userId));
    expect(user?.status).toBe('active');
    expect(user?.emailVerifiedAt).not.toBeNull();

    const replay = await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe('no_challenge');
  });

  it('rejects a wrong code without activating anything', async () => {
    const created = await register(db(), registration(), context);
    const result = await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: '000000' === created.emailVerificationCode ? '111111' : '000000',
    });

    expect(result.ok).toBe(false);
    const [user] = await db().select().from(users).where(eq(users.id, created.userId));
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.status).toBe('pending_verification');
  });
});

describe('resending a verification code', () => {
  /** Moves an account's challenges back in time so a cooldown has elapsed. */
  async function ageChallenges(userId: string, seconds: number) {
    await db()
      .update(verificationChallenges)
      .set({ createdAt: sql`now() - (${seconds} * interval '1 second')` })
      .where(eq(verificationChallenges.userId, userId));
  }

  it('refuses inside the cooldown window and says how long is left', async () => {
    const created = await register(db(), registration(), context);

    const result = await reissueEmailVerificationCode(db(), { userId: created.userId });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('cooldown');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(VERIFICATION_RULES.resendCooldownSeconds);
  });

  it('issues a working code and kills the previous one', async () => {
    const created = await register(db(), registration(), context);
    await ageChallenges(created.userId, VERIFICATION_RULES.resendCooldownSeconds + 1);

    const issued = await reissueEmailVerificationCode(db(), { userId: created.userId });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error('unreachable');
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.code).not.toBe(created.emailVerificationCode);

    // The original challenge is retired, not left as a second live code.
    const challenges = await db()
      .select({ status: verificationChallenges.status })
      .from(verificationChallenges)
      .where(eq(verificationChallenges.userId, created.userId));
    expect(challenges).toHaveLength(2);
    expect(challenges.filter((row) => row.status === 'pending')).toHaveLength(1);
    expect(challenges.filter((row) => row.status === 'expired')).toHaveLength(1);

    const withOldCode = await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });
    expect(withOldCode.ok).toBe(false);

    const withNewCode = await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: issued.code,
    });
    expect(withNewCode.ok).toBe(true);

    const [user] = await db().select().from(users).where(eq(users.id, created.userId));
    expect(user?.status).toBe('active');
  });

  it('sends to the address on the account, not one a caller supplies', async () => {
    const input = registration();
    const created = await register(db(), input, context);
    await ageChallenges(created.userId, VERIFICATION_RULES.resendCooldownSeconds + 1);

    const issued = await reissueEmailVerificationCode(db(), { userId: created.userId });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error('unreachable');
    expect(issued.email).toBe(input.email.toLowerCase());
  });

  it('refuses once the address is already verified', async () => {
    const created = await register(db(), registration(), context);
    await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });
    await ageChallenges(created.userId, VERIFICATION_RULES.resendCooldownSeconds + 1);

    const result = await reissueEmailVerificationCode(db(), { userId: created.userId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('already_verified');
  });

  it('stops at the daily cap', async () => {
    const created = await register(db(), registration(), context);

    // Registration created one; fill the rest of the day's allowance.
    const filler = Array.from(
      { length: VERIFICATION_RULES.maxChallengesPerDay - 1 },
      () => ({
        userId: created.userId,
        kind: 'email' as const,
        target: 'filler@example.com',
        codeHash: null,
        status: 'expired' as const,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    await db().insert(verificationChallenges).values(filler);
    await ageChallenges(created.userId, VERIFICATION_RULES.resendCooldownSeconds + 1);

    const result = await reissueEmailVerificationCode(db(), { userId: created.userId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('daily_limit');
  });
});

describe('monitoring graduation', () => {
  it('promotes an active account once the window has passed', async () => {
    const created = await register(db(), registration(), context);
    await consumeVerificationCode(db(), {
      userId: created.userId,
      kind: 'email',
      code: created.emailVerificationCode,
    });

    // Nothing graduates while the window is open.
    expect(await graduateMonitoredAccounts(db())).toBe(0);

    await db()
      .update(users)
      .set({ monitoredUntil: sql`now() - interval '1 hour'` })
      .where(eq(users.id, created.userId));

    expect(await graduateMonitoredAccounts(db())).toBe(1);

    const [user] = await db().select().from(users).where(eq(users.id, created.userId));
    expect(user?.trustState).toBe('standard');
  });

  it('does not promote an account that never activated', async () => {
    const created = await register(db(), registration(), context);
    await db()
      .update(users)
      .set({ monitoredUntil: sql`now() - interval '1 hour'` })
      .where(eq(users.id, created.userId));

    expect(await graduateMonitoredAccounts(db())).toBe(0);
  });
});

describe('trust shield', () => {
  it('exposes only the public summary', async () => {
    const created = await register(db(), registration(), context);
    const shield = await buildTrustShield(db(), created.userId);

    expect(shield).not.toBeNull();
    expect(shield?.yayId).toBe(`YAY-${created.yayId}`);
    expect(shield?.trustScore).toBe(500);
    expect(shield?.statusKey).toBe('trust.status.unverified');

    // The shape itself is the privacy boundary.
    expect(Object.keys(shield ?? {}).sort()).toEqual(
      [
        'accountAgeDays',
        'cautionKey',
        'displayName',
        'emailVerified',
        'identityVerified',
        'phoneVerified',
        'statusKey',
        'successfulTransactions',
        'trustScore',
        'yayId',
      ].sort(),
    );
  });

  it('creates exactly one token account per user', async () => {
    const created = await register(db(), registration(), context);
    const accounts = await db()
      .select()
      .from(tokenAccounts)
      .where(eq(tokenAccounts.userId, created.userId));
    expect(accounts).toHaveLength(1);
  });
});
