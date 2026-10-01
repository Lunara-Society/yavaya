'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  churchInputSchema,
  devotionalInputSchema,
  publishDevotional,
  registerChurch,
  removeDevotional,
  REPORT_DECISIONS,
  reportChurch,
  resolveSanctuaryTicket,
  REVIEW_DECISIONS,
  reviewChurch,
  SANCTUARY_REPORT_CATEGORIES,
  serviceInputSchema,
  toggleFollow,
  updateChurch,
  type ReportDecision,
  type ReviewDecision,
  type SanctuaryReportCategory,
  type ServiceInput,
} from '@/server/domains/sanctuary/service';
import { SERVICE_ROWS } from '@/ui/sanctuary/config';

/**
 * Sanctuary's mutations: plain forms, no JavaScript needed. A refusal
 * returns to the same page with its reason as a message key.
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

const back = (path: string, key: string) => `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(key)}`;

function readChurch(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? '');
  const church = churchInputSchema.safeParse({
    name: field('name'),
    denomination: field('denomination'),
    description: field('description'),
    locationId: field('locationId'),
    address: field('address'),
    whatsapp: field('whatsapp'),
    streamUrl: field('streamUrl'),
  });
  const services: ServiceInput[] = [];
  let serviceError: string | null = null;
  for (let i = 0; i < SERVICE_ROWS; i += 1) {
    const day = field(`service_day_${i}`);
    const time = field(`service_time_${i}`);
    const title = field(`service_title_${i}`);
    if (!time && !title.trim()) continue; // an unused row
    const parsed = serviceInputSchema.safeParse({ weekday: Number(day), startTime: time, title });
    if (!parsed.success) serviceError = parsed.error.issues[0]?.message ?? 'sanctuary.error.service_time';
    else services.push(parsed.data);
  }
  return { church, services, serviceError };
}

export async function registerChurchAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (formData.get('leader') !== 'on') redirect(back('/sanctuary/register', 'sanctuary.error.leader'));
  const { church, services, serviceError } = readChurch(formData);
  if (!church.success) redirect(back('/sanctuary/register', church.error.issues[0]?.message ?? 'error.validation_failed'));
  if (serviceError) redirect(back('/sanctuary/register', serviceError));

  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `sanctuary:${session.user.userId}`);
  if (!limit.allowed) redirect(back('/sanctuary/register', 'sanctuary.error.rate_limited'));

  let churchId: string;
  try {
    const audit = await auditContext();
    churchId = await db().transaction((tx) => registerChurch(tx, { ownerUserId: session.user.userId, input: church.data, services, audit }));
  } catch (error) {
    redirect(back('/sanctuary/register', errorKey(error)));
  }
  redirect(`/sanctuary/manage/${churchId}?done=submitted`);
}

export async function updateChurchAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  if (!UUID.test(churchId)) redirect('/sanctuary/manage');
  const editPath = `/sanctuary/manage/${churchId}/edit`;
  const { church, services, serviceError } = readChurch(formData);
  if (!church.success) redirect(back(editPath, church.error.issues[0]?.message ?? 'error.validation_failed'));
  if (serviceError) redirect(back(editPath, serviceError));

  let reReview = false;
  try {
    const audit = await auditContext();
    ({ reReview } = await db().transaction((tx) => updateChurch(tx, { actorUserId: session.user.userId, churchId, input: church.data, services, audit })));
  } catch (error) {
    redirect(back(editPath, errorKey(error)));
  }
  revalidatePath('/sanctuary', 'layout');
  redirect(`/sanctuary/manage/${churchId}?done=${reReview ? 'saved_review' : 'saved'}`);
}

export async function publishDevotionalAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  if (!UUID.test(churchId)) redirect('/sanctuary/manage');
  const managePath = `/sanctuary/manage/${churchId}`;
  const parsed = devotionalInputSchema.safeParse({
    forDate: String(formData.get('forDate') ?? ''),
    title: String(formData.get('title') ?? ''),
    scripture: String(formData.get('scripture') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  if (!parsed.success) redirect(back(managePath, parsed.error.issues[0]?.message ?? 'error.validation_failed') + '#publish');

  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `sanctuary:${session.user.userId}`);
  if (!limit.allowed) redirect(back(managePath, 'sanctuary.error.rate_limited') + '#publish');
  try {
    const audit = await auditContext();
    await db().transaction((tx) => publishDevotional(tx, { actorUserId: session.user.userId, churchId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back(managePath, errorKey(error)) + '#publish');
  }
  revalidatePath('/sanctuary', 'layout');
  redirect(`${managePath}?done=published#words`);
}

export async function withdrawDevotionalAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  const devotionalId = String(formData.get('devotionalId') ?? '');
  if (!UUID.test(churchId) || !UUID.test(devotionalId)) redirect('/sanctuary/manage');
  try {
    await db().transaction((tx) => removeDevotional(tx, { actorUserId: session.user.userId, devotionalId }));
  } catch (error) {
    redirect(back(`/sanctuary/manage/${churchId}`, errorKey(error)));
  }
  revalidatePath('/sanctuary', 'layout');
  redirect(`/sanctuary/manage/${churchId}?done=withdrawn#words`);
}

export async function followAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  if (!UUID.test(churchId)) redirect('/sanctuary');
  try {
    await db().transaction((tx) => toggleFollow(tx, { userId: session.user.userId, churchId }));
  } catch (error) {
    redirect(back(`/sanctuary/churches/${churchId}`, errorKey(error)));
  }
  revalidatePath('/sanctuary', 'layout');
  redirect(`/sanctuary/churches/${churchId}`);
}

export async function reportChurchAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  const devotionalId = String(formData.get('devotionalId') ?? '');
  const category = String(formData.get('category') ?? '');
  if (!UUID.test(churchId)) redirect('/sanctuary');
  const returnTo = devotionalId && UUID.test(devotionalId) ? `/sanctuary/words/${devotionalId}` : `/sanctuary/churches/${churchId}`;
  if (!(SANCTUARY_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(returnTo);

  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(back(returnTo, 'sanctuary.error.rate_limited'));
  let code: string;
  try {
    ({ ticketCode: code } = await db().transaction((tx) =>
      reportChurch(tx, {
        churchId,
        reporterUserId: session.user.userId,
        category: category as SanctuaryReportCategory,
        description: String(formData.get('details') ?? '').trim().slice(0, 2000) || null,
        devotionalId: devotionalId && UUID.test(devotionalId) ? devotionalId : null,
      }),
    ));
  } catch (error) {
    redirect(back(returnTo, errorKey(error)));
  }
  redirect(`${returnTo}?reported=${encodeURIComponent(code)}`);
}

export async function reviewChurchAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const churchId = String(formData.get('churchId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(churchId) || !(REVIEW_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/sanctuary');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null;
  try {
    await db().transaction((tx) => reviewChurch(tx, { actor: session.user, churchId, decision: decision as ReviewDecision, note }));
  } catch (error) {
    redirect(back('/admin/sanctuary', errorKey(error)));
  }
  revalidatePath('/sanctuary', 'layout');
  redirect('/admin/sanctuary?done=1');
}

export async function resolveSanctuaryReportAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');
  const ticketId = String(formData.get('ticketId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!UUID.test(ticketId) || !(REPORT_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/sanctuary');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null;
  try {
    await db().transaction((tx) => resolveSanctuaryTicket(tx, { actor: session.user, ticketId, decision: decision as ReportDecision, note }));
  } catch (error) {
    redirect(back('/admin/sanctuary', errorKey(error)));
  }
  revalidatePath('/sanctuary', 'layout');
  redirect('/admin/sanctuary?done=1');
}
