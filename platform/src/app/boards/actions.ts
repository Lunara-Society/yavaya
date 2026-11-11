'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { signInPath } from '@/server/auth/sign-in-path';
import { BOARD_DISTRICTS, BOARD_KINDS, isBoardDistrict, type BoardKind } from '@/config/boards';
import {
  BOARD_DECISIONS,
  BOARD_REPORT_CATEGORIES,
  closeBoardPost,
  deleteBoardAlert,
  saveBoardAlert,
  reportBoardPost,
  resolveBoardTicket,
  type BoardDecision,
  type BoardReportCategory,
} from '@/server/domains/boards/service';

/**
 * The board districts' mutations: plain forms, no JavaScript needed. A
 * refusal returns to the same page with the reason as a message key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function auditContext() {
  const context = await requestContext();
  return { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
}

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

function home(district: string): string {
  return isBoardDistrict(district) ? `/${BOARD_DISTRICTS[district].slug}` : '/districts';
}

export async function closeBoardPostAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const postId = String(formData.get('postId') ?? '');
  const base = home(String(formData.get('district') ?? ''));
  if (!UUID.test(postId)) redirect(base);
  try {
    const audit = await auditContext();
    await db().transaction((tx) => closeBoardPost(tx, { postId, authorUserId: session.user.userId, audit }));
  } catch (error) {
    redirect(`${base}/${postId}?error=${encodeURIComponent(errorKey(error))}`);
  }
  revalidatePath(base);
  redirect(`${base}?mine=1`);
}

export async function reportBoardPostAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const postId = String(formData.get('postId') ?? '');
  const base = home(String(formData.get('district') ?? ''));
  const category = String(formData.get('category') ?? '');
  if (!UUID.test(postId) || !(BOARD_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(base);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishMonitored, `board.report:${session.user.userId}`);
  if (!limit.allowed) redirect(`${base}/${postId}?error=mercadito.report.limited`);
  const description = String(formData.get('description') ?? '').trim().slice(0, 1000) || null;
  let code: string;
  try {
    const result = await db().transaction((tx) => reportBoardPost(tx, { postId, reporterUserId: session.user.userId, category: category as BoardReportCategory, description }));
    code = result.ticketCode;
  } catch (error) {
    redirect(`${base}/${postId}?error=${encodeURIComponent(errorKey(error))}`);
  }
  redirect(`${base}/${postId}?reported=${encodeURIComponent(code)}`);
}

export async function resolveBoardTicketAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const ticketId = String(formData.get('ticketId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(ticketId) || !(BOARD_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/distritos');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null;
  await db().transaction((tx) =>
    resolveBoardTicket(tx, { actor: { userId: session.user.userId, status: session.user.status }, ticketId, decision: decision as BoardDecision, note }),
  );
  revalidatePath('/admin/distritos');
  redirect('/admin/distritos');
}

/** "Avísame": keeps the filters the member is looking at as an alert. */
export async function saveBoardAlertAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const district = String(formData.get('district') ?? '');
  if (!isBoardDistrict(district)) redirect('/districts');
  const base = home(district);
  const kind = String(formData.get('kind') ?? '');
  try {
    await db().transaction((tx) =>
      saveBoardAlert(tx, {
        userId: session.user.userId,
        filters: {
          district,
          subdistrict: String(formData.get('sub') ?? '') || null,
          kind: (BOARD_KINDS as readonly string[]).includes(kind) ? (kind as BoardKind) : null,
          query: String(formData.get('q') ?? '') || null,
          placeCode: String(formData.get('place') ?? '') || null,
        },
      }),
    );
  } catch (error) {
    redirect(`${base}?mine=1&error=${encodeURIComponent(errorKey(error))}`);
  }
  revalidatePath(base);
  redirect(`${base}?mine=1&saved=1`);
}

export async function deleteBoardAlertAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const id = String(formData.get('alertId') ?? '');
  const base = home(String(formData.get('district') ?? ''));
  if (UUID.test(id)) await db().transaction((tx) => deleteBoardAlert(tx, { userId: session.user.userId, id }));
  revalidatePath(base);
  redirect(`${base}?mine=1`);
}
