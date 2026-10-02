'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { appoint, removeAppointment } from '@/server/domains/access/staff';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffChange(formData: FormData, change: typeof appoint) {
  const session = await currentSession();
  if (!session) redirect('/login');
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  const q = String(formData.get('q') ?? '').slice(0, 100);
  const back = `/admin/team${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  if (!UUID.test(userId)) redirect(back);
  try {
    await db().transaction((tx) => change(tx, { actor: { userId: session.user.userId, status: session.user.status }, userId, role }));
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  revalidatePath('/admin/team');
  redirect(`${back}${back.includes('?') ? '&' : '?'}done=1`);
}

export async function appointAction(formData: FormData): Promise<void> {
  await staffChange(formData, appoint);
}

export async function removeAppointmentAction(formData: FormData): Promise<void> {
  await staffChange(formData, removeAppointment);
}
