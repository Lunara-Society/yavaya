import { randomUUID } from 'node:crypto';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { paymentEvents, paymentTransactions, paymentWebhookEvents } from '@/server/db/schema';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { creditPurchasedTokens } from '@/server/domains/tokens/service';
import type { PaymentProvider } from './provider';
import { PayPalProvider } from './providers/paypal';
import { DLocalGoProvider } from './providers/dlocalgo';

/**
 * Payment service.
 *
 * Separate commercial domains — token purchases, Works subscriptions,
 * YavayaGo commercial relationships, future marketplace payments — share this
 * bookkeeping but never share fulfilment logic. Each has its own fulfiller.
 *
 * The one invariant that matters: a payment reaches `succeeded` only through
 * `applyProviderOutcome`, which is reachable only from a verified webhook or a
 * server-side capture. There is no code path from a browser to `succeeded`.
 */

const providers = new Map<string, PaymentProvider>([
  ['dlocalgo', new DLocalGoProvider()],
  ['paypal', new PayPalProvider()],
]);

/** The provider a new checkout uses: the first one that is configured. */
export function activeProvider(): PaymentProvider | null {
  return [...providers.values()].find((provider) => provider.availability().available) ?? null;
}

export function getProvider(key: string): PaymentProvider {
  const provider = providers.get(key);
  if (!provider) throw errors.notFound('payment_provider');
  return provider;
}

export function listProviderAvailability(): Array<{
  key: string;
  available: boolean;
  testMode: boolean;
  reason?: string;
}> {
  return [...providers.values()].map((provider) => {
    const availability = provider.availability();
    return availability.available
      ? { key: provider.key, available: true, testMode: provider.testMode?.() ?? false }
      : { key: provider.key, available: false, testMode: false, reason: availability.reason };
  });
}

export type PaymentDomain =
  | 'tokens'
  | 'works_subscription'
  | 'yavayago_commercial'
  | 'marketplace'
  | 'impact_donation';

export type StartCheckoutInput = {
  domain: PaymentDomain;
  providerKey: string;
  userId: string;
  amountMinor: number;
  currency: string;
  /** What the payment buys — read by the fulfiller, never by the provider. */
  intent: Record<string, unknown>;
  idempotencyKey: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

/**
 * Creates a transaction record and asks the provider for a checkout session.
 *
 * If the provider is unconfigured this throws `integration_unconfigured` and
 * writes nothing — the caller must tell the user payments are unavailable
 * rather than showing a checkout that cannot complete.
 */
export async function startCheckout(
  database: Database,
  input: StartCheckoutInput,
): Promise<{ reference: string; redirectUrl: string; transactionId: string }> {
  const provider = getProvider(input.providerKey);
  const availability = provider.availability();
  if (!availability.available) {
    throw errors.integrationUnconfigured(`payments:${provider.key}`);
  }

  const reference = `YAV-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;

  const transactionId = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: paymentTransactions.id, reference: paymentTransactions.reference })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    // The key names one purchase attempt. Seeing it again is a double submit,
    // and a second provider checkout for it would be a payment nobody could
    // match if the first one were paid as well.
    if (existing) throw errors.conflict('payments.error.duplicate');

    const [created] = await tx
      .insert(paymentTransactions)
      .values({
        reference,
        domain: input.domain,
        provider: provider.key,
        userId: input.userId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: 'created',
        intent: input.intent,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: paymentTransactions.id });

    if (!created) throw errors.internal('payment transaction insert returned no row');

    await tx.insert(paymentEvents).values({
      transactionId: created.id,
      toStatus: 'created',
      source: 'server_capture',
      detail: { domain: input.domain },
    });

    return created.id;
  });

  const session = await provider.createCheckout({
    reference,
    money: { amountMinor: input.amountMinor, currency: input.currency },
    description: input.description,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    metadata: { reference },
  });

  await database.transaction(async (tx) => {
    await tx
      .update(paymentTransactions)
      .set({
        providerTransactionId: session.providerTransactionId,
        status: 'pending_provider',
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, transactionId));

    await tx.insert(paymentEvents).values({
      transactionId,
      fromStatus: 'created',
      toStatus: 'pending_provider',
      source: 'server_capture',
      detail: { providerTransactionId: session.providerTransactionId },
    });
  });

  return { reference, redirectUrl: session.redirectUrl, transactionId };
}

/**
 * A fulfiller delivers what a successful payment bought. It runs inside the
 * same transaction that marks the payment succeeded, so a credited balance and
 * a succeeded payment cannot exist without each other.
 */
export type Fulfiller = (
  tx: Executor,
  transaction: typeof paymentTransactions.$inferSelect,
) => Promise<void>;

const fulfillers = new Map<PaymentDomain, Fulfiller>();

export function registerFulfiller(domain: PaymentDomain, fulfiller: Fulfiller): void {
  fulfillers.set(domain, fulfiller);
}

/**
 * Tokens bought: credited through the token service, keyed by the payment, so
 * a second application of the same payment cannot credit twice. The count
 * comes from the intent recorded at checkout — the package as it was priced
 * when the member paid, not as it may be priced now.
 */
registerFulfiller('tokens', async (tx, transaction) => {
  const tokens = Number(transaction.intent.tokens);
  if (!transaction.userId || !Number.isInteger(tokens) || tokens <= 0) throw errors.internal(`token purchase ${transaction.id} has no valid intent`);
  await creditPurchasedTokens(tx, { userId: transaction.userId, tokens, paymentTransactionId: transaction.id });
});

/**
 * Records a verified provider outcome and, on success, fulfils it exactly once.
 *
 * Callable only from server-side verification paths.
 */
export async function applyProviderOutcome(
  database: Database,
  params: {
    providerKey: string;
    providerTransactionId: string;
    status: 'succeeded' | 'failed' | 'refunded' | 'pending';
    source: 'webhook' | 'server_capture' | 'reconciliation' | 'admin';
    detail?: Record<string, unknown>;
    failureCode?: string;
  },
): Promise<{ applied: boolean; reason: 'applied' | 'already_final' | 'unknown_transaction' }> {
  return database.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.providerTransactionId, params.providerTransactionId))
      .limit(1)
      .for('update');

    const transaction = locked[0];
    if (!transaction) return { applied: false, reason: 'unknown_transaction' as const };

    // A payment that has already reached a terminal state is never re-applied:
    // a redelivered webhook must not credit a second time.
    if (['succeeded', 'refunded', 'failed', 'cancelled'].includes(transaction.status)) {
      return { applied: false, reason: 'already_final' as const };
    }

    const nextStatus =
      params.status === 'succeeded'
        ? 'succeeded'
        : params.status === 'refunded'
          ? 'refunded'
          : params.status === 'failed'
            ? 'failed'
            : 'pending_provider';

    await tx
      .update(paymentTransactions)
      .set({
        status: nextStatus,
        reconciliationState: params.status === 'succeeded' ? 'provider_confirmed' : transaction.reconciliationState,
        failureCode: params.failureCode ?? null,
        fulfilledAt: params.status === 'succeeded' ? new Date() : transaction.fulfilledAt,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, transaction.id));

    await tx.insert(paymentEvents).values({
      transactionId: transaction.id,
      fromStatus: transaction.status,
      toStatus: nextStatus,
      source: params.source,
      detail: params.detail ?? {},
    });

    if (nextStatus === 'succeeded') {
      const fulfiller = fulfillers.get(transaction.domain as PaymentDomain);
      if (!fulfiller) throw errors.internal(`no fulfiller registered for ${transaction.domain}`);
      await fulfiller(tx, { ...transaction, status: 'succeeded' });
    }

    await recordAudit(tx, {
      actorType: 'system',
      action: `payments.${nextStatus}`,
      subjectType: 'payment_transaction',
      subjectId: transaction.id,
      metadata: {
        provider: params.providerKey,
        reference: transaction.reference,
        domain: transaction.domain,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        source: params.source,
      },
    });

    return { applied: true, reason: 'applied' as const };
  });
}

/**
 * Reads a payment's state from the provider, server to server, and applies
 * it. This is the only way a dLocal Go payment succeeds: its notification
 * carries no status, and a browser returning from checkout proves nothing.
 *
 * The amount and currency the provider reports must be exactly what was
 * asked for. Anything else is held as a discrepancy for a person to look at
 * and is never fulfilled — paying 1 instead of 100 must not buy 100.
 */
export async function settleFromProvider(
  database: Database,
  params: { providerKey: string; providerTransactionId: string; source: 'webhook' | 'reconciliation' },
): Promise<{ status: string; applied: boolean; reason: string }> {
  const provider = getProvider(params.providerKey);
  const [transaction] = await database
    .select()
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.provider, provider.key), eq(paymentTransactions.providerTransactionId, params.providerTransactionId)))
    .limit(1);
  if (!transaction) return { status: 'unknown', applied: false, reason: 'unknown_transaction' };

  const result = await provider.capture(params.providerTransactionId);
  if (result.status === 'pending') return { status: 'pending', applied: false, reason: 'pending' };

  if (result.status === 'succeeded') {
    const matches = result.money.amountMinor === Number(transaction.amountMinor) && result.money.currency.toUpperCase() === transaction.currency.toUpperCase();
    if (!matches) {
      await database.transaction(async (tx) => {
        await tx.update(paymentTransactions).set({ reconciliationState: 'discrepancy', updatedAt: new Date() }).where(eq(paymentTransactions.id, transaction.id));
        await tx.insert(paymentEvents).values({
          transactionId: transaction.id,
          fromStatus: transaction.status,
          toStatus: transaction.status,
          source: params.source,
          detail: { discrepancy: true, expected: { amountMinor: Number(transaction.amountMinor), currency: transaction.currency }, reported: result.money },
        });
        await recordAudit(tx, {
          actorType: 'system',
          action: 'payments.discrepancy',
          subjectType: 'payment_transaction',
          subjectId: transaction.id,
          metadata: { provider: provider.key, reference: transaction.reference },
        });
      });
      return { status: 'succeeded', applied: false, reason: 'amount_mismatch' };
    }
  }

  const outcome = await applyProviderOutcome(database, {
    providerKey: provider.key,
    providerTransactionId: params.providerTransactionId,
    status: result.status,
    source: params.source,
    detail: result.raw,
    failureCode: result.failureCode,
  });
  return { status: result.status, applied: outcome.applied, reason: outcome.reason };
}

/**
 * Notifications can be lost. Every payment still waiting on its provider
 * after a few minutes is read again, for as long as its checkout could still
 * be paid (a day) plus a margin.
 */
export async function reconcilePendingPayments(database: Database, now = new Date()): Promise<{ checked: number; settled: number; failed: number }> {
  const waiting = await database
    .select({ provider: paymentTransactions.provider, providerTransactionId: paymentTransactions.providerTransactionId, createdAt: paymentTransactions.createdAt })
    .from(paymentTransactions)
    .where(and(inArray(paymentTransactions.status, ['pending_provider', 'authorized']), lt(paymentTransactions.updatedAt, new Date(now.getTime() - 5 * 60_000))))
    .limit(50);
  let settled = 0;
  let failed = 0;
  for (const row of waiting) {
    if (!row.providerTransactionId || now.getTime() - row.createdAt.getTime() > 3 * 86_400_000) continue;
    try {
      if (!getProvider(row.provider).availability().available) continue;
      const result = await settleFromProvider(database, { providerKey: row.provider, providerTransactionId: row.providerTransactionId, source: 'reconciliation' });
      if (result.applied) settled += 1;
    } catch (error) {
      failed += 1;
      console.error('payment reconciliation failed:', row.provider, error instanceof Error ? error.message : error);
    }
  }
  return { checked: waiting.length, settled, failed };
}

/**
 * Stores a raw webhook before processing.
 *
 * Persisting first means a handler crash loses nothing, and the unique
 * constraint on (provider, event id) means a redelivery is a no-op.
 */
export async function recordWebhook(
  database: Database,
  params: {
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureVerified: boolean;
    payload: Record<string, unknown>;
  },
): Promise<{ stored: boolean; id: string | null }> {
  const rows = await database
    .insert(paymentWebhookEvents)
    .values(params)
    .onConflictDoNothing({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId],
    })
    .returning({ id: paymentWebhookEvents.id });

  const row = rows[0];
  return { stored: Boolean(row), id: row?.id ?? null };
}

export async function markWebhookProcessed(
  database: Database,
  id: string,
  error?: string,
): Promise<void> {
  await database
    .update(paymentWebhookEvents)
    .set({ processedAt: new Date(), processingError: error ?? null })
    .where(eq(paymentWebhookEvents.id, id));
}
