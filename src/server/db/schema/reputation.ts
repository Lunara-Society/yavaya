import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { reputationSourceEnum } from './enums';

/**
 * Reputation.
 *
 * Scores start at 50/100 and only move in response to verified platform
 * activity. Every movement is an immutable event, so a Trust Shield can always
 * be explained.
 *
 * Rule weights live in the database, seeded from `config/business-rules.ts`,
 * so they are tunable without a deploy and never hard-coded at a call site.
 */
export const reputationRules = pgTable(
  'reputation_rules',
  {
    key: text('key').primaryKey(),
    delta: integer('delta').notNull(),
    cooldownSeconds: integer('cooldown_seconds').notNull().default(0),
    /** Null means unlimited applications per day. */
    maxPerDay: integer('max_per_day'),
    enabled: boolean('enabled').notNull().default(true),
    description: text('description').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const reputationScores = pgTable(
  'reputation_scores',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    /** Counters surfaced on the Trust Shield. */
    successfulTransactions: integer('successful_transactions').notNull().default(0),
    successfulDeliveries: integer('successful_deliveries').notNull().default(0),
    positiveReviews: integer('positive_reviews').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const reputationEvents = pgTable(
  'reputation_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleKey: text('rule_key').notNull(),
    source: reputationSourceEnum('source').notNull(),
    delta: integer('delta').notNull(),
    scoreAfter: integer('score_after').notNull(),
    /** Makes reputation changes exactly-once under retries. */
    idempotencyKey: text('idempotency_key').notNull(),
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('reputation_events_idempotency_key').on(table.idempotencyKey),
    index('reputation_events_user_idx').on(table.userId, table.createdAt),
    index('reputation_events_rule_idx').on(table.ruleKey),
  ],
);
