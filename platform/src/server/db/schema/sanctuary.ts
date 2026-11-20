import { boolean, date, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { locations } from './geography';
import { sanctuaryChurchStatusEnum, sanctuaryDevotionalStatusEnum } from './enums';

/**
 * Sanctuary: a space of faith inside Community (Master Bible, ch. 1).
 *
 * Yavaya writes none of its words. Churches register, a reviewer approves
 * them, and only approved churches appear or publish. A church's prayer
 * and guidance for the day is its own, signed with its name.
 */
export const sanctuaryChurches = pgTable(
  'sanctuary_churches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The member who registered the church and answers for it. */
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** As the church describes itself; free text, never a fixed list. */
    denomination: text('denomination'),
    description: text('description').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    address: text('address'),
    whatsappE164: text('whatsapp_e164'),
    /** Where services are broadcast (https only), shown as a link out. */
    streamUrl: text('stream_url'),
    status: sanctuaryChurchStatusEnum('status').notNull().default('pending'),
    /** Shown to the owner when not approved; an i18n-free note from the reviewer. */
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sanctuary_churches_status_idx').on(table.status, table.name),
    index('sanctuary_churches_owner_idx').on(table.ownerUserId),
    index('sanctuary_churches_location_idx').on(table.locationId),
  ],
);

/** A recurring service: weekday (0 = Sunday) and local start time "HH:MM". */
export const sanctuaryServices = pgTable(
  'sanctuary_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => sanctuaryChurches.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    startTime: text('start_time').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sanctuary_services_church_idx').on(table.churchId, table.weekday)],
);

/** A prayer or word of guidance, published by an approved church for a given day. */
export const sanctuaryDevotionals = pgTable(
  'sanctuary_devotionals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => sanctuaryChurches.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forDate: date('for_date', { mode: 'string' }).notNull(),
    title: text('title').notNull(),
    /** A reference such as "Salmo 23:1-4", as the church writes it. */
    scripture: text('scripture'),
    body: text('body').notNull(),
    status: sanctuaryDevotionalStatusEnum('status').notNull().default('published'),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
    /** When followers were told. Null until the word's day arrives where the church is. */
    followersNotifiedAt: timestamp('followers_notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sanctuary_devotionals_feed_idx').on(table.status, table.forDate),
    index('sanctuary_devotionals_church_idx').on(table.churchId, table.forDate),
  ],
);

/** A member following a church, to see its services and words first. */
export const sanctuaryFollows = pgTable(
  'sanctuary_follows',
  {
    churchId: uuid('church_id')
      .notNull()
      .references(() => sanctuaryChurches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.churchId, table.userId] }), index('sanctuary_follows_user_idx').on(table.userId)],
);

/**
 * "Encender una vela por alguien" (docs/sanctuary/CANDLE.md): a member lights
 * a candle for someone and sends it to them. The page it opens is reachable
 * only by its link (the id), shows the prayer of the day it was lit, and
 * the candle burns until `burns_until`. The name and intention are the
 * member's words, short and without links; the sender may stay unnamed.
 */
export const sanctuaryCandles = pgTable(
  'sanctuary_candles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Who it is for, as the sender wrote it ("Mamá", "Don Julio"); may be empty. */
    forName: text('for_name'),
    intention: text('intention'),
    /** True: the page says "someone lit this candle for you", without the sender's name. */
    anonymous: boolean('anonymous').notNull().default(false),
    /** The daily light's day when it was lit: the page shows that day's prayer, the one the sender saw. */
    lightDate: date('light_date').notNull(),
    /** `lit`, or `removed` by moderation. */
    status: text('status').notNull().default('lit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    burnsUntil: timestamp('burns_until', { withTimezone: true }).notNull(),
  },
  (table) => [index('sanctuary_candles_day_idx').on(table.createdAt), index('sanctuary_candles_user_idx').on(table.userId, table.createdAt)],
);
