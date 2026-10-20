'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { appoint, removeAppointment } from '@/server/domains/access/staff';
import {
  banMember,
  reinstateMember,
  resetMemberTwoStep,
  SANCTION_REASONS,
  signOutMemberEverywhere,
  suspendMember,
  type SanctionReason,
} from '@/server/domains/access/sanctions';

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

/**
 * One action for the member tool: the button pressed names what to do. Each
 * domain function checks its own permission; the page's hiding of a button
 * is only a courtesy.
 */
export async function memberAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const userId = String(formData.get('userId') ?? '');
  const q = String(formData.get('q') ?? '').slice(0, 100);
  const back = `/admin/members?q=${encodeURIComponent(q)}`;
  if (!UUID.test(userId)) redirect(back);
  const what = String(formData.get('do') ?? '');
  const note = String(formData.get('note') ?? '');
  const reasonValue = String(formData.get('reason') ?? 'other');
  const reason: SanctionReason = (SANCTION_REASONS as readonly string[]).includes(reasonValue) ? (reasonValue as SanctionReason) : 'other';
  const actor = { userId: session.user.userId, status: session.user.status };
  try {
    await db().transaction(async (tx) => {
      if (what === 'suspend') await suspendMember(tx, { actor, userId, reason, note });
      else if (what === 'ban') await banMember(tx, { actor, userId, reason, note });
      else if (what === 'reinstate') await reinstateMember(tx, { actor, userId, note });
      else if (what === 'two_step') await resetMemberTwoStep(tx, { actor, userId, note });
      else if (what === 'sign_out') await signOutMemberEverywhere(tx, { actor, userId, note });
    });
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`${back}&error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  revalidatePath('/admin/members');
  redirect(`${back}&done=${encodeURIComponent(what)}`);
}
