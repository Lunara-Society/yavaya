'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { markAllRead } from '@/server/domains/notifications/service';
import { signInPath } from '@/server/auth/sign-in-path';

export async function markAllReadAction(): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  await markAllRead(db(), session.user.userId);
  revalidatePath('/', 'layout');
  redirect('/notifications');
}
