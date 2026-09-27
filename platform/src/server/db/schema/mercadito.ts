import {
  bigint,
  char,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { media } from './media';
import { listingCategoryEnum, listingConditionEnum, listingStatusEnum } from './enums';

/**
 * Mercadito listings.
 *
 * `id` is chosen by the publish form before submission, not by the database.
 * A retried submission therefore names the same listing, and the token charge
 * keyed on it cannot be taken twice.
 */
export const mercaditoListings = pgTable(
  'mercadito_listings',
  {
    id: uuid('id').primaryKey(),
    sellerUserId: uuid('seller_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** Minor units (cents). Every launch-market currency has two decimals. */
    priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
    currencyCode: char('currency_code', { length: 3 }).notNull(),
    category: listingCategoryEnum('category').notNull(),
    condition: listingConditionEnum('condition').notNull(),
    /** A city (or deeper) row. Never a free-text place name. */
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    status: listingStatusEnum('status').notNull().default('published'),
    /**
     * Automatic screening results, for moderators only: `duplicate_photo`,
     * `repeated_listing`. A flag never hides a listing by itself.
     */
    flags: jsonb('flags').$type<string[]>().notNull().default([]),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('mercadito_listings_browse_idx').on(table.status, table.publishedAt),
    index('mercadito_listings_seller_idx').on(table.sellerUserId, table.createdAt),
    index('mercadito_listings_category_idx').on(table.category, table.status),
    index('mercadito_listings_location_idx').on(table.locationId),
  ],
);

export const mercaditoListingPhotos = pgTable(
  'mercadito_listing_photos',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => mercaditoListings.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (table) => [
    uniqueIndex('mercadito_listing_photos_media_key').on(table.mediaId),
    uniqueIndex('mercadito_listing_photos_position_key').on(table.listingId, table.position),
  ],
);
