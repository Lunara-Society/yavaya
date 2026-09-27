import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { starterGrants, tokenAccounts, tokenLedger, users } from '@/server/db/schema';
import {
  TREASURY_HANDLE,
  adminGrantTokens,
  adminRevokeTokens,
  chargeForAction,
  creditPurchasedTokens,
  ensureUserAccount,
  getBalance,
  grantReward,
  grantStarterTokensForPeriod,
  refundAction,
} from '@/server/domains/tokens/service';
import { register } from '@/server/domains/identity/service';
import { TOKEN_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';
import { expectAppendOnlyRefusal } from '../helpers/errors';

const context = {
  networkHash: null,
  addressHash: 'tokens-test',
  deviceFingerprint: null,
  userAgent: 'vitest',
};

async function createUser(): Promise<{ userId: string; createdAt: Date }> {
  const result = await register(
    db(),
    {
      email: `token-user-${crypto.randomUUID()}@example.com`,
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Token Tester',
      locale: 'es',
      acceptedTerms: true,
    },
    context,
  );
  const [row] = await db()
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, result.userId));
  return { userId: result.userId, createdAt: row?.createdAt ?? new Date() };
}

async function treasuryBalance(): Promise<number> {
  const [row] = await db()
    .select({ balance: tokenAccounts.balance })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.handle, TREASURY_HANDLE));
  return row?.balance ?? 0;
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('charging for actions', () => {
  it('charges exactly the declared cost, once', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);

    const result = await db().transaction((tx) =>
      chargeForAction(tx, {
        userId,
        actionKey: 'mercadito.publish_listing',
        idempotencyKey: 'listing:abc:publish',
      }),
    );

    expect(result.cost).toBe(1);
    expect(result.deduplicated).toBe(false);
    expect(await getBalance(db(), userId)).toBe(before - 1);
  });

  it('does not double-charge a retried request', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);
    const key = 'listing:retry:publish';

    await db().transaction((tx) =>
      chargeForAction(tx, { userId, actionKey: 'mercadito.publish_listing', idempotencyKey: key }),
    );
    const retry = await db().transaction((tx) =>
      chargeForAction(tx, { userId, actionKey: 'mercadito.publish_listing', idempotencyKey: key }),
    );

    expect(retry.deduplicated).toBe(true);
    expect(await getBalance(db(), userId)).toBe(before - 1);

    const entries = await db()
      .select()
      .from(tokenLedger)
      .where(eq(tokenLedger.idempotencyKey, key));
    expect(entries).toHaveLength(1);
  });

  it('does not double-charge under concurrency', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);
    const key = 'listing:concurrent:publish';

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        db().transaction((tx) =>
          chargeForAction(tx, {
            userId,
            actionKey: 'mercadito.publish_listing',
            idempotencyKey: key,
          }),
        ),
      ),
    );

    // Some attempts may lose a race and roll back; what matters is that the
    // balance moved by exactly one charge and only one entry exists.
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    expect(await getBalance(db(), userId)).toBe(before - 1);

    const entries = await db().select().from(tokenLedger).where(eq(tokenLedger.idempotencyKey, key));
    expect(entries).toHaveLength(1);
  });

  it('consumes nothing when the action itself fails', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);

    await expect(
      db().transaction(async (tx) => {
        await chargeForAction(tx, {
          userId,
          actionKey: 'mercadito.publish_listing',
          idempotencyKey: 'listing:doomed:publish',
        });
        throw new Error('the publish step failed');
      }),
    ).rejects.toThrow('the publish step failed');

    // The charge rolled back with the action.
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('refuses an undeclared action key', async () => {
    const { userId } = await createUser();
    await expect(
      db().transaction((tx) =>
        chargeForAction(tx, {
          userId,
          actionKey: 'not.a.real.action',
          idempotencyKey: 'x:1',
        }),
      ),
    ).rejects.toMatchObject({ code: 'action_not_billable' });
  });

  it('writes no ledger entry for a free action', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);

    const result = await db().transaction((tx) =>
      chargeForAction(tx, {
        userId,
        actionKey: 'community.publish_request',
        idempotencyKey: 'community:1',
      }),
    );

    expect(result.cost).toBe(0);
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('refuses to overdraw', async () => {
    const { userId } = await createUser();
    const balance = await getBalance(db(), userId);

    for (let i = 0; i < balance; i += 1) {
      await db().transaction((tx) =>
        chargeForAction(tx, {
          userId,
          actionKey: 'mercadito.publish_listing',
          idempotencyKey: `drain:${i}`,
        }),
      );
    }
    expect(await getBalance(db(), userId)).toBe(0);

    await expect(
      db().transaction((tx) =>
        chargeForAction(tx, {
          userId,
          actionKey: 'mercadito.publish_listing',
          idempotencyKey: 'overdraw',
        }),
      ),
    ).rejects.toMatchObject({ code: 'insufficient_tokens' });
  });

  it('refunds an action that could not be completed', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);

    await db().transaction((tx) =>
      chargeForAction(tx, {
        userId,
        actionKey: 'mercadito.publish_listing',
        idempotencyKey: 'listing:refundable:publish',
      }),
    );
    await db().transaction((tx) =>
      refundAction(tx, { userId, amount: 1, idempotencyKey: 'listing:refundable:refund' }),
    );

    expect(await getBalance(db(), userId)).toBe(before);
  });
});

describe('starter allocation', () => {
  it('grants 2 per period, capped at 14 over 7 days, and never twice per period', async () => {
    const { userId, createdAt } = await createUser();

    // Day 0 was granted at registration; granting again in the same period is
    // a no-op.
    const sameDay = await db().transaction((tx) =>
      grantStarterTokensForPeriod(tx, { userId, accountCreatedAt: createdAt, now: createdAt }),
    );
    expect(sameDay.granted).toBe(0);

    for (let day = 1; day < TOKEN_RULES.starterGrantDays; day += 1) {
      const now = new Date(createdAt.getTime() + day * 86_400_000);
      const result = await db().transaction((tx) =>
        grantStarterTokensForPeriod(tx, { userId, accountCreatedAt: createdAt, now }),
      );
      expect(result.granted).toBe(TOKEN_RULES.starterGrantPerDay);
    }

    expect(await getBalance(db(), userId)).toBe(TOKEN_RULES.starterGrantMaximum);

    // Day 7 is outside the window.
    const afterWindow = await db().transaction((tx) =>
      grantStarterTokensForPeriod(tx, {
        userId,
        accountCreatedAt: createdAt,
        now: new Date(createdAt.getTime() + TOKEN_RULES.starterGrantDays * 86_400_000),
      }),
    );
    expect(afterWindow.granted).toBe(0);
    expect(await getBalance(db(), userId)).toBe(TOKEN_RULES.starterGrantMaximum);

    const grants = await db().select().from(starterGrants).where(eq(starterGrants.userId, userId));
    expect(grants).toHaveLength(TOKEN_RULES.starterGrantDays);
  });
});

describe('rewards', () => {
  it('rewards a contribution once and respects the daily cap', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);

    const first = await db().transaction((tx) =>
      grantReward(tx, { userId, ruleKey: 'helpful_answer', amount: 1, dedupeKey: 'answer:1' }),
    );
    expect(first.reason).toBe('granted');

    const duplicate = await db().transaction((tx) =>
      grantReward(tx, { userId, ruleKey: 'helpful_answer', amount: 1, dedupeKey: 'answer:1' }),
    );
    expect(duplicate.reason).toBe('duplicate');

    const capped = await db().transaction((tx) =>
      grantReward(tx, {
        userId,
        ruleKey: 'helpful_answer',
        amount: 1,
        dedupeKey: 'answer:2',
        maxPerDay: 1,
      }),
    );
    expect(capped.reason).toBe('daily_cap');

    expect(await getBalance(db(), userId)).toBe(before + 1);
  });
});

describe('administrative token control', () => {
  it('opens the treasury with 50,000 tokens', async () => {
    expect(await treasuryBalance()).toBe(TOKEN_RULES.adminTreasuryOpeningBalance);
  });

  it('moves tokens out of the treasury on a grant, and back on a revoke', async () => {
    const admin = await createUser();
    const member = await createUser();
    const memberBefore = await getBalance(db(), member.userId);
    const treasuryBefore = await treasuryBalance();

    const granted = await db().transaction((tx) =>
      adminGrantTokens(tx, {
        adminUserId: admin.userId,
        targetUserId: member.userId,
        amount: 25,
        note: 'support gesture',
        idempotencyKey: 'grant:1',
      }),
    );

    expect(granted.userBalance).toBe(memberBefore + 25);
    expect(await treasuryBalance()).toBe(treasuryBefore - 25);

    await db().transaction((tx) =>
      adminRevokeTokens(tx, {
        adminUserId: admin.userId,
        targetUserId: member.userId,
        amount: 25,
        note: 'reversal',
        idempotencyKey: 'revoke:1',
      }),
    );

    expect(await getBalance(db(), member.userId)).toBe(memberBefore);
    expect(await treasuryBalance()).toBe(treasuryBefore);
  });

  it('does not repeat a grant on a retried request', async () => {
    const admin = await createUser();
    const member = await createUser();
    const before = await getBalance(db(), member.userId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await db().transaction((tx) =>
        adminGrantTokens(tx, {
          adminUserId: admin.userId,
          targetUserId: member.userId,
          amount: 10,
          note: 'retry test',
          idempotencyKey: 'grant:retry',
        }),
      );
    }

    expect(await getBalance(db(), member.userId)).toBe(before + 10);
  });
});

describe('purchased tokens', () => {
  it('credits at most the per-purchase ceiling', async () => {
    const { userId } = await createUser();
    await expect(
      db().transaction((tx) =>
        creditPurchasedTokens(tx, {
          userId,
          tokens: TOKEN_RULES.maxTokensPerPurchase + 1,
          paymentTransactionId: crypto.randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('credits a payment exactly once', async () => {
    const { userId } = await createUser();
    const before = await getBalance(db(), userId);
    const paymentTransactionId = crypto.randomUUID();

    await db().transaction((tx) =>
      creditPurchasedTokens(tx, { userId, tokens: 25, paymentTransactionId }),
    );
    const replay = await db().transaction((tx) =>
      creditPurchasedTokens(tx, { userId, tokens: 25, paymentTransactionId }),
    );

    expect(replay.deduplicated).toBe(true);
    expect(await getBalance(db(), userId)).toBe(before + 25);
  });
});

describe('ledger integrity', () => {
  it('rejects any attempt to rewrite or delete an entry', async () => {
    const { userId } = await createUser();
    const accountId = await db().transaction((tx) => ensureUserAccount(tx, userId));

    await expectAppendOnlyRefusal(
      db().execute(sql`update token_ledger set delta = 999 where account_id = ${accountId}`),
    );

    await expectAppendOnlyRefusal(
      db().execute(sql`delete from token_ledger where account_id = ${accountId}`),
    );
  });

  it('keeps the cached balance equal to the last recorded balance', async () => {
    const { userId } = await createUser();
    await db().transaction((tx) =>
      chargeForAction(tx, {
        userId,
        actionKey: 'services.publish_request',
        idempotencyKey: 'services:1',
      }),
    );

    const accountId = await db().transaction((tx) => ensureUserAccount(tx, userId));
    const [latest] = await db()
      .select({ balanceAfter: tokenLedger.balanceAfter })
      .from(tokenLedger)
      .where(eq(tokenLedger.accountId, accountId))
      .orderBy(sql`${tokenLedger.id} desc`)
      .limit(1);

    expect(await getBalance(db(), userId)).toBe(latest?.balanceAfter);
  });
});
