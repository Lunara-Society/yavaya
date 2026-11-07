'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { signInPath } from '@/server/auth/sign-in-path';
import { deleteConversation, sendReply } from '@/server/domains/whatsapp/service';

const WA_ID = /^\d{6,20}$/;

async function staff() {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  return { userId: session.user.userId, status: session.user.status };
}

function failed(path: string, error: unknown): never {
  if (isDomainError(error) && error.expose) redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(error.messageKey)}`);
  throw error;
}

/** A reply written by a person on the team. Permission and the 24-hour window are checked in the service. */
export async function replyAction(formData: FormData): Promise<void> {
  const actor = await staff();
  const waId = String(formData.get('waId') ?? '');
  if (!WA_ID.test(waId)) redirect('/admin/whatsapp');
  const back = `/admin/whatsapp?c=${waId}`;
  try {
    await db().transaction((tx) => sendReply(tx, actor, waId, String(formData.get('text') ?? '')));
  } catch (error) {
    failed(back, error);
  }
  revalidatePath('/admin/whatsapp');
  redirect(`${back}&sent=1`);
}

export async function deleteConversationAction(formData: FormData): Promise<void> {
  const actor = await staff();
  const waId = String(formData.get('waId') ?? '');
  if (!WA_ID.test(waId)) redirect('/admin/whatsapp');
  try {
    await db().transaction((tx) => deleteConversation(tx, actor, waId));
  } catch (error) {
    failed(`/admin/whatsapp?c=${waId}`, error);
  }
  revalidatePath('/admin/whatsapp');
  redirect('/admin/whatsapp?deleted=1');
}
