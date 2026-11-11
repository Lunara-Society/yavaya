import 'server-only';
import { and, eq, inArray, isNotNull, lt, ne } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { roxiConversations, roxiSubscriptions, users } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { ROXI_CREDIT_PACKS, ROXI_PLANS } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { isAdmin } from '@/server/domains/access/authorize';
import { startCheckout, stripeProvider } from '@/server/domains/payments/service';
import { memberCountry, routeFor } from '@/server/domains/payments/routing';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { creditsForCost, currentPlan, setPlan, setPlanStatus, spendCredits } from './credits';

/**
 * Paying for Roxi: the monthly plans, extra credits, cancelling, renewals,
 * and metering what each conversation cost.
 *
 * Paid plans are sold only when their limits can be kept. That needs two
 * things: Stripe, to take the money, and an ElevenLabs API key, to read back
 * what each conversation cost (and to hand out signed links, so nobody can
 * open a conversation that is not counted). Without either, the plans page
 * shows the plans with the reason they cannot be bought yet.
 */

export type BillingReadiness = { ready: true } | { ready: false; missing: Array<'payments' | 'metering'> };

export function billingReadiness(): BillingReadiness {
  const missing: Array<'payments' | 'metering'> = [];
  if (!stripeProvider()) missing.push('payments');
  if (!serverEnv().ELEVENLABS_API_KEY) missing.push('metering');
  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}

/** Whether credits are counted at all: without metering, Roxi works as before (daily conversation limit only). */
export function meteringOn(): boolean {
  return Boolean(serverEnv().ELEVENLABS_API_KEY);
}

async function assertCanPay(database: Database, userId: string): Promise<void> {
  const readiness = billingReadiness();
  if (!readiness.ready) throw new DomainError('integration_unconfigured', 'roxi.plans.error.unavailable');
  const route = routeFor(await memberCountry(database, userId));
  if (route.status !== 'ready') throw new DomainError('integration_unconfigured', 'payments.error.country');
  const [user] = await database.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== 'active') throw new DomainError('forbidden', 'payments.error.account');
  // Test cards are not money: in Stripe's test environment only an administrator can buy.
  if (stripeProvider()?.testMode() && !(await isAdmin(database, userId))) throw errors.integrationUnconfigured('payments');
}

const returnTo = (appUrl: string) => `${appUrl.replace(/\/$/, '')}/api/payments/stripe/return?next=roxi`;
const cancelTo = (appUrl: string) => `${appUrl.replace(/\/$/, '')}/roxi?purchase=cancelled`;

/** A monthly plan, on Stripe's page. Moving from Max to Pro waits for Max to end. */
export async function startPlanCheckout(
  database: Database,
  params: { userId: string; plan: 'pro' | 'max'; attemptId: string; appUrl: string; description: string },
): Promise<{ redirectUrl: string }> {
  await assertCanPay(database, params.userId);
  const current = await currentPlan(database, params.userId);
  if (current.plan === params.plan && current.status === 'active') throw errors.conflict('roxi.plans.error.already');
  if (current.plan === 'max' && params.plan === 'pro') throw errors.conflict('roxi.plans.error.downgrade');
  const plan = ROXI_PLANS[params.plan];
  const { redirectUrl } = await startCheckout(database, {
    domain: 'roxi_plan',
    providerKey: 'stripe',
    userId: params.userId,
    amountMinor: plan.priceMinor,
    currency: plan.currency,
    intent: { plan: plan.key, monthlyCredits: plan.monthlyCredits },
    idempotencyKey: `roxi_plan:${params.userId}:${params.attemptId}`,
    description: params.description,
    returnUrl: returnTo(params.appUrl),
    cancelUrl: cancelTo(params.appUrl),
    recurring: 'month',
  });
  return { redirectUrl };
}

/** Extra credits, once, on Stripe's page. */
export async function startCreditPurchase(
  database: Database,
  params: { userId: string; packKey: string; attemptId: string; appUrl: string; description: string },
): Promise<{ redirectUrl: string }> {
  await assertCanPay(database, params.userId);
  const pack = ROXI_CREDIT_PACKS.find((candidate) => candidate.key === params.packKey);
  if (!pack) throw errors.validation('roxi.plans.error.pack');
  const { redirectUrl } = await startCheckout(database, {
    domain: 'roxi_credits',
    providerKey: 'stripe',
    userId: params.userId,
    amountMinor: pack.priceMinor,
    currency: pack.currency,
    intent: { packKey: pack.key, credits: pack.credits },
    idempotencyKey: `roxi_credits:${params.userId}:${params.attemptId}`,
    description: params.description,
    returnUrl: returnTo(params.appUrl),
    cancelUrl: cancelTo(params.appUrl),
  });
  return { redirectUrl };
}

/** Stops the renewal. The plan runs to the end of what was paid. */
export async function cancelPlan(database: Database, userId: string): Promise<void> {
  const state = await currentPlan(database, userId);
  if (state.plan === 'free' || state.source === 'house') throw errors.conflict('roxi.plans.error.no_plan');
  if (state.source === 'payment' && state.providerSubscriptionId) {
    const stripe = stripeProvider();
    if (!stripe) throw new DomainError('integration_unconfigured', 'roxi.plans.error.unavailable');
    await stripe.cancelSubscription(state.providerSubscriptionId, 'period_end');
  }
  await database.transaction(async (tx) => {
    await setPlanStatus(tx, userId, state.source === 'admin' ? 'ended' : 'canceling');
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.plan.cancelled', subjectType: 'user', subjectId: userId, metadata: { plan: state.plan } });
  });
}

/** Changes a mind: the plan renews again. */
export async function resumePlan(database: Database, userId: string): Promise<void> {
  const state = await currentPlan(database, userId);
  if (state.status !== 'canceling' || !state.providerSubscriptionId) throw errors.conflict('roxi.plans.error.no_plan');
  const stripe = stripeProvider();
  if (!stripe) throw new DomainError('integration_unconfigured', 'roxi.plans.error.unavailable');
  await stripe.resumeSubscription(state.providerSubscriptionId);
  await database.transaction(async (tx) => {
    await setPlanStatus(tx, userId, 'active');
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.plan.resumed', subjectType: 'user', subjectId: userId, metadata: { plan: state.plan } });
  });
}

/**
 * An administrator trying a plan for 30 days without paying, to test it.
 * Recorded as `source: admin` and audited; never offered to anyone else.
 */
export async function adminTryPlan(database: Database, userId: string, plan: 'pro' | 'max'): Promise<void> {
  if (!(await isAdmin(database, userId))) throw errors.forbidden();
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 86_400_000);
  await database.transaction(async (tx) => {
    await setPlan(tx, { userId, plan, source: 'admin', providerSubscriptionId: null, periodStart: start, periodEnd: end });
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.plan.admin_trial', subjectType: 'user', subjectId: userId, metadata: { plan } });
  });
}

/**
 * Renewals and endings, read from Stripe for every paid plan whose period
 * has run out, and cancellation of Pro subscriptions an upgrade replaced.
 * Stripe renews on its own; this only learns about it. Idempotent.
 */
export async function plansUpkeep(database: Database, now = new Date()): Promise<{ renewed: number; ended: number; replaced: number }> {
  const stripe = stripeProvider();
  let renewed = 0;
  let ended = 0;
  let replaced = 0;
  const leftovers = await database
    .select({ userId: roxiSubscriptions.userId, id: roxiSubscriptions.replacedSubscriptionId })
    .from(roxiSubscriptions)
    .where(isNotNull(roxiSubscriptions.replacedSubscriptionId));
  for (const row of leftovers) {
    if (!stripe || !row.id) continue;
    try {
      await stripe.cancelSubscription(row.id, 'now');
    } catch (error) {
      // Already cancelled is fine; anything else is retried next time.
      if (!/resource_missing|canceled/.test(error instanceof Error ? error.message : '')) continue;
    }
    await database.update(roxiSubscriptions).set({ replacedSubscriptionId: null, updatedAt: now }).where(eq(roxiSubscriptions.userId, row.userId));
    replaced += 1;
  }

  const due = await database
    .select()
    .from(roxiSubscriptions)
    .where(and(ne(roxiSubscriptions.status, 'ended'), lt(roxiSubscriptions.periodEnd, now)));
  for (const row of due) {
    if (row.source === 'admin' || !row.providerSubscriptionId || !stripe) {
      if (row.source === 'admin' || !row.providerSubscriptionId) {
        await setPlanStatus(database, row.userId, 'ended');
        ended += 1;
      }
      continue;
    }
    let sub;
    try {
      sub = await stripe.getSubscription(row.providerSubscriptionId);
    } catch (error) {
      console.error('roxi plan upkeep: subscription not read', error instanceof Error ? error.message : error);
      continue;
    }
    if ((sub.status === 'active' || sub.status === 'trialing') && sub.periodEnd && sub.periodEnd > row.periodEnd && sub.periodStart) {
      await database.transaction(async (tx) => {
        await setPlan(tx, {
          userId: row.userId,
          plan: row.plan === 'max' ? 'max' : 'pro',
          source: 'payment',
          providerSubscriptionId: row.providerSubscriptionId,
          periodStart: sub.periodStart!,
          periodEnd: sub.periodEnd!,
          status: sub.cancelAtPeriodEnd ? 'canceling' : 'active',
        });
        await recordAudit(tx, { actorType: 'system', action: 'roxi.plan.renewed', subjectType: 'user', subjectId: row.userId, metadata: { plan: row.plan } });
      });
      renewed += 1;
    } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
      await setPlanStatus(database, row.userId, 'ended');
      ended += 1;
    }
    // past_due: Stripe is still retrying the card. The plan counts as Free
    // (its period is over) until the renewal is paid or Stripe gives up.
  }
  return { renewed, ended, replaced };
}

// --- Metering ---------------------------------------------------------------

/**
 * A link for one conversation, with its id, so it can be metered later.
 * ElevenLabs binds the id to the link when asked to (include_conversation_id).
 */
export async function signedConversation(agentId: string): Promise<{ signedUrl: string; conversationId: string | null } | null> {
  const key = serverEnv().ELEVENLABS_API_KEY;
  if (!key) return null;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}&include_conversation_id=true`,
    { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(8000), cache: 'no-store' },
  );
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { signed_url?: string; conversation_id?: string } | null;
  if (!body?.signed_url) return null;
  const fromUrl = (() => {
    try {
      return new URL(body.signed_url).searchParams.get('conversation_id');
    } catch {
      return null;
    }
  })();
  return { signedUrl: body.signed_url, conversationId: body.conversation_id ?? fromUrl };
}

export async function recordConversationStart(database: Database, params: { conversationId: string; userId: string }): Promise<void> {
  await database.insert(roxiConversations).values({ conversationId: params.conversationId, userId: params.userId }).onConflictDoNothing();
}

const CONVERSATION_ID = /^conv_[a-z0-9]{10,64}$/;

/**
 * The browser says which conversation it just had. Recorded only if
 * ElevenLabs agrees it was this member's (the YAY ID the conversation was
 * opened with), so nobody can charge a conversation to someone else.
 */
export async function claimConversation(database: Database, params: { conversationId: string; userId: string; yayId: string }): Promise<boolean> {
  if (!CONVERSATION_ID.test(params.conversationId)) return false;
  const [known] = await database.select({ userId: roxiConversations.userId }).from(roxiConversations).where(eq(roxiConversations.conversationId, params.conversationId)).limit(1);
  if (known) return known.userId === params.userId;
  const remote = await fetchConversation(params.conversationId);
  if (!remote || remote.userId !== formatYayId(params.yayId)) return false;
  await recordConversationStart(database, params);
  return true;
}

type RemoteConversation = { status: string; costUsd: number | null; durationSeconds: number; userId: string | null };

async function fetchConversation(conversationId: string): Promise<RemoteConversation | null> {
  const key = serverEnv().ELEVENLABS_API_KEY;
  if (!key || !CONVERSATION_ID.test(conversationId)) return null;
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (response.status === 404) return { status: 'missing', costUsd: null, durationSeconds: 0, userId: null };
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    status?: string;
    user_id?: string;
    metadata?: { cost_fiat?: number; call_duration_secs?: number };
  } | null;
  if (!body) return null;
  return {
    status: body.status ?? 'unknown',
    costUsd: typeof body.metadata?.cost_fiat === 'number' ? body.metadata.cost_fiat : null,
    durationSeconds: Math.round(body.metadata?.call_duration_secs ?? 0),
    userId: body.user_id ?? null,
  };
}

/**
 * Meters one conversation once ElevenLabs has finished with it: its real
 * cost becomes credits, spent once (the conversation id is the reference).
 */
export async function meterConversation(database: Database, conversationId: string, now = new Date()): Promise<'metered' | 'waiting' | 'unmetered'> {
  const [row] = await database.select().from(roxiConversations).where(eq(roxiConversations.conversationId, conversationId)).limit(1);
  if (!row || row.status !== 'open') return 'metered';
  const remote = await fetchConversation(conversationId);
  const ageHours = (now.getTime() - row.startedAt.getTime()) / 3_600_000;
  // Never connected (the link was asked for and not used), or gone: nothing was spent.
  if (!remote || remote.status === 'missing' || ((remote.status === 'initiated' || remote.status === 'in-progress' || remote.status === 'processing') && ageHours > 24)) {
    if (remote?.status === 'missing' && ageHours > 1) {
      await database.update(roxiConversations).set({ status: 'unmetered', meteredAt: now }).where(eq(roxiConversations.conversationId, conversationId));
      return 'unmetered';
    }
    if (ageHours > 24) {
      await database.update(roxiConversations).set({ status: 'unmetered', meteredAt: now }).where(eq(roxiConversations.conversationId, conversationId));
      return 'unmetered';
    }
    return 'waiting';
  }
  if (remote.status !== 'done' && remote.status !== 'failed') return 'waiting';
  const credits = creditsForCost(remote.costUsd ?? 0);
  await database.transaction(async (tx) => {
    await spendCredits(tx, { userId: row.userId, credits, reason: 'conversation', reference: conversationId, now });
    await tx
      .update(roxiConversations)
      .set({ status: 'metered', costUsd: String(remote.costUsd ?? 0), credits, durationSeconds: remote.durationSeconds, meteredAt: now })
      .where(eq(roxiConversations.conversationId, conversationId));
  });
  return 'metered';
}

/** Every conversation still waiting to be metered, a couple of minutes after it opened. */
export async function meterOpenConversations(database: Database, now = new Date()): Promise<{ metered: number; waiting: number; unmetered: number }> {
  if (!meteringOn()) return { metered: 0, waiting: 0, unmetered: 0 };
  const open = await database
    .select({ conversationId: roxiConversations.conversationId })
    .from(roxiConversations)
    .where(and(inArray(roxiConversations.status, ['open']), lt(roxiConversations.startedAt, new Date(now.getTime() - 2 * 60_000))))
    .limit(200);
  const counts = { metered: 0, waiting: 0, unmetered: 0 };
  for (const row of open) {
    try {
      counts[await meterConversation(database, row.conversationId, now)] += 1;
    } catch (error) {
      console.error('roxi metering failed', row.conversationId, error instanceof Error ? error.message : error);
      counts.waiting += 1;
    }
  }
  return counts;
}
