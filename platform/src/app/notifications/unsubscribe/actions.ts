'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { setDigestEnabled, verifyUnsubscribe } from '@/server/domains/notifications/digest';

/** Switches the daily summary off or back on, on the authority of the signed link. */
export async function digestFromLinkAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('u') ?? '');
  const signature = String(formData.get('s') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (!verifyUnsubscribe(userId, signature)) redirect('/notifications/unsubscribe');
  await setDigestEnabled(db(), userId, enabled);
  redirect(`/notifications/unsubscribe?u=${userId}&s=${signature}&done=${enabled ? 'on' : 'off'}`);
}
