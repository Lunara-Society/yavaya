import { and, eq, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import {
  billableActions,
  rewardGrants,
  starterGrants,
  tokenAccounts,
  tokenLedger,
} from '@/server/db/schema';
import { TOKEN_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';

/**
 * Token service.
 *
 * Rules this module exists to guarantee:
 *  - a balance only ever changes together with an immutable ledger entry;
 *  - a charge happens server-side, atomically, and exactly once;
 *  - a retried or duplicated request never charges twice;
 *  - a failed action never consumes tokens (the whole transaction rolls back);
 *  - only declared billable actions can cost anything.
 *
 * Every mutating function takes a transaction. Callers wrap the domain action
 * and its charge in one transaction so the two cannot diverge.
 */

export const TREASURY_HANDLE = 'treasury:primary';

export type TokenEntryReason =
  | 'starter_grant'
  | 'purchase'
  | 'admin_grant'
  | 'admin_revoke'
  | 'admin_correction'
  | 'reward'
  | 'referral'
  | 'tavern_reward'
  | 'action_charge'
  | 'action_refund'
  | 'transfer_in'
  | 'transfer_out';

export type LedgerResult = {
  balance: number;
  /** True when the idempotency key had already been applied; nothing changed. */
  deduplicated: boolean;
  entryId: string | null;
};

/** Creates the user's token account on first use. Idempotent. */
export async function ensureUserAccount(tx: Executor, userId: string): Promise<string> {
  const [existing] = await tx
    .select({ id: tokenAccounts.id })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.userId, userId))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(tokenAccounts)
    .values({ kind: 'user', userId })
    .onConflictDoNothing({ target: tokenAccounts.userId })
    .returning({ id: tokenAccounts.id });
  if (created) return created.id;

  const [raced] = await tx
    .select({ id: tokenAccounts.id })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.userId, userId))
    .limit(1);
  if (!raced) throw errors.internal('token account could not be created');
  return raced.id;
}

export async function getBalance(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .select({ balance: tokenAccounts.balance })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.userId, userId))
    .limit(1);
  return row?.balance ?? 0;
}

/**
 * Applies a signed change to one account.
 *
 * The account row is locked before the idempotency check, so two concurrent
 * requests with the same key serialise and the second one observes the first.
 */
async function applyEntry(
  tx: Executor,
  params: {
    accountId: string;
    delta: number;
    reason: TokenEntryReason;
    idempotencyKey: string;
    billableActionKey?: string | null;
    groupId?: string | null;
    relatedType?: string | null;
    relatedId?: string | null;
    actorUserId?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerResult> {
  if (!Number.isInteger(params.delta) || params.delta === 0) {
    throw errors.validation('error.tokens.invalid_amount', { delta: params.delta });
  }

  const locked = await tx
    .select({ id: tokenAccounts.id, balance: tokenAccounts.balance })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.id, params.accountId))
    .limit(1)
    .for('update');

  const account = locked[0];
  if (!account) throw errors.notFound('token_account');

  const [duplicate] = await tx
    .select({ id: tokenLedger.id, balanceAfter: tokenLedger.balanceAfter })
    .from(tokenLedger)
    .where(eq(tokenLedger.idempotencyKey, params.idempotencyKey))
    .limit(1);

  if (duplicate) {
    return { balance: account.balance, deduplicated: true, entryId: String(duplicate.id) };
  }

  const balanceAfter = account.balance + params.delta;
  if (balanceAfter < 0) {
    throw errors.insufficientTokens(Math.abs(params.delta), account.balance);
  }

  await tx
    .update(tokenAccounts)
    .set({
      balance: balanceAfter,
      lifetimeEarned:
        params.delta > 0
          ? sql`${tokenAccounts.lifetimeEarned} + ${params.delta}`
          : tokenAccounts.lifetimeEarned,
      lifetimeSpent:
        params.delta < 0
          ? sql`${tokenAccounts.lifetimeSpent} + ${Math.abs(params.delta)}`
          : tokenAccounts.lifetimeSpent,
      updatedAt: new Date(),
    })
    .where(eq(tokenAccounts.id, params.accountId));

  const [entry] = await tx
    .insert(tokenLedger)
    .values({
      accountId: params.accountId,
      delta: params.delta,
      balanceAfter,
      reason: params.reason,
      billableActionKey: params.billableActionKey ?? null,
      idempotencyKey: params.idempotencyKey,
      groupId: params.groupId ?? null,
      relatedType: params.relatedType ?? null,
      relatedId: params.relatedId ?? null,
      actorUserId: params.actorUserId ?? null,
      note: params.note ?? null,
      metadata: params.metadata ?? {},
    })
    .returning({ id: tokenLedger.id });

  return { balance: balanceAfter, deduplicated: false, entryId: entry ? String(entry.id) : null };
}

/**
 * Charges a user for a declared billable action.
 *
 * Not every interaction costs tokens — only keys present and enabled in
 * `billable_actions`. An unknown key is a programming error and is rejected.
 */
export async function chargeForAction(
  tx: Executor,
  params: {
    userId: string;
    actionKey: string;
    /** Stable per-attempt key, e.g. `listing:<draftId>:publish`. */
    idempotencyKey: string;
    relatedType?: string;
    relatedId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerResult & { cost: number }> {
  const [action] = await tx
    .select()
    .from(billableActions)
    .where(eq(billableActions.key, params.actionKey))
    .limit(1);

  if (!action || !action.enabled) throw errors.actionNotBillable(params.actionKey);
  if (action.cost <= 0) {
    // A zero-cost action must not write a ledger entry at all.
    return { balance: await getBalance(tx, params.userId), deduplicated: true, entryId: null, cost: 0 };
  }

  const accountId = await ensureUserAccount(tx, params.userId);
  const result = await applyEntry(tx, {
    accountId,
    delta: -action.cost,
    reason: 'action_charge',
    idempotencyKey: params.idempotencyKey,
    billableActionKey: action.key,
    relatedType: params.relatedType ?? null,
    relatedId: params.relatedId ?? null,
    actorUserId: params.userId,
    metadata: params.metadata ?? {},
  });

  return { ...result, cost: action.cost };
}

/** Refunds a charge whose action could not be completed. */
export async function refundAction(
  tx: Executor,
  params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    relatedType?: string;
    relatedId?: string;
    note?: string;
  },
): Promise<LedgerResult> {
  const accountId = await ensureUserAccount(tx, params.userId);
  return applyEntry(tx, {
    accountId,
    delta: Math.abs(params.amount),
    reason: 'action_refund',
    idempotencyKey: params.idempotencyKey,
    relatedType: params.relatedType ?? null,
    relatedId: params.relatedId ?? null,
    note: params.note ?? null,
  });
}

/**
 * Starter allocation: 2 tokens per 24h period for the first 7 days, 14 max.
 *
 * `periodIndex` is derived from account age, and the unique constraint on
 * (user, period) is what makes the grant unrepeatable — not a timer, not a
 * cron job's memory.
 */
export async function grantStarterTokensForPeriod(
  tx: Executor,
  params: { userId: string; accountCreatedAt: Date; now?: Date },
): Promise<{ granted: number; periodIndex: number | null; balance: number }> {
  const now = params.now ?? new Date();
  const elapsedMs = now.getTime() - params.accountCreatedAt.getTime();
  const periodIndex = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (elapsedMs < 0 || periodIndex >= TOKEN_RULES.starterGrantDays) {
    return { granted: 0, periodIndex: null, balance: await getBalance(tx, params.userId) };
  }

  const alreadyGranted = await tx
    .select({ amount: starterGrants.amount })
    .from(starterGrants)
    .where(eq(starterGrants.userId, params.userId));

  const total = alreadyGranted.reduce((sum, row) => sum + row.amount, 0);
  const remaining = TOKEN_RULES.starterGrantMaximum - total;
  if (remaining <= 0) {
    return { granted: 0, periodIndex, balance: await getBalance(tx, params.userId) };
  }

  const amount = Math.min(TOKEN_RULES.starterGrantPerDay, remaining);

  const claimed = await tx
    .insert(starterGrants)
    .values({ userId: params.userId, periodIndex, amount })
    .onConflictDoNothing({ target: [starterGrants.userId, starterGrants.periodIndex] })
    .returning({ periodIndex: starterGrants.periodIndex });

  if (claimed.length === 0) {
    return { granted: 0, periodIndex, balance: await getBalance(tx, params.userId) };
  }

  const accountId = await ensureUserAccount(tx, params.userId);
  const result = await applyEntry(tx, {
    accountId,
    delta: amount,
    reason: 'starter_grant',
    idempotencyKey: `starter:${params.userId}:${periodIndex}`,
    metadata: { periodIndex },
  });

  return { granted: amount, periodIndex, balance: result.balance };
}

/**
 * Credits an earned reward, subject to a dedupe key so the same contribution
 * cannot be rewarded twice and repetitive automated behaviour cannot farm an
 * unlimited balance.
 */
export async function grantReward(
  tx: Executor,
  params: {
    userId: string;
    ruleKey: string;
    amount: number;
    dedupeKey: string;
    reason?: Extract<TokenEntryReason, 'reward' | 'referral' | 'tavern_reward'>;
    maxPerDay?: number;
  },
): Promise<{ granted: number; balance: number; reason: 'granted' | 'duplicate' | 'daily_cap' }> {
  if (params.maxPerDay !== undefined) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rewardGrants)
      .where(
        and(
          eq(rewardGrants.userId, params.userId),
          eq(rewardGrants.ruleKey, params.ruleKey),
          gte(rewardGrants.grantedAt, since),
        ),
      );
    if (count >= params.maxPerDay) {
      return { granted: 0, balance: await getBalance(tx, params.userId), reason: 'daily_cap' };
    }
  }

  const claimed = await tx
    .insert(rewardGrants)
    .values({
      userId: params.userId,
      ruleKey: params.ruleKey,
      amount: params.amount,
      dedupeKey: params.dedupeKey,
    })
    .onConflictDoNothing({ target: [rewardGrants.ruleKey, rewardGrants.dedupeKey] })
    .returning({ id: rewardGrants.id });

  if (claimed.length === 0) {
    return { granted: 0, balance: await getBalance(tx, params.userId), reason: 'duplicate' };
  }

  const accountId = await ensureUserAccount(tx, params.userId);
  const result = await applyEntry(tx, {
    accountId,
    delta: params.amount,
    reason: params.reason ?? 'reward',
    idempotencyKey: `reward:${params.ruleKey}:${params.dedupeKey}`,
    metadata: { ruleKey: params.ruleKey },
  });

  return { granted: params.amount, balance: result.balance, reason: 'granted' };
}

async function getTreasuryAccountId(tx: Executor): Promise<string> {
  const [row] = await tx
    .select({ id: tokenAccounts.id })
    .from(tokenAccounts)
    .where(eq(tokenAccounts.handle, TREASURY_HANDLE))
    .limit(1);
  if (!row) throw errors.internal('treasury account is missing; run the seed');
  return row.id;
}

/**
 * Administrative grant. Tokens move *out of the treasury* and into the user —
 * they are never conjured, so the treasury balance stays meaningful and the
 * total supply is always reconcilable.
 */
export async function adminGrantTokens(
  tx: Executor,
  params: {
    adminUserId: string;
    targetUserId: string;
    amount: number;
    note: string;
    idempotencyKey: string;
  },
): Promise<{ userBalance: number; treasuryBalance: number; deduplicated: boolean }> {
  if (params.amount <= 0) throw errors.validation('error.tokens.invalid_amount');

  const treasuryId = await getTreasuryAccountId(tx);
  const userAccountId = await ensureUserAccount(tx, params.targetUserId);
  const groupId = crypto.randomUUID();

  const [firstId, secondId] = [treasuryId, userAccountId].sort();
  // Lock in a stable order so concurrent grants cannot deadlock.
  await tx.select({ id: tokenAccounts.id }).from(tokenAccounts).where(eq(tokenAccounts.id, firstId as string)).for('update');
  await tx.select({ id: tokenAccounts.id }).from(tokenAccounts).where(eq(tokenAccounts.id, secondId as string)).for('update');

  const out = await applyEntry(tx, {
    accountId: treasuryId,
    delta: -params.amount,
    reason: 'transfer_out',
    idempotencyKey: `${params.idempotencyKey}:out`,
    groupId,
    actorUserId: params.adminUserId,
    note: params.note,
    metadata: { targetUserId: params.targetUserId },
  });

  const credit = await applyEntry(tx, {
    accountId: userAccountId,
    delta: params.amount,
    reason: 'admin_grant',
    idempotencyKey: `${params.idempotencyKey}:in`,
    groupId,
    actorUserId: params.adminUserId,
    note: params.note,
  });

  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: params.adminUserId,
    action: 'tokens.admin_grant',
    subjectType: 'user',
    subjectId: params.targetUserId,
    metadata: {
      amount: params.amount,
      note: params.note,
      deduplicated: credit.deduplicated,
      userBalanceAfter: credit.balance,
      treasuryBalanceAfter: out.balance,
    },
  });

  return {
    userBalance: credit.balance,
    treasuryBalance: out.balance,
    deduplicated: credit.deduplicated,
  };
}

/** Administrative revocation. Tokens return to the treasury. */
export async function adminRevokeTokens(
  tx: Executor,
  params: {
    adminUserId: string;
    targetUserId: string;
    amount: number;
    note: string;
    idempotencyKey: string;
  },
): Promise<{ userBalance: number; treasuryBalance: number; deduplicated: boolean }> {
  if (params.amount <= 0) throw errors.validation('error.tokens.invalid_amount');

  const treasuryId = await getTreasuryAccountId(tx);
  const userAccountId = await ensureUserAccount(tx, params.targetUserId);
  const groupId = crypto.randomUUID();

  const [firstId, secondId] = [treasuryId, userAccountId].sort();
  await tx.select({ id: tokenAccounts.id }).from(tokenAccounts).where(eq(tokenAccounts.id, firstId as string)).for('update');
  await tx.select({ id: tokenAccounts.id }).from(tokenAccounts).where(eq(tokenAccounts.id, secondId as string)).for('update');

  const debit = await applyEntry(tx, {
    accountId: userAccountId,
    delta: -params.amount,
    reason: 'admin_revoke',
    idempotencyKey: `${params.idempotencyKey}:out`,
    groupId,
    actorUserId: params.adminUserId,
    note: params.note,
  });

  const back = await applyEntry(tx, {
    accountId: treasuryId,
    delta: params.amount,
    reason: 'transfer_in',
    idempotencyKey: `${params.idempotencyKey}:in`,
    groupId,
    actorUserId: params.adminUserId,
    note: params.note,
    metadata: { targetUserId: params.targetUserId },
  });

  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: params.adminUserId,
    action: 'tokens.admin_revoke',
    subjectType: 'user',
    subjectId: params.targetUserId,
    metadata: {
      amount: params.amount,
      note: params.note,
      userBalanceAfter: debit.balance,
      treasuryBalanceAfter: back.balance,
    },
  });

  return { userBalance: debit.balance, treasuryBalance: back.balance, deduplicated: debit.deduplicated };
}

/** Credits tokens delivered by a verified payment. Never called from a client. */
export async function creditPurchasedTokens(
  tx: Executor,
  params: {
    userId: string;
    tokens: number;
    paymentTransactionId: string;
  },
): Promise<LedgerResult> {
  if (params.tokens > TOKEN_RULES.maxTokensPerPurchase) {
    throw errors.validation('error.tokens.purchase_limit_exceeded', {
      limit: TOKEN_RULES.maxTokensPerPurchase,
    });
  }
  const accountId = await ensureUserAccount(tx, params.userId);
  return applyEntry(tx, {
    accountId,
    delta: params.tokens,
    reason: 'purchase',
    // The payment id is the natural idempotency key: one payment, one credit.
    idempotencyKey: `purchase:${params.paymentTransactionId}`,
    relatedType: 'payment_transaction',
    relatedId: params.paymentTransactionId,
  });
}
