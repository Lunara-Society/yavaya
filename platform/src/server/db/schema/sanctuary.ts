import { date, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
