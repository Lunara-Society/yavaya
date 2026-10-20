'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { appoint, removeAppointment } from '@/server/domains/access/staff';
import { SANCTION_RULES } from '@/config/business-rules';
import {
  banMember,
  decideAppeal,
  deliverSanctionNotices,
  reinstateMember,
  resetMemberTwoStep,
  SANCTION_REASONS,
  signOutMemberEverywhere,
  suspendMember,
  type SanctionNotice,
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
  // "review" (or anything unrecognised) means until an admin reviews; the
  // domain function rejects a number that is not one of the allowed lengths.
  const daysValue = Number(formData.get('days'));
  const days = Number.isInteger(daysValue) && daysValue > 0 ? daysValue : null;
  const actor = { userId: session.user.userId, status: session.user.status };
  let notice: SanctionNotice | null = null;
  try {
    notice = await db().transaction(async (tx) => {
      if (what === 'suspend') return suspendMember(tx, { actor, userId, reason, note, days });
      if (what === 'ban') return banMember(tx, { actor, userId, reason, note });
      if (what === 'reinstate') return reinstateMember(tx, { actor, userId, note });
      if (what === 'two_step') await resetMemberTwoStep(tx, { actor, userId, note });
      else if (what === 'sign_out') await signOutMemberEverywhere(tx, { actor, userId, note });
      return null;
    });
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`${back}&error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  if (notice) await deliverSanctionNotices([notice]);
  revalidatePath('/admin/members');
  redirect(`${back}&done=${encodeURIComponent(what)}`);
}

/** An admin answers an appeal: keep the sanction, or lift it. The member is emailed either way. */
export async function appealDecisionAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const appealId = String(formData.get('appealId') ?? '');
  if (!UUID.test(appealId)) redirect('/admin/appeals');
  const outcome = formData.get('outcome') === 'lifted' ? 'lifted' : 'upheld';
  const response = String(formData.get('response') ?? '').slice(0, SANCTION_RULES.responseMaxLength + 1);
  let notice: SanctionNotice;
  try {
    notice = await db().transaction((tx) =>
      decideAppeal(tx, { actor: { userId: session.user.userId, status: session.user.status }, appealId, outcome, response }),
    );
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`/admin/appeals?error=${encodeURIComponent(error.messageKey)}`);
    throw error;
  }
  await deliverSanctionNotices([notice]);
  revalidatePath('/admin/appeals');
  redirect(`/admin/appeals?done=${outcome}`);
}
