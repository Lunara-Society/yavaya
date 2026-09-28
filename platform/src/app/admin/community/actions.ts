'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { COMMUNITY_DECISIONS, resolveCommunityTicket, type CommunityDecision } from '@/server/domains/community/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Authority is checked inside the service, in the same transaction as the decision. */
export async function resolveCommunityTicketAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const ticketId = String(formData.get('ticketId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(ticketId) || !(COMMUNITY_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/community');
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;
  await db().transaction((tx) =>
    resolveCommunityTicket(tx, {
      actor: { userId: session.user.userId, status: session.user.status },
      ticketId,
      decision: decision as CommunityDecision,
      note,
    }),
  );
  revalidatePath('/admin/community');
  revalidatePath('/community', 'layout');
  redirect('/admin/community');
}
