'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { signInPath } from '@/server/auth/sign-in-path';
import { isDomainError } from '@/server/errors';
import { PROFILE_DECISIONS, resolveProfileTicket, type ProfileDecision } from '@/server/domains/identity/profile-reports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Authority is checked inside the service, in the same transaction as the decision. */
export async function resolveProfileTicketAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const ticketId = String(formData.get('ticketId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(ticketId) || !(PROFILE_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/profiles');
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;
  try {
    await db().transaction((tx) =>
      resolveProfileTicket(tx, {
        actor: { userId: session.user.userId, status: session.user.status },
        ticketId,
        decision: decision as ProfileDecision,
        note,
      }),
    );
  } catch (error) {
    // A reset without its note comes back to the queue saying so.
    if (isDomainError(error) && error.expose) redirect(`/admin/profiles?error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  revalidatePath('/admin/profiles');
  redirect('/admin/profiles');
}
