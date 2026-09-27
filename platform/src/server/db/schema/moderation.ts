import {
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
import {
  enforcementReasonEnum,
  enforcementTypeEnum,
  reportCategoryEnum,
  ticketPriorityEnum,
  ticketStatusEnum,
} from './enums';

/**
 * Moderation.
 *
 * Every meaningful user-generated object can be reported. A report opens a
 * ticket the reporter can track; the full queue, the reporter's identity and
 * the internal notes are visible only to moderators.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Polymorphic subject: `listing`, `user`, `cause`, `animal`, `message`, … */
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    district: text('district'),
    category: reportCategoryEnum('category').notNull(),
    description: text('description'),
    /** Reporter-supplied evidence references (media ids), never public. */
    evidence: jsonb('evidence').$type<Array<{ type: string; ref: string }>>().notNull().default([]),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_subject_idx').on(table.subjectType, table.subjectId),
    index('reports_reporter_idx').on(table.reporterUserId),
    index('reports_ticket_idx').on(table.ticketId),
  ],
);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short human reference shown to the reporter, e.g. `TCK-4F2A9C`. */
    code: text('code').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    category: reportCategoryEnum('category').notNull(),
    status: ticketStatusEnum('status').notNull().default('open'),
    priority: ticketPriorityEnum('priority').notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    /** Visible to the reporter. Internal detail belongs in moderationActions. */
    resolutionSummary: text('resolution_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('tickets_code_key').on(table.code),
    index('tickets_status_idx').on(table.status, table.priority),
    index('tickets_subject_idx').on(table.subjectType, table.subjectId),
  ],
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    /** Never shown to the reported user or the reporter. */
    internalNote: text('internal_note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('moderation_actions_ticket_idx').on(table.ticketId)],
);

/**
 * Enforcement record. The public registry may expose only the YAY ID, the
 * status, a broad reason category and the date — never documents, reports,
 * addresses or other personal information. `internalNote` and every evidence
 * reference stay behind the moderator boundary.
 */
export const enforcementRecords = pgTable(
  'enforcement_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: enforcementTypeEnum('type').notNull(),
    reasonCategory: enforcementReasonEnum('reason_category').notNull(),
    internalNote: text('internal_note'),
    /** Whether this record appears in the public transparency registry. */
    publiclyListed: boolean('publicly_listed').notNull().default(false),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null for permanent removal. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokeReason: text('revoke_reason'),
  },
  (table) => [
    index('enforcement_records_user_idx').on(table.userId),
    index('enforcement_records_public_idx').on(table.publiclyListed, table.issuedAt),
  ],
);
