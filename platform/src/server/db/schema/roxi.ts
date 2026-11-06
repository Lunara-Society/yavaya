import { bigserial, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Roxi's plans, credits, connections and the things a member asks her to keep.
 *
 * Plain text columns hold the closed vocabularies (plan, status, kind) and are
 * checked in the service: these tables are Roxi's alone and change with her.
 */

/** A member's plan. No row: Free. */
export const roxiSubscriptions = pgTable('roxi_subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 'pro' | 'max'. */
  plan: text('plan').notNull(),
  /** 'active' | 'canceling' (runs to period end) | 'ended'. */
  status: text('status').notNull(),
  /** 'payment' (Stripe) or 'admin' (an administrator trying the plan; never billed). */
  source: text('source').notNull(),
  providerSubscriptionId: text('provider_subscription_id'),
  /** A Pro subscription replaced by an upgrade to Max, still to be cancelled at Stripe (upkeep does it). */
  replacedSubscriptionId: text('replaced_subscription_id'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Credit balances: a cache of the ledger below, updated in the same
 * transaction as every entry. Plan credits may go below zero (a conversation
 * is never cut off mid-sentence); purchased credits never do.
 */
export const roxiCreditAccounts = pgTable('roxi_credit_accounts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  planCredits: integer('plan_credits').notNull().default(0),
  /** Which grant the plan credits belong to ("free:2026-11", "pro:sub_…:1733000000"); a new key resets them. */
  planPeriodKey: text('plan_period_key').notNull().default(''),
  purchasedCredits: integer('purchased_credits').notNull().default(0),
  purchasedExpiresAt: timestamp('purchased_expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every credit movement. `(user, reason, reference)` is unique: the same conversation or payment is never counted twice. */
export const roxiCreditLedger = pgTable(
  'roxi_credit_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Signed: grants positive, use negative. */
    planDelta: integer('plan_delta').notNull().default(0),
    purchasedDelta: integer('purchased_delta').notNull().default(0),
    /** 'grant' | 'reset' | 'purchase' | 'conversation' | 'connector' | 'expiry' | 'carry'. */
    reason: text('reason').notNull(),
    reference: text('reference').notNull(),
    planAfter: integer('plan_after').notNull(),
    purchasedAfter: integer('purchased_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('roxi_credit_ledger_once').on(table.userId, table.reason, table.reference), index('roxi_credit_ledger_user_idx').on(table.userId, table.createdAt)],
);

/** One conversation opened through /api/roxi/start, metered from ElevenLabs once it has ended. */
export const roxiConversations = pgTable(
  'roxi_conversations',
  {
    conversationId: text('conversation_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'open' | 'metered' | 'unmetered' (ElevenLabs never reported it). */
    status: text('status').notNull().default('open'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    credits: integer('credits'),
    durationSeconds: integer('duration_seconds'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    meteredAt: timestamp('metered_at', { withTimezone: true }),
  },
  (table) => [index('roxi_conversations_open_idx').on(table.status, table.startedAt), index('roxi_conversations_user_idx').on(table.userId, table.startedAt)],
);

/** A tool the member connected to Roxi: their Google account, an MCP server, an API. */
export const roxiConnections = pgTable(
  'roxi_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'google' | 'mcp' | 'api'. */
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    /** Non-secret settings: the server address, the scopes granted, the Google address. */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    /** The secret (token, key, refresh token), sealed with ROXI_KEY. Null when the service needs none. */
    secretSealed: text('secret_sealed'),
    /** 'active' | 'error'. */
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('roxi_connections_user_idx').on(table.userId)],
);

/**
 * What a member asked Roxi to keep: goals, reminders, the day's tasks, good
 * moments and things to remember. The text is sealed with ROXI_KEY; only
 * what scheduling needs (kind, due time, repeat, done) is in clear.
 */
export const roxiItems = pgTable(
  'roxi_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'goal' | 'reminder' | 'task' | 'moment' | 'fact'. */
    kind: text('kind').notNull(),
    /** Sealed JSON: { title, detail?, … }. */
    bodySealed: text('body_sealed').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** 'none' | 'weekly' | 'monthly' | 'yearly'. */
    repeat: text('repeat').notNull().default('none'),
    /** For a task: the local day it belongs to (YYYY-MM-DD). */
    day: text('day'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('roxi_items_user_idx').on(table.userId, table.kind), index('roxi_items_due_idx').on(table.dueAt)],
);
