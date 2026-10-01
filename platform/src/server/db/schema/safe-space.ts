import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { safeSpaceMemberKindEnum, safeSpaceMemberStatusEnum, safeSpaceReportStatusEnum } from './enums';

/**
 * Espacio Violeta: a protected space for women going through something hard,
 * with psychologists and psychiatrists whose licence a person verified.
 *
 * - Nobody here is shown by their Yavaya name or YAY ID: each person has a
 *   name of this space only (`handle`). The link to the account exists so a
 *   ban sticks; no page shows it to anyone.
 * - Every message is sealed at rest (`*_sealed`, see security/sealed-text).
 * - Nothing here becomes a notification or an email: a phone or an inbox
 *   someone else reads must not give the space away.
 * - Messages are deleted, not hidden, and expire (SAFE_SPACE_RULES).
 */
export const safeSpaceMembers = pgTable(
  'safe_space_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: safeSpaceMemberKindEnum('kind').notNull(),
    /** "Luna 27" for a woman, "Ceiba 12" for a professional. */
    handle: text('handle').notNull(),
    /** Professionals only: `psychology` or `psychiatry`. */
    profession: text('profession'),
    status: safeSpaceMemberStatusEnum('status').notNull().default('active'),
    /** Off: nobody sees when she is here. */
    showPresence: boolean('show_presence').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    handleChangedAt: timestamp('handle_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('safe_space_members_user_key').on(table.userId),
    uniqueIndex('safe_space_members_handle_key').on(table.handle),
    index('safe_space_members_presence_idx').on(table.status, table.lastSeenAt),
  ],
);

export const safeSpaceRoomMessages = pgTable(
  'safe_space_room_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorMemberId: uuid('author_member_id')
      .notNull()
      .references(() => safeSpaceMembers.id, { onDelete: 'cascade' }),
    bodySealed: text('body_sealed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('safe_space_room_messages_created_idx').on(table.createdAt)],
);

/** A private conversation: exactly two people, and only they read it. */
export const safeSpaceThreads = pgTable(
  'safe_space_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The pair is stored in order (a < b) so it exists once. */
    memberA: uuid('member_a')
      .notNull()
      .references(() => safeSpaceMembers.id, { onDelete: 'cascade' }),
    memberB: uuid('member_b')
      .notNull()
      .references(() => safeSpaceMembers.id, { onDelete: 'cascade' }),
    startedBy: uuid('started_by').notNull(),
    blockedBy: uuid('blocked_by'),
    aReadAt: timestamp('a_read_at', { withTimezone: true }),
    bReadAt: timestamp('b_read_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('safe_space_threads_pair_key').on(table.memberA, table.memberB),
    index('safe_space_threads_b_idx').on(table.memberB),
  ],
);

export const safeSpaceThreadMessages = pgTable(
  'safe_space_thread_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => safeSpaceThreads.id, { onDelete: 'cascade' }),
    authorMemberId: uuid('author_member_id')
      .notNull()
      .references(() => safeSpaceMembers.id, { onDelete: 'cascade' }),
    bodySealed: text('body_sealed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('safe_space_thread_messages_thread_idx').on(table.threadId, table.createdAt)],
);

/**
 * Reports stay inside the space: they never enter the general moderation
 * queue, and only `safe_space.review` reads them. The reported message is
 * copied (sealed) so a guardian can judge it even after it is deleted —
 * reporting a private message is the one way a third person reads it, and
 * it is the reporter's choice.
 */
export const safeSpaceReports = pgTable(
  'safe_space_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterMemberId: uuid('reporter_member_id').references(() => safeSpaceMembers.id, { onDelete: 'set null' }),
    reportedMemberId: uuid('reported_member_id')
      .notNull()
      .references(() => safeSpaceMembers.id, { onDelete: 'cascade' }),
    /** `room` or `thread`. */
    source: text('source').notNull(),
    messageId: uuid('message_id'),
    snapshotSealed: text('snapshot_sealed').notNull(),
    category: text('category').notNull(),
    noteSealed: text('note_sealed'),
    status: safeSpaceReportStatusEnum('status').notNull().default('open'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('safe_space_reports_status_idx').on(table.status, table.createdAt),
    uniqueIndex('safe_space_reports_once').on(table.reporterMemberId, table.messageId),
  ],
);
