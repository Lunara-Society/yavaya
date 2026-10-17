import 'server-only';
import { and, asc, eq, isNull, ne, or, gt } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { notifications, userRoles, users } from '@/server/db/schema';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { STAFF_WELCOME_TYPE } from './staff';

/**
 * The welcome a member sees when they are named to the team.
 *
 * Appointing someone writes an `staff.appointed` notification. While it is
 * unread, signing in lands on `/welcome` instead of the home page; opening
 * the welcome marks it read, so it is a moment, not a door that keeps
 * swinging shut in their face.
 */

export async function hasUnseenWelcome(executor: Executor, userId: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, STAFF_WELCOME_TYPE), isNull(notifications.readAt)))
    .limit(1);
  return Boolean(row);
}

export type Welcome = { displayName: string; yayId: string; roles: string[] };

/** What the welcome page shows; null when this member holds no team role. */
export async function welcomeFor(executor: Executor, userId: string): Promise<Welcome | null> {
  const [user] = await executor.select({ displayName: users.displayName, yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const rows = await executor
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(userRoles.revokedAt),
        eq(userRoles.scope, 'global'),
        ne(userRoles.roleKey, 'member'),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(userRoles.grantedAt));
  if (rows.length === 0) return null;
  return { displayName: user.displayName, yayId: formatYayId(user.yayId), roles: rows.map((row) => row.roleKey) };
}

export async function markWelcomeSeen(executor: Executor, userId: string): Promise<void> {
  await executor
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.type, STAFF_WELCOME_TYPE), isNull(notifications.readAt)));
}
