import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { mediaStatusEnum } from './enums';

/**
 * Uploaded images.
 *
 * A row exists only for a file that passed the pipeline: sniffed by its bytes,
 * decoded, re-encoded to WebP with every piece of metadata (EXIF, GPS, camera
 * serials) dropped. What sits in storage is the re-encoded file, never the
 * upload itself.
 *
 * `sourceSha256` hashes the bytes as uploaded. It is never shown; it lets
 * moderation see the same photograph posted by two different sellers — the
 * commonest sign of a copied listing.
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What the image is for, e.g. `listing_photo`. */
    purpose: text('purpose').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    sourceSha256: text('source_sha256').notNull(),
    status: mediaStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('media_storage_key_key').on(table.storageKey),
    index('media_owner_idx').on(table.ownerUserId),
    index('media_source_sha256_idx').on(table.sourceSha256),
  ],
);
