import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { actorTypeEnum } from './enums';

/**
 * Audit.
 *
 * Append-only. A database trigger (see the `0001_immutability` migration)
 * rejects UPDATE and DELETE on this table, and each row carries the hash of
 * its predecessor, so removing or rewriting history breaks a verifiable chain.
 *
 * Audit rows must never contain a password, a token, a document image, or a
 * full IP address.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    actorType: actorTypeEnum('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),

    /** Dotted action name, e.g. `tokens.admin_grant`, `identity.account_created`. */
    action: text('action').notNull(),
    /** What the action was performed on, e.g. `user`, `listing`, `ticket`. */
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    district: text('district'),

    /** Keyed hashes only. */
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),

    /** Structured, non-sensitive detail: before/after values, amounts, reasons. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    /** Hash chain. `hash = sha256(prevHash || canonical(row))`. */
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
  },
  (table) => [
    index('audit_events_occurred_idx').on(table.occurredAt),
    index('audit_events_actor_idx').on(table.actorUserId),
    index('audit_events_action_idx').on(table.action),
    index('audit_events_subject_idx').on(table.subjectType, table.subjectId),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
