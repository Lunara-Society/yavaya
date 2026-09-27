import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { paymentEvents, paymentTransactions, paymentWebhookEvents } from '@/server/db/schema';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import type { PaymentProvider } from './provider';
import { PayPalProvider } from './providers/paypal';

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

const providers = new Map<string, PaymentProvider>([['paypal', new PayPalProvider()]]);

export function getProvider(key: string): PaymentProvider {
  const provider = providers.get(key);
  if (!provider) throw errors.notFound('payment_provider');
  return provider;
}

export function listProviderAvailability(): Array<{
  key: string;
  available: boolean;
  reason?: string;
}> {
  return [...providers.values()].map((provider) => {
    const availability = provider.availability();
    return availability.available
      ? { key: provider.key, available: true }
      : { key: provider.key, available: false, reason: availability.reason };
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
    if (existing) return existing.id;

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
