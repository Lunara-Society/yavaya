'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import {
  acceptResponse,
  cancelRequest,
  completeRequest,
  createRequest,
  LICENCE_DECISIONS,
  providerInputSchema,
  reportServices,
  requestInputSchema,
  resolveServicesTicket,
  respond,
  responseInputSchema,
  reviewLicence,
  reviewProvider,
  saveProvider,
  SERVICES_REPORT_CATEGORIES,
  SERVICES_TICKET_DECISIONS,
  setAvailableToday,
  type LicenceDecision,
  type ServicesReportCategory,
  type ServicesTicketDecision,
} from '@/server/domains/services/service';

/**
 * Servicios' mutations: plain forms that work on any phone, without
 * JavaScript. A refusal returns to the same page with its reason as a key.
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
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return session;
}

export async function createRequestAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const parsed = requestInputSchema.safeParse({
    category: field(formData, 'category'),
    title: field(formData, 'title'),
    body: field(formData, 'body'),
    locationId: field(formData, 'locationId'),
    urgent: formData.get('urgent') === 'on',
    anonymous: formData.get('anonymous') === 'on',
  });
  const form = `/services/new?cat=${encodeURIComponent(field(formData, 'category'))}`;
  if (!parsed.success) redirect(back(form, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const monitored = session.user.monitoredUntil > new Date();
  const limit = await consumeRateLimit(db(), monitored ? RATE_LIMITS.publishMonitored : RATE_LIMITS.publishStandard, `services:${session.user.userId}`);
  if (!limit.allowed) redirect(back(form, 'services.error.rate_limited'));
  let id: string;
  try {
    const audit = await auditContext();
    id = await db().transaction((tx) => createRequest(tx, { requesterUserId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back(form, errorKey(error)));
  }
  revalidatePath('/services');
  redirect(`/services/requests/${id}?created=1`);
}

export async function respondAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const requestId = field(formData, 'requestId');
  if (!UUID.test(requestId)) redirect('/services');
  const page = `/services/requests/${requestId}`;
  const parsed = responseInputSchema.safeParse({ message: field(formData, 'message'), priceText: field(formData, 'priceText') });
  if (!parsed.success) redirect(back(page, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `services:${session.user.userId}`);
  if (!limit.allowed) redirect(back(page, 'services.error.rate_limited'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => respond(tx, { providerUserId: session.user.userId, requestId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(`${page}?responded=1`);
}

export async function requestStepAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const requestId = field(formData, 'requestId');
  if (!UUID.test(requestId)) redirect('/services');
  const page = `/services/requests/${requestId}`;
  const step = field(formData, 'step');
  try {
    if (step === 'accept') {
      const responseId = field(formData, 'responseId');
      if (!UUID.test(responseId)) redirect(page);
      await db().transaction((tx) => acceptResponse(tx, { requesterUserId: session.user.userId, requestId, responseId }));
    } else if (step === 'complete') {
      await db().transaction((tx) => completeRequest(tx, { requesterUserId: session.user.userId, requestId }));
    } else if (step === 'cancel') {
      await db().transaction((tx) => cancelRequest(tx, { requesterUserId: session.user.userId, requestId }));
    } else if (step === 'review') {
      const rating = Number.parseInt(field(formData, 'rating'), 10);
      await db().transaction((tx) => reviewProvider(tx, { reviewerUserId: session.user.userId, requestId, rating, body: field(formData, 'body') || null }));
    } else {
      redirect(page);
    }
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  revalidatePath(page);
  redirect(page);
}

export async function saveProviderAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const parsed = providerInputSchema.safeParse({
    headline: field(formData, 'headline'),
    bio: field(formData, 'bio'),
    categories: formData.getAll('categories').map(String),
    locationId: field(formData, 'locationId'),
    whatsapp: field(formData, 'whatsapp'),
    licenceClaim: field(formData, 'licenceClaim'),
  });
  if (!parsed.success) redirect(back('/services/provider', parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  try {
    const audit = await auditContext();
    await db().transaction((tx) => saveProvider(tx, { userId: session.user.userId, input: parsed.data, audit }));
  } catch (error) {
    redirect(back('/services/provider', errorKey(error)));
  }
  revalidatePath('/services');
  redirect('/services/provider?saved=1');
}

export async function availabilityAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const available = field(formData, 'available') === 'true';
  const to = field(formData, 'back') === 'board' ? '/services' : '/services/provider';
  try {
    await db().transaction((tx) => setAvailableToday(tx, { userId: session.user.userId, available }));
  } catch (error) {
    redirect(back(to, errorKey(error)));
  }
  revalidatePath('/services');
  redirect(to);
}

export async function reportServicesAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const subject = field(formData, 'subject') === 'provider' ? 'provider' : 'request';
  const subjectId = field(formData, 'subjectId');
  const from = field(formData, 'from');
  const page = from.startsWith('/services/') ? from : '/services';
  if (!UUID.test(subjectId)) redirect(page);
  const category = field(formData, 'category');
  if (!(SERVICES_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(back(page, 'services.report.error.category'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(back(page, 'services.error.rate_limited'));
  let code: string;
  try {
    ({ ticketCode: code } = await db().transaction((tx) =>
      reportServices(tx, {
        reporterUserId: session.user.userId,
        subject,
        subjectId,
        category: category as ServicesReportCategory,
        description: field(formData, 'description').trim().slice(0, 1000) || null,
      }),
    ));
  } catch (error) {
    redirect(back(page, errorKey(error)));
  }
  redirect(`${page}${page.includes('?') ? '&' : '?'}reported=${encodeURIComponent(code)}`);
}

export async function reviewLicenceAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const providerUserId = field(formData, 'providerUserId');
  const decision = field(formData, 'decision');
  if (!UUID.test(providerUserId) || !(LICENCE_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/services');
  try {
    await db().transaction((tx) =>
      reviewLicence(tx, {
        actor: { userId: session.user.userId, status: session.user.status },
        providerUserId,
        decision: decision as LicenceDecision,
        note: field(formData, 'note').trim().slice(0, 1000) || null,
      }),
    );
  } catch (error) {
    redirect(back('/admin/services', errorKey(error)));
  }
  revalidatePath('/admin/services');
  redirect('/admin/services?done=1');
}

export async function resolveServicesReportAction(formData: FormData): Promise<void> {
  const session = await signedIn();
  const ticketId = field(formData, 'ticketId');
  const decision = field(formData, 'decision');
  if (!UUID.test(ticketId) || !(SERVICES_TICKET_DECISIONS as readonly string[]).includes(decision)) redirect('/admin/services');
  try {
    await db().transaction((tx) =>
      resolveServicesTicket(tx, {
        actor: { userId: session.user.userId, status: session.user.status },
        ticketId,
        decision: decision as ServicesTicketDecision,
        note: field(formData, 'note').trim().slice(0, 1000) || null,
      }),
    );
  } catch (error) {
    redirect(back('/admin/services', errorKey(error)));
  }
  revalidatePath('/admin/services');
  redirect('/admin/services?done=1');
}
