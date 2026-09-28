'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  addReply,
  closePost,
  COMMUNITY_REPORT_CATEGORIES,
  createPost,
  postInputSchema,
  replyInputSchema,
  reportPost,
  toggleSupport,
  type CommunityReportCategory,
} from '@/server/domains/community/service';

/**
 * Community's mutations: plain forms, no JavaScript needed. A refusal
 * returns to the same page with the reason as a message key.
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

export async function createPostAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const parsed = postInputSchema.safeParse({
    kind: String(formData.get('kind') ?? ''),
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    locationId: String(formData.get('locationId') ?? '') || null,
    anonymous: formData.get('anonymous') === 'on',
  });
  if (!parsed.success) redirect(`/community/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'error.validation_failed')}`);

  const monitored = session.user.monitoredUntil > new Date();
  const limit = await consumeRateLimit(
    db(),
    monitored ? RATE_LIMITS.publishMonitored : RATE_LIMITS.publishStandard,
    `community:${session.user.userId}`,
  );
  if (!limit.allowed) redirect('/community/new?error=community.error.rate_limited');

  let postId: string;
  try {
    const audit = await auditContext();
    postId = await db().transaction((tx) => createPost(tx, { authorUserId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(`/community/new?error=${encodeURIComponent(errorKey(error))}`);
  }
  revalidatePath('/community');
  redirect(`/community/${postId}`);
}

export async function replyAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const postId = String(formData.get('postId') ?? '');
  if (!UUID.test(postId)) redirect('/community');

  const body = replyInputSchema.safeParse(String(formData.get('body') ?? ''));
  if (!body.success) redirect(`/community/${postId}?error=community.error.reply#reply`);

  const limit = await consumeRateLimit(db(), RATE_LIMITS.communityReply, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(`/community/${postId}?error=community.error.rate_limited#reply`);

  try {
    const audit = await auditContext();
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: session.user.userId, body: body.data, audit }));
  } catch (error) {
    redirect(`/community/${postId}?error=${encodeURIComponent(errorKey(error))}#reply`);
  }
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}#replies`);
}

export async function supportAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const postId = String(formData.get('postId') ?? '');
  const back = formData.get('back') === 'square' ? '/community' : `/community/${postId}`;
  if (!UUID.test(postId)) redirect('/community');
  try {
    await db().transaction((tx) => toggleSupport(tx, { postId, userId: session.user.userId }));
  } catch (error) {
    errorKey(error);
  }
  revalidatePath('/community', 'layout');
  redirect(back);
}

export async function closePostAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const postId = String(formData.get('postId') ?? '');
  const outcome = formData.get('outcome') === 'resolved' ? 'resolved' : 'withdrawn';
  if (!UUID.test(postId)) redirect('/community');
  try {
    const audit = await auditContext();
    await db().transaction((tx) => closePost(tx, { postId, authorUserId: session.user.userId, outcome, audit }));
  } catch (error) {
    errorKey(error);
  }
  revalidatePath('/community', 'layout');
  redirect(`/community/${postId}`);
}

export async function reportPostAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const postId = String(formData.get('postId') ?? '');
  if (!UUID.test(postId)) redirect('/community');
  const replyIdValue = String(formData.get('replyId') ?? '');
  const replyId = UUID.test(replyIdValue) ? replyIdValue : null;
  const category = String(formData.get('category') ?? '');
  if (!(COMMUNITY_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(`/community/${postId}`);
  const description = String(formData.get('details') ?? '').trim().slice(0, 2000) || null;

  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(`/community/${postId}?error=mercadito.report.limited`);

  let code: string;
  try {
    const result = await db().transaction((tx) =>
      reportPost(tx, { postId, reporterUserId: session.user.userId, category: category as CommunityReportCategory, description, replyId }),
    );
    code = result.ticketCode;
  } catch (error) {
    redirect(`/community/${postId}?error=${encodeURIComponent(errorKey(error))}`);
  }
  redirect(`/community/${postId}?reported=${encodeURIComponent(code)}`);
}
