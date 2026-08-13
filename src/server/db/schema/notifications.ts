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
import { locations } from './geography';
import { activityKindEnum, notificationChannelEnum } from './enums';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. `live_activity`, `orders`, `moderation`, `tokens`, `marketing`. */
    category: text('category').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('notification_preferences_key').on(table.userId, table.category, table.channel)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** i18n key + parameters. Never a pre-rendered English sentence. */
    titleKey: text('title_key').notNull(),
    bodyKey: text('body_key'),
    params: jsonb('params').$type<Record<string, string | number>>().notNull().default({}),
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.createdAt)],
);

/**
 * Live activity.
 *
 * Rows here are emitted by real domain events only. Demo-sourced rows carry
 * `isDemo = true`, are excluded from the public feed and from every statistic,
 * and are never used to generate a notification.
 */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: activityKindEnum('kind').notNull(),
    district: text('district'),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    /**
     * Only non-identifying detail — a city name, a district, a count. Never a
     * user's name, exact location, or the subject of a sensitive request.
     */
    publicParams: jsonb('public_params').$type<Record<string, string | number>>().notNull().default({}),
    isDemo: boolean('is_demo').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** When this event stops being shown in the live feed. */
    visibleUntil: timestamp('visible_until', { withTimezone: true }),
  },
  (table) => [
    index('activity_events_feed_idx').on(table.isDemo, table.occurredAt),
    index('activity_events_location_idx').on(table.locationId),
  ],
);
