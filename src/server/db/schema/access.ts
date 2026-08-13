import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { roleScopeEnum } from './enums';

/**
 * Authorization.
 *
 * Authority is never derived from an email address in application code, and
 * never from anything the browser sends. The primary administrator is granted
 * the `admin` role by a server-side bootstrap; from then on every check reads
 * these tables.
 */
export const roles = pgTable(
  'roles',
  {
    key: text('key').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    /** System roles cannot be deleted or renamed through the admin UI. */
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const permissions = pgTable(
  'permissions',
  {
    key: text('key').primaryKey(),
    /** Owning domain, e.g. `tokens`, `moderation`, `identity`. */
    domain: text('domain').notNull(),
    description: text('description').notNull(),
  },
  (table) => [index('permissions_domain_idx').on(table.domain)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleKey: text('role_key')
      .notNull()
      .references(() => roles.key, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('role_permissions_key').on(table.roleKey, table.permissionKey)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleKey: text('role_key')
      .notNull()
      .references(() => roles.key, { onDelete: 'cascade' }),
    /** Global, or narrowed to one district or one location subtree. */
    scope: roleScopeEnum('scope').notNull().default('global'),
    scopeRef: text('scope_ref'),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('user_roles_key').on(table.userId, table.roleKey, table.scope, table.scopeRef),
    index('user_roles_user_idx').on(table.userId),
  ],
);

/**
 * Rate limiting. Counters are stored server-side so a client cannot reset
 * them, and are keyed by an opaque subject (user id, hashed IP, device).
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    /** `<bucket>:<subject>` — e.g. `login:ip:9f3c…`. */
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: text('count').notNull().default('0'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('rate_limit_expires_idx').on(table.expiresAt)],
);
