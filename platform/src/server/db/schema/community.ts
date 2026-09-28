import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { communityPostKindEnum, communityPostStatusEnum, communityReplyStatusEnum } from './enums';

/**
 * Community: the town square.
 *
 * Posts are seen by signed-in members only. Many are about someone's worst
 * week — a sick child, a lost job — and the Bible is explicit that a
 * vulnerable person's situation is never entertainment. Keeping them off
 * the open web is the least that implies.
 *
 * `anonymous` hides the author's name from other members. It never hides it
 * from moderators, and it never makes a post unaccountable: every post
 * belongs to a real, verified account.
 */
export const communityPosts = pgTable(
  'community_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: communityPostKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Where the help is needed or offered. Optional for prayer. */
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    anonymous: boolean('anonymous').notNull().default(false),
    status: communityPostStatusEnum('status').notNull().default('open'),
    supportCount: integer('support_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('community_posts_feed_idx').on(table.status, table.createdAt),
    index('community_posts_kind_idx').on(table.kind, table.status),
    index('community_posts_author_idx').on(table.authorUserId, table.createdAt),
  ],
);

export const communityReplies = pgTable(
  'community_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: communityReplyStatusEnum('status').notNull().default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [index('community_replies_post_idx').on(table.postId, table.createdAt)],
);

/** "I'm with you" on a prayer or support post: one per member per post. */
export const communitySupports = pgTable(
  'community_supports',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);
