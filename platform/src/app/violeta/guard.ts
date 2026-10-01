import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { isDomainError } from '@/server/errors';
import { hasPermission } from '@/server/domains/access/authorize';
import { requireMember, touchPresence, unreadThreadCount, type Member } from '@/server/domains/safe-space/service';

/** Every page inside the space: a current member, or back to the door with why. */
export async function violetaPage(userId: string | null): Promise<{ member: Member; unread: number; guardian: boolean }> {
  if (!userId) redirect('/login?next=/violeta');
  let member: Member;
  try {
    member = await requireMember(db(), userId);
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`/violeta?error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  const [unread, guardian] = await Promise.all([unreadThreadCount(db(), member), hasPermission(db(), userId, 'safe_space.review'), touchPresence(db(), member.id)]);
  return { member, unread, guardian };
}
