import { index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { media } from './media';
import { users } from './identity';
import { locations } from './geography';

/**
 * Posts in the board districts (Hogar, Movilidad, Salud y Bienestar,
 * Aprender, Negocios, Campo): what a member offers or is looking for, inside
 * a subdistrict.
 *
 * `district`, `subdistrict` and `kind` are keys from `config/boards.ts`,
 * checked by the service on every write: a subdistrict is added in
 * configuration, not by a migration. `price_text` is the member's own words
 * ("C$ 3,500 al mes", "a convenir"): Yavaya takes no part in the deal and
 * computes nothing from it.
 */
export const boardPosts = pgTable(
  'board_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    district: text('district').notNull(),
    subdistrict: text('subdistrict').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    priceText: text('price_text'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** open → closed (by its author, or by running out its time) or removed (by a moderator). */
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('board_posts_feed_idx').on(table.district, table.status, table.createdAt),
    index('board_posts_sub_idx').on(table.district, table.subdistrict, table.status),
    index('board_posts_author_idx').on(table.authorUserId, table.createdAt),
  ],
);

/** A post's photos, in the order their author chose. A photo belongs to one post. */
export const boardPostPhotos = pgTable(
  'board_post_photos',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => boardPosts.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (table) => [uniqueIndex('board_post_photos_media_key').on(table.mediaId), uniqueIndex('board_post_photos_position_key').on(table.postId, table.position)],
);
