'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import {
  MODERATION_DECISIONS,
  resolveListingTicket,
  type ModerationDecision,
} from '@/server/domains/mercadito/moderation';
import { signInPath } from '@/server/auth/sign-in-path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves one case. Authority is checked inside `resolveListingTicket`,
 * against the database, in the same transaction as the decision — never
 * inferred from having been shown the button.
 */
export async function resolveTicketAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());

  const ticketId = String(formData.get('ticketId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(ticketId) || !(MODERATION_DECISIONS as readonly string[]).includes(decision)) {
    redirect('/admin/mercadito');
  }
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;

  await db().transaction((tx) =>
    resolveListingTicket(tx, {
      actor: { userId: session.user.userId, status: session.user.status },
      ticketId,
      decision: decision as ModerationDecision,
      note,
    }),
  );
  revalidatePath('/admin/mercadito');
  revalidatePath('/mercadito', 'layout');
  redirect('/admin/mercadito');
}
