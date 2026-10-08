import { boolean, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Who brought whom. One row per invited account, written at registration
 * from the invitation link. The reward is paid once, when the new account
 * verifies its email, and `rewardedAt` records that it was.
 *
 * `suspect` is set when registration found the two accounts sharing signals
 * (device, network): very likely the same person inviting themselves. Such
 * a row is kept, so the invitation still shows, but it never pays.
 */
export const referrals = pgTable(
  'referrals',
  {
    inviteeUserId: uuid('invitee_user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviterUserId: uuid('inviter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    suspect: boolean('suspect').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
  },
  (table) => [index('referrals_inviter_idx').on(table.inviterUserId, table.rewardedAt)],
);
