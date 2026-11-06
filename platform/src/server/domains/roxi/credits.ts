import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiCreditAccounts, roxiCreditLedger, roxiSubscriptions } from '@/server/db/schema';
import { ROXI_CREDIT_RULES, ROXI_PLANS, type RoxiPlanKey } from '@/config/business-rules';

/**
 * Roxi's plans and credits: what a member has, and every movement of it.
 *
 * Two pools. Plan credits come with the plan, are refilled at the start of
 * each period and do not roll over; they may dip below zero when a
 * conversation outlasts the balance (it is never cut off mid-sentence), and
 * the next refill starts from that debt. Purchased credits are bought, never
 * go below zero, and stay usable for ROXI_CREDIT_RULES.purchasedCreditMonths
 * after the latest purchase. Use draws on plan credits first.
 *
 * The balances are a cache of the ledger, written in the same transaction as
 * each entry, and an entry is unique per (member, reason, reference): metering
 * the same conversation or crediting the same payment twice changes nothing.
 */

export type PlanState = {
  plan: RoxiPlanKey;
  /** 'free' when there is no paid plan in force. */
  status: 'free' | 'active' | 'canceling';
  source: 'payment' | 'admin' | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  providerSubscriptionId: string | null;
};

const FREE: PlanState = { plan: 'free', status: 'free', source: null, periodStart: null, periodEnd: null, providerSubscriptionId: null };

/** The plan in force at `now`. A paid plan whose period has run out counts as Free until its renewal is confirmed. */
export async function currentPlan(executor: Executor, userId: string, now = new Date()): Promise<PlanState> {
  const [row] = await executor.select().from(roxiSubscriptions).where(eq(roxiSubscriptions.userId, userId)).limit(1);
  if (!row || row.status === 'ended' || row.periodEnd <= now || !(row.plan === 'pro' || row.plan === 'max')) return FREE;
  return {
    plan: row.plan,
    status: row.status === 'canceling' ? 'canceling' : 'active',
    source: row.source === 'admin' ? 'admin' : 'payment',
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    providerSubscriptionId: row.providerSubscriptionId,
  };
}

/** Which grant the plan credits belong to. A new key means a refill. */
export function periodKey(state: PlanState, now = new Date()): string {
  if (state.plan === 'free' || !state.periodStart) return `free:${now.toISOString().slice(0, 7)}`;
  return `${state.plan}:${state.providerSubscriptionId ?? state.source}:${Math.floor(state.periodStart.getTime() / 1000)}`;
}

export type CreditView = {
  plan: PlanState;
  allowance: number;
  planCredits: number;
  purchasedCredits: number;
  purchasedExpiresAt: Date | null;
  /** What can still be spent: never below zero. */
  available: number;
  /** When the plan credits are next refilled. */
  refillsAt: Date;
};

function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

type Account = typeof roxiCreditAccounts.$inferSelect;

async function lockAccount(executor: Executor, userId: string): Promise<Account> {
  await executor.insert(roxiCreditAccounts).values({ userId }).onConflictDoNothing();
  const [account] = await executor.select().from(roxiCreditAccounts).where(eq(roxiCreditAccounts.userId, userId)).limit(1).for('update');
  return account!;
}

/** One ledger entry and the balances it produced. False when this (reason, reference) was already recorded. */
async function record(
  executor: Executor,
  account: Account,
  entry: { planDelta: number; purchasedDelta: number; reason: string; reference: string; purchasedExpiresAt?: Date | null; planPeriodKey?: string },
): Promise<{ recorded: boolean; account: Account }> {
  const planAfter = account.planCredits + entry.planDelta;
  const purchasedAfter = account.purchasedCredits + entry.purchasedDelta;
  const inserted = await executor
    .insert(roxiCreditLedger)
    .values({ userId: account.userId, planDelta: entry.planDelta, purchasedDelta: entry.purchasedDelta, reason: entry.reason, reference: entry.reference, planAfter, purchasedAfter })
    .onConflictDoNothing()
    .returning({ id: roxiCreditLedger.id });
  if (inserted.length === 0) return { recorded: false, account };
  const next: Account = {
    ...account,
    planCredits: planAfter,
    purchasedCredits: purchasedAfter,
    planPeriodKey: entry.planPeriodKey ?? account.planPeriodKey,
    purchasedExpiresAt: entry.purchasedExpiresAt === undefined ? account.purchasedExpiresAt : entry.purchasedExpiresAt,
    updatedAt: new Date(),
  };
  await executor
    .update(roxiCreditAccounts)
    .set({ planCredits: next.planCredits, purchasedCredits: next.purchasedCredits, planPeriodKey: next.planPeriodKey, purchasedExpiresAt: next.purchasedExpiresAt, updatedAt: next.updatedAt })
    .where(eq(roxiCreditAccounts.userId, account.userId));
  return { recorded: true, account: next };
}

/**
 * Brings a member's balances up to date: refills plan credits when a new
 * period has begun and lets purchased credits lapse when their time is up.
 * Call inside a transaction; returns the locked, current account.
 */
async function settle(executor: Executor, userId: string, state: PlanState, now: Date): Promise<Account> {
  let account = await lockAccount(executor, userId);
  if (account.purchasedCredits > 0 && account.purchasedExpiresAt && account.purchasedExpiresAt <= now) {
    ({ account } = await record(executor, account, {
      planDelta: 0,
      purchasedDelta: -account.purchasedCredits,
      reason: 'expiry',
      reference: account.purchasedExpiresAt.toISOString(),
    }));
  }
  const key = periodKey(state, now);
  if (account.planPeriodKey !== key) {
    const allowance = ROXI_PLANS[state.plan].monthlyCredits;
    // An upgrade from Pro to Max keeps what was left of Pro (the member paid
    // for it); any other new period starts from the allowance less any debt.
    const upgrade = account.planPeriodKey.startsWith('pro:') && key.startsWith('max:');
    const target = upgrade ? allowance + account.planCredits : allowance + Math.min(0, account.planCredits);
    ({ account } = await record(executor, account, { planDelta: target - account.planCredits, purchasedDelta: 0, reason: upgrade ? 'carry' : 'reset', reference: key, planPeriodKey: key }));
  }
  return account;
}

function view(account: Account, state: PlanState, now: Date): CreditView {
  return {
    plan: state,
    allowance: ROXI_PLANS[state.plan].monthlyCredits,
    planCredits: account.planCredits,
    purchasedCredits: account.purchasedCredits,
    purchasedExpiresAt: account.purchasedCredits > 0 ? account.purchasedExpiresAt : null,
    available: Math.max(0, account.planCredits) + account.purchasedCredits,
    refillsAt: state.periodEnd ?? nextMonthStart(now),
  };
}

/** The member's plan and credits, refilled if a new period has begun. Runs in its own transaction (a savepoint inside one). */
export async function creditView(executor: Executor, userId: string, now = new Date()): Promise<CreditView> {
  return executor.transaction(async (tx) => {
    const state = await currentPlan(tx, userId, now);
    const account = await settle(tx, userId, state, now);
    return view(account, state, now);
  });
}

/** Whether a new conversation may open: at least ROXI_CREDIT_RULES.minimumToStart credits. */
export function canStart(credits: CreditView): boolean {
  return credits.available >= ROXI_CREDIT_RULES.minimumToStart;
}

/**
 * Uses credits for something that happened (a conversation, a connector
 * call), once per reference. Plan credits first, then purchased; what is left
 * over takes the plan credits below zero rather than refusing — the work is
 * already done and paid for at the provider.
 */
export async function spendCredits(executor: Executor, params: { userId: string; credits: number; reason: 'conversation' | 'connector'; reference: string; now?: Date }): Promise<{ recorded: boolean; view: CreditView }> {
  const now = params.now ?? new Date();
  return executor.transaction(async (tx) => {
    const state = await currentPlan(tx, params.userId, now);
    const account = await settle(tx, params.userId, state, now);
    const credits = Math.max(0, Math.ceil(params.credits));
    const fromPlan = Math.min(credits, Math.max(0, account.planCredits));
    const fromPurchased = Math.min(credits - fromPlan, account.purchasedCredits);
    const debt = credits - fromPlan - fromPurchased;
    const result = await record(tx, account, { planDelta: -(fromPlan + debt), purchasedDelta: -fromPurchased, reason: params.reason, reference: params.reference });
    return { recorded: result.recorded, view: view(result.account, state, now) };
  });
}

/** Credits bought, once per payment. Extends how long all purchased credits stay usable. */
export async function grantPurchasedCredits(executor: Executor, params: { userId: string; credits: number; paymentReference: string; now?: Date }): Promise<boolean> {
  const now = params.now ?? new Date();
  return executor.transaction(async (tx) => {
    const state = await currentPlan(tx, params.userId, now);
    const account = await settle(tx, params.userId, state, now);
    const expires = new Date(now);
    expires.setUTCMonth(expires.getUTCMonth() + ROXI_CREDIT_RULES.purchasedCreditMonths);
    const result = await record(tx, account, { planDelta: 0, purchasedDelta: params.credits, reason: 'purchase', reference: params.paymentReference, purchasedExpiresAt: expires });
    return result.recorded;
  });
}

/** Credits a provider cost in US dollars stands for, rounded up. */
export function creditsForCost(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  return Math.ceil(costUsd / ROXI_CREDIT_RULES.usdPerCredit - 1e-9);
}

/** Starts or renews a paid plan. The period is what the provider (or an administrator) says. */
export async function setPlan(
  executor: Executor,
  params: { userId: string; plan: 'pro' | 'max'; source: 'payment' | 'admin'; providerSubscriptionId: string | null; periodStart: Date; periodEnd: Date; status?: 'active' | 'canceling' },
): Promise<void> {
  const [previous] = await executor.select().from(roxiSubscriptions).where(eq(roxiSubscriptions.userId, params.userId)).limit(1);
  // An upgrade replaces a paid Pro subscription: it must stop billing. The
  // cancellation is a network call, so it is left for after this transaction.
  const replaced =
    previous?.providerSubscriptionId && previous.providerSubscriptionId !== params.providerSubscriptionId && previous.status !== 'ended' ? previous.providerSubscriptionId : (previous?.replacedSubscriptionId ?? null);
  const values = {
    replacedSubscriptionId: replaced,
    plan: params.plan,
    status: params.status ?? 'active',
    source: params.source,
    providerSubscriptionId: params.providerSubscriptionId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    updatedAt: new Date(),
  };
  await executor.insert(roxiSubscriptions).values({ userId: params.userId, ...values }).onConflictDoUpdate({ target: roxiSubscriptions.userId, set: values });
}

export async function setPlanStatus(executor: Executor, userId: string, status: 'active' | 'canceling' | 'ended', periodEnd?: Date): Promise<void> {
  await executor
    .update(roxiSubscriptions)
    .set({ status, ...(periodEnd ? { periodEnd } : {}), updatedAt: new Date() })
    .where(eq(roxiSubscriptions.userId, userId));
}

/** The member's recent credit movements, newest first. */
export async function creditHistory(executor: Executor, userId: string, limit = 20) {
  return executor
    .select({ planDelta: roxiCreditLedger.planDelta, purchasedDelta: roxiCreditLedger.purchasedDelta, reason: roxiCreditLedger.reason, createdAt: roxiCreditLedger.createdAt })
    .from(roxiCreditLedger)
    .where(eq(roxiCreditLedger.userId, userId))
    .orderBy(sql`${roxiCreditLedger.id} desc`)
    .limit(limit);
}

/** Credits used this period, for the plan page. */
export async function usedSince(executor: Executor, userId: string, since: Date): Promise<number> {
  const [row] = await executor
    .select({ used: sql<number>`coalesce(-sum(${roxiCreditLedger.planDelta} + ${roxiCreditLedger.purchasedDelta}), 0)::int` })
    .from(roxiCreditLedger)
    .where(and(eq(roxiCreditLedger.userId, userId), sql`${roxiCreditLedger.reason} in ('conversation', 'connector')`, gte(roxiCreditLedger.createdAt, since)));
  return Number(row?.used ?? 0);
}
