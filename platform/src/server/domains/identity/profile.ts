import 'server-only';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { parseYayId } from './yay-id';

/**
 * The public face of a member: who they are on Yavaya, found by the YAY ID
 * they already show on every listing. Nothing here is more than a listing
 * reveals — the name they chose, the ID, the date they joined; everything
 * else goes through the Trust Shield's boundary.
 *
 * Banned and deactivated accounts have no public profile.
 */
export async function findPublicMember(
  executor: Executor,
  yayIdInput: string,
): Promise<{ userId: string; displayName: string; memberSince: Date } | null> {
  const digits = parseYayId(decodeURIComponent(yayIdInput));
  if (!digits) return null;
  const [row] = await executor
    .select({ userId: users.id, displayName: users.displayName, memberSince: users.createdAt })
    .from(users)
    .where(and(eq(users.yayId, digits), isNull(users.deactivatedAt), notInArray(users.status, ['banned', 'deactivated'])))
    .limit(1);
  return row ?? null;
}
