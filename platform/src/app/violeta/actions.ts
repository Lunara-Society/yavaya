'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  changeHandle,
  deleteOwnRoomMessage,
  deleteOwnThreadMessage,
  join,
  leave,
  postRoomMessage,
  REPORT_DECISIONS,
  reportMessage,
  requireMember,
  resolveReport,
  sendThreadMessage,
  setPresenceVisible,
  setPrivatePractice,
  setThreadBlocked,
  startThread,
  type ReportDecision,
} from '@/server/domains/safe-space/service';

/** Espacio Violeta's mutations. Plain forms; nothing here notifies anyone. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const back = (path: string, key: string) => `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(key)}`;

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect('/login?next=/violeta');
  return session;
}

/** The acting member, or back to the door with the reason. */
async function acting() {
  const session = await signedIn();
  try {
    return { session, member: await requireMember(db(), session.user.userId) };
  } catch (error) {
    redirect(back('/violeta', errorKey(error)));
  }
}

/** Only a path inside the space; anything else returns to the room. */
function safeReturn(formData: FormData): string {
  const path = field(formData, 'from');
  return /^\/violeta(\/[a-z]+(\/[0-9a-f-]{36})?)?$/.test(path) ? path : '/violeta/sala';
}

export async function joinAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const kind = field(formData, 'kind') === 'professional' ? 'professional' : 'member';
  try {
    await db().transaction((tx) =>
      join(tx, { userId: session.user.userId, kind, profession: field(formData, 'profession') || null, pledges: formData.getAll('pledge').map(String) }),
    );
  } catch (error) {
    redirect(back('/violeta', errorKey(error)));
  }
  redirect('/violeta/sala?welcome=1');
}

export async function postRoomAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.safeSpaceMessage, `safe:${member.id}`);
  if (!limit.allowed) redirect(back('/violeta/sala', 'violeta.error.rate_limited'));
  try {
    await db().transaction((tx) => postRoomMessage(tx, { memberId: member.id, text: field(formData, 'text') }));
  } catch (error) {
    redirect(back('/violeta/sala', errorKey(error)));
  }
  revalidatePath('/violeta/sala');
  redirect('/violeta/sala#end');
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  const messageId = field(formData, 'messageId');
  const from = safeReturn(formData);
  if (UUID.test(messageId)) {
    if (field(formData, 'source') === 'thread') await db().transaction((tx) => deleteOwnThreadMessage(tx, { viewer: member, messageId }));
    else await db().transaction((tx) => deleteOwnRoomMessage(tx, { memberId: member.id, messageId }));
  }
  revalidatePath(from);
  redirect(from);
}

export async function startThreadAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  const otherMemberId = field(formData, 'memberId');
  if (!UUID.test(otherMemberId)) redirect('/violeta/sala');
  let threadId: string;
  try {
    threadId = await db().transaction(async (tx) => {
      const limit = await consumeRateLimit(tx, RATE_LIMITS.safeSpaceThread, `safe:${member.id}`);
      if (!limit.allowed) throw Object.assign(new Error('limited'), { limited: true });
      return startThread(tx, { member, otherMemberId });
    });
  } catch (error) {
    if (error instanceof Error && 'limited' in error) redirect(back('/violeta/sala', 'violeta.error.rate_limited'));
    redirect(back('/violeta/sala', errorKey(error)));
  }
  redirect(`/violeta/privado/${threadId}`);
}

export async function sendThreadAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  const threadId = field(formData, 'threadId');
  if (!UUID.test(threadId)) redirect('/violeta/privado');
  const page = `/violeta/privado/${threadId}`;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.safeSpaceMessage, `safe:${member.id}`);
  if (!limit.allowed) redirect(back(page, 'violeta.error.rate_limited'));
  try {
    await db().transaction((tx) => sendThreadMessage(tx, { viewer: member, threadId, text: field(formData, 'text') }));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(`${page}#end`);
}

export async function blockAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  const threadId = field(formData, 'threadId');
  if (!UUID.test(threadId)) redirect('/violeta/privado');
  await db().transaction((tx) => setThreadBlocked(tx, { viewer: member, threadId, blocked: field(formData, 'blocked') === '1' }));
  redirect(`/violeta/privado/${threadId}`);
}

export async function reportAction(formData: FormData): Promise<void> {
  const { session, member } = await acting();
  const from = safeReturn(formData);
  const messageId = field(formData, 'messageId');
  if (!UUID.test(messageId)) redirect(from);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(back(from, 'violeta.error.rate_limited'));
  try {
    await db().transaction((tx) =>
      reportMessage(tx, { viewer: member, source: field(formData, 'source') === 'thread' ? 'thread' : 'room', messageId, category: field(formData, 'category'), note: field(formData, 'note') || null }),
    );
  } catch (error) {
    redirect(back(from, errorKey(error)));
  }
  redirect(`${from}${from.includes('?') ? '&' : '?'}reported=1`);
}

export async function presenceAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  await db().transaction((tx) => setPresenceVisible(tx, { memberId: member.id, visible: field(formData, 'visible') === '1' }));
  redirect('/violeta/ajustes?saved=1');
}

/** A professional's choice to be reachable outside Yavaya by women who wrote to them here. */
export async function privatePracticeAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  try {
    await db().transaction((tx) => setPrivatePractice(tx, { member, offered: field(formData, 'offered') === '1' }));
  } catch (error) {
    redirect(back('/violeta/ajustes', errorKey(error)));
  }
  redirect('/violeta/ajustes?saved=1');
}

export async function changeHandleAction(): Promise<void> {
  const { member } = await acting();
  try {
    await db().transaction((tx) => changeHandle(tx, { memberId: member.id }));
  } catch (error) {
    redirect(back('/violeta/ajustes', errorKey(error)));
  }
  redirect('/violeta/ajustes?renamed=1');
}

export async function leaveAction(formData: FormData): Promise<void> {
  const { member } = await acting();
  if (formData.get('confirm') !== 'on') redirect(back('/violeta/ajustes', 'violeta.error.confirm_leave'));
  try {
    await db().transaction((tx) => leave(tx, { memberId: member.id }));
  } catch (error) {
    redirect(back('/violeta/ajustes', errorKey(error)));
  }
  redirect('/violeta?left=1');
}

export async function resolveReportAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const reportId = field(formData, 'reportId');
  const decision = field(formData, 'decision');
  if (!UUID.test(reportId) || !(REPORT_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/violeta');
  try {
    await db().transaction((tx) => resolveReport(tx, { actor: { userId: session.user.userId, status: session.user.status }, reportId, decision: decision as ReportDecision }));
  } catch (error) {
    redirect(back('/admin/violeta', errorKey(error)));
  }
  revalidatePath('/admin/violeta');
  redirect('/admin/violeta?done=1');
}
