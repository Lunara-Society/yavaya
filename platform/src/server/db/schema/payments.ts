import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { paymentDomainEnum, paymentStatusEnum, reconciliationStateEnum } from './enums';

/**
 * Payments.
 *
 * Provider-agnostic. `provider` is a string, not an enum baked into business
 * logic, and no table here assumes a particular processor exists.
 *
 * A payment is only ever marked `succeeded` by server-side verification — a
 * webhook whose signature verified, or an authenticated server-to-server
 * capture. A browser callback moves nothing beyond `pending_provider`.
 */
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Internal reference shown to the user and used for reconciliation. */
    reference: text('reference').notNull(),
    /** Separate commercial domains never share reconciliation or payout logic. */
    domain: paymentDomainEnum('domain').notNull(),
    provider: text('provider').notNull(),
    providerTransactionId: text('provider_transaction_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    status: paymentStatusEnum('status').notNull().default('created'),
    reconciliationState: reconciliationStateEnum('reconciliation_state')
      .notNull()
      .default('unreconciled'),
    /** What the payment buys, e.g. `{ packageKey: "tokens_25" }`. */
    intent: jsonb('intent').$type<Record<string, unknown>>().notNull().default({}),
    /** Guards against a retried checkout creating two charges. */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Set once the purchased entitlement has been delivered. */
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_transactions_reference_key').on(table.reference),
    uniqueIndex('payment_transactions_idempotency_key').on(table.idempotencyKey),
    uniqueIndex('payment_transactions_provider_txn_key').on(table.provider, table.providerTransactionId),
    index('payment_transactions_user_idx').on(table.userId, table.createdAt),
    index('payment_transactions_status_idx').on(table.status, table.reconciliationState),
  ],
);

/** Every observed state change, so a disputed payment can be reconstructed. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => paymentTransactions.id, { onDelete: 'cascade' }),
    fromStatus: paymentStatusEnum('from_status'),
    toStatus: paymentStatusEnum('to_status').notNull(),
    /** `webhook`, `server_capture`, `admin`, `reconciliation`. Never `client`. */
    source: text('source').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('payment_events_transaction_idx').on(table.transactionId, table.createdAt)],
);

/**
 * Raw provider webhooks. Stored before processing so a failed handler can be
 * replayed, and deduplicated by provider event id so a redelivery cannot
 * double-credit.
 */
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureVerified: boolean('signature_verified').notNull().default(false),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
  },
  (table) => [
    uniqueIndex('payment_webhook_events_key').on(table.provider, table.providerEventId),
    index('payment_webhook_events_unprocessed_idx').on(table.processedAt),
  ],
);
