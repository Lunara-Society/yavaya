import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { locationLevelEnum } from './enums';

/**
 * Geography.
 *
 * Region → Country → State/Department/Province → City → Town → Village →
 * Neighborhood, as a single self-referencing tree. Countries and cities are
 * *rows*, never branches in application code: nothing in Yavaya may compare a
 * hard-coded city or country name.
 *
 * Expansion into a new market is a data migration, never a schema change.
 */
export const locations = pgTable(
  'locations',
  {
    /** Internal immutable identifier. */
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Stable public identifier, e.g. `ca.gt.gt.guatemala-city`. Never reused,
     * never renamed — display names are translated, codes are not.
     */
    code: text('code').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => locations.id, {
      onDelete: 'restrict',
    }),
    level: locationLevelEnum('level').notNull(),
    /** Canonical name plus per-locale overrides: `{ "es": "...", "en": "..." }`. */
    name: text('name').notNull(),
    names: jsonb('names').$type<Record<string, string>>().notNull().default({}),
    /** ISO 3166-1 alpha-2 for countries, ISO 3166-2 for states. Null elsewhere. */
    isoCode: text('iso_code'),
    /** Materialised path of ancestor codes, root first. Enables subtree queries. */
    path: text('path').array().notNull().default([]),
    depth: integer('depth').notNull().default(0),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    timezone: text('timezone'),
    /** Dialing prefix for countries, used to validate and normalise phone numbers. */
    phonePrefix: text('phone_prefix'),
    currencyCode: text('currency_code'),
    /**
     * Whether Yavaya operates here. A location may exist for addressing
     * purposes while being closed to new activity.
     */
    isActive: boolean('is_active').notNull().default(true),
    isSupportedMarket: boolean('is_supported_market').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('locations_code_key').on(table.code),
    index('locations_parent_idx').on(table.parentId),
    index('locations_level_idx').on(table.level),
    index('locations_active_idx').on(table.isActive),
    index('locations_path_idx').using('gin', table.path),
  ],
);

/**
 * Networks known to be shared by many unrelated people (mobile carrier CGNAT,
 * universities, cafés, public Wi-Fi). Presence here downgrades an IP-match
 * signal; it never grants or denies access on its own.
 */
export const sharedNetworks = pgTable(
  'shared_networks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Keyed hash of the network prefix — raw IP data is never stored. */
    networkHash: text('network_hash').notNull(),
    label: text('label').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('shared_networks_hash_key').on(table.networkHash)],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
