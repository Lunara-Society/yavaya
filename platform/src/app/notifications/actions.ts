'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { markAllRead } from '@/server/domains/notifications/service';

export async function markAllReadAction(): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  await markAllRead(db(), session.user.userId);
  revalidatePath('/', 'layout');
  redirect('/notifications');
}
