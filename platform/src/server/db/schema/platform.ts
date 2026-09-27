import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Platform-level configuration: business rules that operations can change
 * without a deploy, district availability, feature flags and the demo-content
 * register.
 */
export const systemSettings = pgTable(
  'system_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    description: text('description').notNull().default(''),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const districts = pgTable(
  'districts',
  {
    key: text('key').primaryKey(),
    slug: text('slug').notNull(),
    phase: integer('phase').notNull(),
    /** `available` | `in_development` | `planned`. Reflects reality, not plans. */
    status: text('status').notNull().default('planned'),
    enabled: boolean('enabled').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('districts_slug_key').on(table.slug)],
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    enabled: boolean('enabled').notNull().default(false),
    description: text('description').notNull().default(''),
    /** Optional targeting, e.g. `{ "locations": ["ca.gt"] }`. */
    rollout: jsonb('rollout').$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Register of every demo row in the system.
 *
 * Demo content is explicitly marked in the UI, excluded from all statistics,
 * never the source of an activity notification, and expires automatically.
 */
export const demoContent = pgTable(
  'demo_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    district: text('district'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('demo_content_subject_key').on(table.subjectType, table.subjectId),
    index('demo_content_expiry_idx').on(table.expiresAt, table.removedAt),
  ],
);
