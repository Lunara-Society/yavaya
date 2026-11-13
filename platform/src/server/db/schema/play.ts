import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Yavaya Play (docs/PLAY.md). Its own tables, apart from everything else:
 * nothing here touches tokens, reputation or the marketplace.
 *
 * A player's character. `look` is a set of ids from config/play-looks.ts,
 * checked by the server before it is stored (`parseLook`); it never holds a
 * colour or a shape of its own.
 */
export const playProfiles = pgTable('play_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  look: jsonb('look').$type<Record<string, string>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
