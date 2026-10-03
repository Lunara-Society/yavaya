import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { tokenAccountKindEnum, tokenEntryReasonEnum } from './enums';

/**
 * Yavaya Tokens — platform utility credits.
 *
 * Not cryptocurrency, not equity, not a deposit, never presented as an
 * investment.
 *
 * `tokenAccounts.balance` is a cache of the ledger. The ledger is the truth:
 * every mutation writes an immutable entry recording the balance it produced,
 * inside the same transaction that updates the cached balance.
 */
export const tokenAccounts = pgTable(
  'token_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: tokenAccountKindEnum('kind').notNull(),
    /** Set for `user` accounts, null for the treasury and system accounts. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Stable handle for non-user accounts, e.g. `treasury:primary`. */
    handle: text('handle'),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    lifetimeEarned: bigint('lifetime_earned', { mode: 'number' }).notNull().default(0),
    lifetimeSpent: bigint('lifetime_spent', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('token_accounts_user_key').on(table.userId),
    uniqueIndex('token_accounts_handle_key').on(table.handle),
  ],
);

/**
 * Immutable double-entry-friendly ledger. Every row is one balance change on
 * one account. Transfers write two rows sharing a `groupId`.
 */
export const tokenLedger = pgTable(
  'token_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => tokenAccounts.id, { onDelete: 'restrict' }),
    /** Signed. Negative entries spend, positive entries credit. */
    delta: integer('delta').notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    reason: tokenEntryReasonEnum('reason').notNull(),
    /** Set when the entry is a charge for a declared billable action. */
    billableActionKey: text('billable_action_key').references(() => billableActions.key, {
      onDelete: 'set null',
    }),
    /**
     * Caller-supplied uniqueness key. A retried request with the same key is a
     * no-op, which is what makes charges exactly-once.
     */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Links the two halves of a transfer. */
    groupId: uuid('group_id'),
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('token_ledger_idempotency_key').on(table.idempotencyKey),
    index('token_ledger_account_idx').on(table.accountId, table.id),
    index('token_ledger_reason_idx').on(table.reason),
    index('token_ledger_group_idx').on(table.groupId),
  ],
);

/**
 * The closed set of actions that may cost tokens. A charge is only legal if
 * its key appears here — no ad-hoc charging from feature code, and clicking a
 * button is never in itself billable.
 */
export const billableActions = pgTable(
  'billable_actions',
  {
    key: text('key').primaryKey(),
    district: text('district'),
    cost: integer('cost').notNull(),
    description: text('description').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Starter allocation: 2 tokens per 24h period for the 7 days after email
 * verification, 14 total.
 * One row per user per period makes double-granting impossible.
 */
export const starterGrants = pgTable(
  'starter_grants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 0-based 24h period since the member verified their email. */
    periodIndex: smallint('period_index').notNull(),
    amount: integer('amount').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('starter_grants_key').on(table.userId, table.periodIndex)],
);

export const tokenPackages = pgTable(
  'token_packages',
  {
    key: text('key').primaryKey(),
    tokens: integer('tokens').notNull(),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('USD'),
    /**
     * Disabled packages stay in the catalogue for historical purchases but are
     * never offered. The 100-token package is disabled at launch because it
     * exceeds the per-purchase ceiling.
     */
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
);

/**
 * Reward eligibility bookkeeping — cooldowns, daily caps and duplicate
 * suppression for earned tokens, so repetitive automated behaviour cannot farm
 * an unlimited balance.
 */
export const rewardGrants = pgTable(
  'reward_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleKey: text('reward_rule_key').notNull(),
    amount: integer('amount').notNull(),
    /** Deduplicates "the same contribution rewarded twice". */
    dedupeKey: text('dedupe_key').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('reward_grants_dedupe_key').on(table.ruleKey, table.dedupeKey),
    index('reward_grants_user_idx').on(table.userId, table.grantedAt),
  ],
);

export type TokenAccount = typeof tokenAccounts.$inferSelect;
export type TokenLedgerEntry = typeof tokenLedger.$inferSelect;
