'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { signInPath } from '@/server/auth/sign-in-path';
import { moderateVideo } from '@/server/domains/mirador/videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A moderator takes a Mirador video down, or puts back one hidden by reports. The permission is checked in the domain. */
export async function moderateMiradorAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const videoId = String(formData.get('videoId') ?? '');
  const action = String(formData.get('action') ?? '');
  if (!UUID.test(videoId) || (action !== 'remove' && action !== 'restore')) redirect('/admin/mirador');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || undefined;
  await db().transaction((tx) => moderateVideo(tx, { actor: { userId: session.user.userId, status: session.user.status }, videoId, action, note }));
  revalidatePath('/admin/mirador');
  redirect('/admin/mirador');
}
