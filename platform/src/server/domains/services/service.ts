import 'server-only';
import { and, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '@/server/db/client';
import {
  locations,
  moderationActions,
  reports,
  servicesProviderProfiles,
  servicesRequests,
  servicesResponses,
  servicesReviews,
  tickets,
  users,
} from '@/server/db/schema';
import { SERVICES_RULES as R } from '@/config/business-rules';
import { SERVICE_CATEGORY_KEYS, serviceCategory, type ServiceCategoryKey } from '@/config/services';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { chargeForAction } from '@/server/domains/tokens/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { applyRule, getScore } from '@/server/domains/reputation/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { dayKey, notify } from '@/server/domains/notifications/service';

/**
 * Servicios: someone does something for me.
 *
 * Free to use: asking and answering are declared billable at zero cost
 * (`services.publish_request`, `services.respond`), which records nothing in
 * the ledger. Every change is audited in the transaction that makes it.
 *
 * Two rules carry most of the weight:
 *  - a licence shows as verified only after a reviewer checked it, and a
 *    regulated profession cannot be offered without stating one;
 *  - a request in a sensitive category is seen only by its requester and by
 *    providers of that category.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const REQUEST = 'services_request';
const PROVIDER = 'services_provider';

export const SERVICES_REPORT_CATEGORIES = ['scam', 'fraud', 'harassment', 'spam', 'other'] as const;
export type ServicesReportCategory = (typeof SERVICES_REPORT_CATEGORIES)[number];

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

const optionalText = (max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, { message: key }))
    .transform((value) => value || null);

export const requestInputSchema = z.object({
  category: z.enum(SERVICE_CATEGORY_KEYS, { message: 'services.error.category' }),
  title: text(R.titleMinLength, R.titleMaxLength, 'services.error.title'),
  body: text(R.bodyMinLength, R.bodyMaxLength, 'services.error.body'),
  locationId: z.string().uuid({ message: 'services.error.location' }),
  urgent: z.boolean(),
  anonymous: z.boolean(),
});
export type RequestInput = z.output<typeof requestInputSchema>;

export const responseInputSchema = z.object({
  message: text(R.messageMinLength, R.messageMaxLength, 'services.error.message'),
  priceText: optionalText(R.priceMaxLength, 'services.error.price'),
});
export type ResponseInput = z.output<typeof responseInputSchema>;

export const providerInputSchema = z.object({
  headline: text(R.headlineMinLength, R.headlineMaxLength, 'services.error.headline'),
  bio: text(R.bioMinLength, R.bioMaxLength, 'services.error.bio'),
  categories: z
    .array(z.enum(SERVICE_CATEGORY_KEYS, { message: 'services.error.category' }))
    .min(1, { message: 'services.error.categories' })
    .max(R.maxCategoriesPerProvider, { message: 'services.error.categories' })
    .transform((list) => [...new Set(list)]),
  locationId: z.string().uuid({ message: 'services.error.location' }),
  whatsapp: z.string().transform((value, ctx) => {
    const normalized = normalizeWhatsapp(value);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'services.error.whatsapp' });
    return normalized ?? '';
  }),
  licenceClaim: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(R.licenceMaxLength, { message: 'services.error.licence' }))
    .transform((value) => value || null),
});
export type ProviderInput = z.output<typeof providerInputSchema>;

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'services.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'services.error.account_restricted');
}

function isRegulated(category: string): boolean {
  return serviceCategory(category)?.regulated ?? false;
}

function isSensitive(category: string): boolean {
  return serviceCategory(category)?.sensitive ?? false;
}

// --- Providers -----------------------------------------------------------------

/**
 * Creates or updates a provider profile. Stating or changing a licence sends
 * it back to review: a verified badge belongs to the licence that was
 * checked, not to whatever is written there later.
 */
export async function saveProvider(tx: Executor, params: { userId: string; input: ProviderInput; audit?: AuditContext }): Promise<void> {
  await activeMember(tx, params.userId);
  const { input } = params;
  if (input.categories.some(isRegulated) && (!input.licenceClaim || input.licenceClaim.length < R.licenceMinLength)) {
    throw errors.validation('services.error.licence_required');
  }
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('services.error.location');

  const [existing] = await tx.select().from(servicesProviderProfiles).where(eq(servicesProviderProfiles.userId, params.userId)).limit(1).for('update');
  if (existing?.status === 'suspended') throw new DomainError('forbidden', 'services.error.provider_suspended');
  const licenceChanged = (existing?.licenceClaim ?? null) !== input.licenceClaim;
  const licence = licenceChanged
    ? { licenceClaim: input.licenceClaim, licenceStatus: input.licenceClaim ? ('pending' as const) : ('none' as const), licenceNote: null, licenceReviewedBy: null, licenceReviewedAt: null }
    : {};
  const values = {
    headline: input.headline,
    bio: input.bio,
    categories: input.categories,
    locationId: input.locationId,
    whatsappE164: input.whatsapp,
    updatedAt: new Date(),
    ...licence,
  };
  if (existing) {
    await tx.update(servicesProviderProfiles).set(values).where(eq(servicesProviderProfiles.userId, params.userId));
  } else {
    await tx.insert(servicesProviderProfiles).values({ userId: params.userId, ...values, licenceClaim: input.licenceClaim, licenceStatus: input.licenceClaim ? 'pending' : 'none' });
  }
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: existing ? 'services.provider_updated' : 'services.provider_created',
    subjectType: PROVIDER,
    subjectId: params.userId,
    district: 'services',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { categories: input.categories, licenceChanged },
  });
}

/** "Disponible hoy": on for `availableTodayHours`, or off. */
export async function setAvailableToday(tx: Executor, params: { userId: string; available: boolean; now?: Date }): Promise<Date | null> {
  const now = params.now ?? new Date();
  const until = params.available ? new Date(now.getTime() + R.availableTodayHours * 3_600_000) : null;
  const updated = await tx
    .update(servicesProviderProfiles)
    .set({ availableUntil: until, updatedAt: now })
    .where(and(eq(servicesProviderProfiles.userId, params.userId), eq(servicesProviderProfiles.status, 'active')))
    .returning({ userId: servicesProviderProfiles.userId });
  if (updated.length === 0) throw errors.notFound('services_provider');
  return until;
}

// --- Requests ------------------------------------------------------------------

/** Providers in the request's category and country, who are not the requester. */
async function matchingProviders(tx: Executor, params: { requestId: string; availableOnly: boolean; limit: number; now: Date }) {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select p.user_id
    from services_requests r
    join locations lr on lr.id = r.location_id
    join services_provider_profiles p on p.status = 'active' and r.category = any(p.categories) and p.user_id <> r.requester_user_id
    join locations lp on lp.id = p.location_id
    join users u on u.id = p.user_id and u.status = 'active'
    where r.id = ${params.requestId}
      and exists (
        select 1 from locations c
        where c.level = 'country'
          and (c.code = lr.code or c.code = any(lr.path))
          and (c.code = lp.code or c.code = any(lp.path))
      )
      ${params.availableOnly ? sql`and p.available_until > ${params.now.toISOString()}::timestamptz` : sql``}
    order by (lp.id = lr.id) desc, p.available_until desc nulls last
    limit ${params.limit}
  `);
  return rows.map((row) => row.user_id);
}

export async function createRequest(
  tx: Executor,
  params: { requesterUserId: string; input: RequestInput; audit?: AuditContext; now?: Date },
): Promise<string> {
  await activeMember(tx, params.requesterUserId);
  const now = params.now ?? new Date();
  const { input } = params;
  // A hidden name protects someone telling a stranger about their marriage or
  // their health; it is not for hiring a plumber.
  if (input.anonymous && !isSensitive(input.category)) throw errors.validation('services.error.anonymous');
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('services.error.location');
  const [open] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesRequests)
    .where(and(eq(servicesRequests.requesterUserId, params.requesterUserId), inArray(servicesRequests.status, ['open', 'in_progress'])));
  if ((open?.count ?? 0) >= R.maxOpenRequestsPerMember) throw errors.conflict('services.error.too_many_open', { limit: R.maxOpenRequestsPerMember });

  const [request] = await tx
    .insert(servicesRequests)
    .values({ requesterUserId: params.requesterUserId, ...input, createdAt: now, updatedAt: now })
    .returning({ id: servicesRequests.id });
  const id = request!.id;
  await chargeForAction(tx, { userId: params.requesterUserId, actionKey: 'services.publish_request', idempotencyKey: `services.request:${id}:publish`, relatedType: REQUEST, relatedId: id });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.requesterUserId,
    action: 'services.request_created',
    subjectType: REQUEST,
    subjectId: id,
    district: 'services',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { category: input.category, urgent: input.urgent },
  });

  // Urgent: everyone available today in the category, now. Otherwise one
  // quiet message a day per provider and category, however many requests.
  const providers = await matchingProviders(tx, { requestId: id, availableOnly: input.urgent, limit: input.urgent ? R.urgentNotifyLimit : R.newRequestNotifyLimit, now });
  const day = dayKey(now);
  await notify(
    tx,
    providers.map((userId) =>
      input.urgent
        ? {
            userId,
            category: 'services' as const,
            type: 'services.urgent_request',
            titleKey: 'notify.services.urgent',
            params: { title: input.title },
            href: `/services/requests/${id}`,
            dedupeKey: `services.urgent:${id}`,
            subjectId: id,
          }
        : {
            userId,
            category: 'services' as const,
            type: 'services.new_requests',
            titleKey: 'notify.services.new_requests',
            href: `/services?cat=${input.category}`,
            dedupeKey: `services.new:${input.category}:${day}`,
            subjectId: id,
          },
    ),
  );
  return id;
}

async function lockOwnRequest(tx: Executor, requestId: string, userId: string) {
  const [request] = await tx.select().from(servicesRequests).where(eq(servicesRequests.id, requestId)).limit(1).for('update');
  if (!request || request.requesterUserId !== userId || request.status === 'removed') throw errors.notFound('services_request');
  return request;
}

export async function respond(
  tx: Executor,
  params: { providerUserId: string; requestId: string; input: ResponseInput; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.providerUserId);
  const [request] = await tx.select().from(servicesRequests).where(eq(servicesRequests.id, params.requestId)).limit(1).for('update');
  if (!request || request.status === 'removed') throw errors.notFound('services_request');
  if (request.status !== 'open') throw errors.conflict('services.error.closed');
  if (request.requesterUserId === params.providerUserId) throw errors.validation('services.error.own');
  const [provider] = await tx.select().from(servicesProviderProfiles).where(eq(servicesProviderProfiles.userId, params.providerUserId)).limit(1);
  if (!provider) throw new DomainError('forbidden', 'services.error.need_profile');
  if (provider.status !== 'active') throw new DomainError('forbidden', 'services.error.provider_suspended');
  if (!provider.categories.includes(request.category)) throw new DomainError('forbidden', 'services.error.not_your_category');
  if (isRegulated(request.category) && (provider.licenceStatus === 'none' || provider.licenceStatus === 'rejected')) {
    throw new DomainError('forbidden', 'services.error.licence_required');
  }
  if (request.responseCount >= R.maxResponsesPerRequest) throw errors.conflict('services.error.full');

  const inserted = await tx
    .insert(servicesResponses)
    .values({ requestId: request.id, providerUserId: params.providerUserId, message: params.input.message, priceText: params.input.priceText })
    .onConflictDoNothing()
    .returning({ id: servicesResponses.id });
  if (inserted.length === 0) throw errors.conflict('services.error.already_responded');
  const id = inserted[0]!.id;
  await tx.update(servicesRequests).set({ responseCount: sql`${servicesRequests.responseCount} + 1`, updatedAt: new Date() }).where(eq(servicesRequests.id, request.id));
  await chargeForAction(tx, { userId: params.providerUserId, actionKey: 'services.respond', idempotencyKey: `services.response:${id}:send`, relatedType: REQUEST, relatedId: request.id });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.providerUserId,
    action: 'services.response_sent',
    subjectType: REQUEST,
    subjectId: request.id,
    district: 'services',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { responseId: id },
  });
  await notify(tx, [
    {
      userId: request.requesterUserId,
      category: 'services',
      type: 'services.response',
      titleKey: 'notify.services.response',
      params: { title: request.title },
      href: `/services/requests/${request.id}#responses`,
      dedupeKey: `services.response:${id}`,
      subjectId: request.id,
    },
  ]);
  return id;
}

/** The requester says who is doing it. Others' answers stay, but no new ones come. */
export async function acceptResponse(tx: Executor, params: { requesterUserId: string; requestId: string; responseId: string }): Promise<void> {
  const request = await lockOwnRequest(tx, params.requestId, params.requesterUserId);
  if (request.status !== 'open') throw errors.conflict('services.error.closed');
  const [response] = await tx
    .select()
    .from(servicesResponses)
    .where(and(eq(servicesResponses.id, params.responseId), eq(servicesResponses.requestId, request.id), eq(servicesResponses.status, 'sent')))
    .limit(1);
  if (!response) throw errors.notFound('services_response');
  await tx.update(servicesResponses).set({ status: 'accepted' }).where(eq(servicesResponses.id, response.id));
  await tx.update(servicesRequests).set({ status: 'in_progress', acceptedResponseId: response.id, updatedAt: new Date() }).where(eq(servicesRequests.id, request.id));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.requesterUserId,
    action: 'services.response_accepted',
    subjectType: REQUEST,
    subjectId: request.id,
    district: 'services',
    metadata: { responseId: response.id, providerUserId: response.providerUserId },
  });
  await notify(tx, [
    {
      userId: response.providerUserId,
      category: 'services',
      type: 'services.accepted',
      titleKey: 'notify.services.accepted',
      params: { title: request.title },
      href: `/services/requests/${request.id}`,
      dedupeKey: `services.accepted:${request.id}`,
      subjectId: request.id,
    },
  ]);
}

export async function completeRequest(tx: Executor, params: { requesterUserId: string; requestId: string }): Promise<void> {
  const request = await lockOwnRequest(tx, params.requestId, params.requesterUserId);
  if (request.status !== 'in_progress') throw errors.conflict('services.error.not_in_progress');
  await tx.update(servicesRequests).set({ status: 'completed', closedAt: new Date(), updatedAt: new Date() }).where(eq(servicesRequests.id, request.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.requesterUserId, action: 'services.request_completed', subjectType: REQUEST, subjectId: request.id, district: 'services' });
}

export async function cancelRequest(tx: Executor, params: { requesterUserId: string; requestId: string }): Promise<void> {
  const request = await lockOwnRequest(tx, params.requestId, params.requesterUserId);
  if (request.status !== 'open' && request.status !== 'in_progress') throw errors.conflict('services.error.closed');
  await tx.update(servicesRequests).set({ status: 'cancelled', closedAt: new Date(), updatedAt: new Date() }).where(eq(servicesRequests.id, request.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.requesterUserId, action: 'services.request_cancelled', subjectType: REQUEST, subjectId: request.id, district: 'services' });
}

/**
 * One review per completed job, from the person who asked, of the person
 * they chose. A good one (`positiveReviewStars`+) earns the provider the
 * `verified_positive_review` reputation rule — "verified" because it comes
 * from the job Yavaya saw being agreed and finished, not from anyone at all.
 */
export async function reviewProvider(
  tx: Executor,
  params: { reviewerUserId: string; requestId: string; rating: number; body: string | null },
): Promise<void> {
  const request = await lockOwnRequest(tx, params.requestId, params.reviewerUserId);
  if (request.status !== 'completed' || !request.acceptedResponseId) throw errors.conflict('services.error.not_completed');
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) throw errors.validation('services.error.rating');
  const body = params.body?.replace(/\s+/g, ' ').trim().slice(0, R.reviewMaxLength) || null;
  const [response] = await tx.select({ providerUserId: servicesResponses.providerUserId }).from(servicesResponses).where(eq(servicesResponses.id, request.acceptedResponseId)).limit(1);
  if (!response) throw errors.notFound('services_response');
  const inserted = await tx
    .insert(servicesReviews)
    .values({ requestId: request.id, providerUserId: response.providerUserId, reviewerUserId: params.reviewerUserId, rating: params.rating, body })
    .onConflictDoNothing()
    .returning({ requestId: servicesReviews.requestId });
  if (inserted.length === 0) throw errors.conflict('services.error.already_reviewed');
  if (params.rating >= R.positiveReviewStars) {
    await applyRule(tx, { userId: response.providerUserId, ruleKey: 'verified_positive_review', source: 'review', idempotencyKey: `services.review:${request.id}` });
  }
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reviewerUserId,
    action: 'services.provider_reviewed',
    subjectType: PROVIDER,
    subjectId: response.providerUserId,
    district: 'services',
    metadata: { requestId: request.id, rating: params.rating },
  });
  await notify(tx, [
    {
      userId: response.providerUserId,
      category: 'services',
      type: 'services.reviewed',
      titleKey: 'notify.services.reviewed',
      params: { stars: params.rating },
      href: '/services/provider',
      dedupeKey: `services.reviewed:${request.id}`,
      subjectId: request.id,
    },
  ]);
}

// --- Reports and review --------------------------------------------------------

export async function reportServices(
  tx: Executor,
  params: { reporterUserId: string; subject: 'request' | 'provider'; subjectId: string; category: ServicesReportCategory; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const subjectType = params.subject === 'request' ? REQUEST : PROVIDER;
  if (params.subject === 'request') {
    const [request] = await tx.select({ requesterUserId: servicesRequests.requesterUserId, status: servicesRequests.status }).from(servicesRequests).where(eq(servicesRequests.id, params.subjectId)).limit(1);
    if (!request || request.status === 'removed') throw errors.notFound('services_request');
    if (request.requesterUserId === params.reporterUserId) throw errors.validation('services.report.error.own');
  } else {
    const [provider] = await tx.select({ userId: servicesProviderProfiles.userId }).from(servicesProviderProfiles).where(eq(servicesProviderProfiles.userId, params.subjectId)).limit(1);
    if (!provider) throw errors.notFound('services_provider');
    if (provider.userId === params.reporterUserId) throw errors.validation('services.report.error.own');
  }
  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, subjectType), eq(reports.subjectId, params.subjectId), eq(reports.reporterUserId, params.reporterUserId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'fraud' || params.category === 'scam' || params.category === 'harassment' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType, subjectId: params.subjectId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType,
    subjectId: params.subjectId,
    district: 'services',
    category: params.category,
    description: params.description,
    evidence: [],
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: `services.${params.subject}_reported`,
    subjectType,
    subjectId: params.subjectId,
    district: 'services',
    metadata: { category: params.category, ticketId },
  });
  return { ticketCode: ticket!.code, duplicate: false };
}

export const LICENCE_DECISIONS = ['verify', 'reject'] as const;
export type LicenceDecision = (typeof LICENCE_DECISIONS)[number];

/** A reviewer confirms or rejects a stated licence. Nobody reviews their own. */
export async function reviewLicence(
  tx: Executor,
  params: { actor: AuthContext | null; providerUserId: string; decision: LicenceDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'services.review');
  if (actor.userId === params.providerUserId) throw errors.forbidden('services.review');
  const [provider] = await tx.select().from(servicesProviderProfiles).where(eq(servicesProviderProfiles.userId, params.providerUserId)).limit(1).for('update');
  if (!provider || !provider.licenceClaim) throw errors.notFound('services_provider');
  if (provider.licenceStatus !== 'pending') throw errors.conflict('services.error.licence_not_pending');
  if (params.decision === 'reject' && !params.note) throw errors.validation('services.error.review_note');
  const status = params.decision === 'verify' ? 'verified' : 'rejected';
  await tx
    .update(servicesProviderProfiles)
    .set({ licenceStatus: status, licenceNote: params.note, licenceReviewedBy: actor.userId, licenceReviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(servicesProviderProfiles.userId, provider.userId));
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `services.licence_${status}`,
    subjectType: PROVIDER,
    subjectId: provider.userId,
    district: 'services',
    metadata: { claim: provider.licenceClaim },
  });
  await notify(tx, [
    {
      userId: provider.userId,
      category: 'services',
      type: `services.licence_${status}`,
      titleKey: `notify.services.licence_${status}`,
      href: '/services/provider',
    },
  ]);
}

export const SERVICES_TICKET_DECISIONS = ['dismiss', 'remove_request', 'suspend_provider'] as const;
export type ServicesTicketDecision = (typeof SERVICES_TICKET_DECISIONS)[number];

export async function resolveServicesTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: ServicesTicketDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'services.review');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectType: tickets.subjectType, subjectId: tickets.subjectId, status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), inArray(tickets.subjectType, [REQUEST, PROVIDER])))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  if (params.decision !== 'dismiss' && !params.note) throw errors.validation('services.error.review_note');
  if (params.decision === 'remove_request' && ticket.subjectType !== REQUEST) throw errors.validation('services.error.decision');
  if (params.decision === 'suspend_provider' && ticket.subjectType !== PROVIDER) throw errors.validation('services.error.decision');

  let ownerUserId: string | null = null;
  if (ticket.subjectType === REQUEST) {
    const [request] = await tx.select({ requesterUserId: servicesRequests.requesterUserId, title: servicesRequests.title }).from(servicesRequests).where(eq(servicesRequests.id, ticket.subjectId)).limit(1).for('update');
    if (!request) throw errors.notFound('services_request');
    ownerUserId = request.requesterUserId;
    if (params.decision === 'remove_request') {
      await tx.update(servicesRequests).set({ status: 'removed', removedBy: actor.userId, closedAt: new Date(), updatedAt: new Date() }).where(eq(servicesRequests.id, ticket.subjectId));
    }
  } else {
    ownerUserId = ticket.subjectId;
    if (params.decision === 'suspend_provider') {
      await tx.update(servicesProviderProfiles).set({ status: 'suspended', availableUntil: null, updatedAt: new Date() }).where(eq(servicesProviderProfiles.userId, ticket.subjectId));
    }
  }
  if (ownerUserId === actor.userId) throw errors.forbidden('services.review');
  if (params.decision !== 'dismiss' && ownerUserId) {
    await notify(tx, [
      {
        userId: ownerUserId,
        category: 'moderation',
        type: `services.${params.decision}`,
        titleKey: params.decision === 'remove_request' ? 'notify.services.request_removed' : 'notify.services.provider_suspended',
        href: '/services/mine',
      },
    ]);
  }
  const actedOn = params.decision !== 'dismiss';
  await tx
    .update(tickets)
    .set({
      status: actedOn ? 'resolved' : 'rejected',
      resolutionSummary: actedOn ? 'moderation.resolution.removed' : 'moderation.resolution.no_action',
      assignedTo: actor.userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticket.id));
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `services_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.services_${params.decision}`,
    subjectType: ticket.subjectType,
    subjectId: ticket.subjectId,
    district: 'services',
    metadata: { ticketId: ticket.id },
  });
}

// --- Reading -----------------------------------------------------------------

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

export type ProviderSummary = {
  userId: string;
  displayName: string;
  yayId: string;
  headline: string;
  categories: string[];
  licenceStatus: 'none' | 'pending' | 'verified' | 'rejected';
  licenceClaim: string | null;
  reputation: number;
  reviewCount: number;
  averageRating: number | null;
  availableToday: boolean;
  placeName: string;
};

async function providerSummaries(executor: Executor, userIds: string[], locale: string, now = new Date()): Promise<Map<string, ProviderSummary>> {
  if (userIds.length === 0) return new Map();
  const rows = await executor
    .select({
      userId: servicesProviderProfiles.userId,
      headline: servicesProviderProfiles.headline,
      categories: servicesProviderProfiles.categories,
      licenceStatus: servicesProviderProfiles.licenceStatus,
      licenceClaim: servicesProviderProfiles.licenceClaim,
      availableUntil: servicesProviderProfiles.availableUntil,
      displayName: users.displayName,
      yayDigits: users.yayId,
      placeName: locations.name,
      placeNames: locations.names,
      reviewCount: sql<number>`(select count(*)::int from services_reviews r where r.provider_user_id = ${servicesProviderProfiles.userId})`,
      averageRating: sql<number | null>`(select round(avg(rating)::numeric, 1)::float from services_reviews r where r.provider_user_id = ${servicesProviderProfiles.userId})`,
    })
    .from(servicesProviderProfiles)
    .innerJoin(users, eq(users.id, servicesProviderProfiles.userId))
    .innerJoin(locations, eq(locations.id, servicesProviderProfiles.locationId))
    .where(inArray(servicesProviderProfiles.userId, userIds));
  const map = new Map<string, ProviderSummary>();
  for (const row of rows) {
    map.set(row.userId, {
      userId: row.userId,
      displayName: row.displayName,
      yayId: formatYayId(row.yayDigits),
      headline: row.headline,
      categories: row.categories,
      licenceStatus: row.licenceStatus,
      licenceClaim: row.licenceClaim,
      reputation: await getScore(executor, row.userId),
      reviewCount: row.reviewCount,
      averageRating: row.averageRating,
      availableToday: row.availableUntil !== null && row.availableUntil > now,
      placeName: localized(row.placeName, row.placeNames, locale),
    });
  }
  return map;
}

export type ProviderProfile = typeof servicesProviderProfiles.$inferSelect;

export async function getProviderProfile(executor: Executor, userId: string): Promise<ProviderProfile | null> {
  const [row] = await executor.select().from(servicesProviderProfiles).where(eq(servicesProviderProfiles.userId, userId)).limit(1);
  return row ?? null;
}

export type RequestCard = {
  id: string;
  category: ServiceCategoryKey;
  title: string;
  body: string;
  urgent: boolean;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'removed';
  placeName: string;
  requesterName: string | null;
  responseCount: number;
  createdAt: Date;
  isMine: boolean;
};

const requestColumns = {
  id: servicesRequests.id,
  category: servicesRequests.category,
  title: servicesRequests.title,
  body: servicesRequests.body,
  urgent: servicesRequests.urgent,
  anonymous: servicesRequests.anonymous,
  status: servicesRequests.status,
  requesterUserId: servicesRequests.requesterUserId,
  responseCount: servicesRequests.responseCount,
  acceptedResponseId: servicesRequests.acceptedResponseId,
  createdAt: servicesRequests.createdAt,
  locationId: servicesRequests.locationId,
  placeName: locations.name,
  placeNames: locations.names,
  requesterName: users.displayName,
};

type RequestRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  urgent: boolean;
  anonymous: boolean;
  status: RequestCard['status'];
  requesterUserId: string;
  responseCount: number;
  acceptedResponseId: string | null;
  createdAt: Date;
  locationId: string;
  placeName: string;
  placeNames: unknown;
  requesterName: string;
};

function toCard(row: RequestRow, viewerId: string, locale: string): RequestCard {
  const isMine = row.requesterUserId === viewerId;
  return {
    id: row.id,
    category: row.category as ServiceCategoryKey,
    title: row.title,
    body: row.body,
    urgent: row.urgent,
    status: row.status,
    placeName: localized(row.placeName, row.placeNames, locale),
    requesterName: row.anonymous && !isMine ? null : row.requesterName,
    responseCount: row.responseCount,
    createdAt: row.createdAt,
    isMine,
  };
}

/**
 * What a member may see of sensitive requests: their own, and those in the
 * categories they provide. Everyone else's mental-health request is not
 * theirs to read.
 */
function visibleTo(viewerId: string, providerCategories: string[]) {
  const sensitive = SERVICE_CATEGORY_KEYS.filter(isSensitive);
  return or(
    eq(servicesRequests.requesterUserId, viewerId),
    sensitive.length ? notInArray(servicesRequests.category, sensitive) : sql`true`,
    providerCategories.length ? inArray(servicesRequests.category, providerCategories) : sql`false`,
  )!;
}

/** The board: open requests, urgent first, then newest. */
export async function listBoard(
  executor: Executor,
  params: { viewerId: string; category?: ServiceCategoryKey; urgentOnly?: boolean; page?: number; locale: string },
): Promise<{ items: RequestCard[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const provider = await getProviderProfile(executor, params.viewerId);
  const conditions = [eq(servicesRequests.status, 'open'), visibleTo(params.viewerId, provider?.status === 'active' ? provider.categories : [])];
  if (params.category) conditions.push(eq(servicesRequests.category, params.category));
  if (params.urgentOnly) conditions.push(eq(servicesRequests.urgent, true));
  const rows = await executor
    .select(requestColumns)
    .from(servicesRequests)
    .innerJoin(users, eq(users.id, servicesRequests.requesterUserId))
    .innerJoin(locations, eq(locations.id, servicesRequests.locationId))
    .where(and(...conditions))
    .orderBy(desc(servicesRequests.urgent), desc(servicesRequests.createdAt))
    .limit(R.pageSize + 1)
    .offset((page - 1) * R.pageSize);
  return { items: rows.slice(0, R.pageSize).map((row) => toCard(row, params.viewerId, params.locale)), hasMore: rows.length > R.pageSize, page };
}

export type ResponseView = {
  id: string;
  message: string;
  priceText: string | null;
  status: 'sent' | 'accepted' | 'withdrawn' | 'removed';
  createdAt: Date;
  provider: ProviderSummary | null;
  /** Shown to the requester only: the provider chose to answer, which is consent to be contacted. */
  whatsappE164: string | null;
};

export type RequestDetail = {
  request: RequestCard & { acceptedResponseId: string | null; canRespond: boolean; cannotRespondReason: string | null };
  responses: ResponseView[];
  review: { rating: number; body: string | null } | null;
};

export async function getRequest(
  executor: Executor,
  params: { requestId: string; viewerId: string; viewerIsModerator: boolean; locale: string },
): Promise<RequestDetail | null> {
  const [row] = await executor
    .select(requestColumns)
    .from(servicesRequests)
    .innerJoin(users, eq(users.id, servicesRequests.requesterUserId))
    .innerJoin(locations, eq(locations.id, servicesRequests.locationId))
    .where(eq(servicesRequests.id, params.requestId))
    .limit(1);
  if (!row) return null;
  const isMine = row.requesterUserId === params.viewerId;
  const provider = await getProviderProfile(executor, params.viewerId);
  const providesIt = provider?.status === 'active' && provider.categories.includes(row.category);
  if (row.status === 'removed' && !isMine && !params.viewerIsModerator) return null;
  if (isSensitive(row.category) && !isMine && !providesIt && !params.viewerIsModerator) return null;

  const responseRows = await executor
    .select({
      id: servicesResponses.id,
      message: servicesResponses.message,
      priceText: servicesResponses.priceText,
      status: servicesResponses.status,
      createdAt: servicesResponses.createdAt,
      providerUserId: servicesResponses.providerUserId,
      whatsappE164: servicesProviderProfiles.whatsappE164,
    })
    .from(servicesResponses)
    .innerJoin(servicesProviderProfiles, eq(servicesProviderProfiles.userId, servicesResponses.providerUserId))
    .where(
      and(
        eq(servicesResponses.requestId, row.id),
        // The requester sees every answer; a provider sees only their own.
        isMine || params.viewerIsModerator ? sql`true` : eq(servicesResponses.providerUserId, params.viewerId),
      ),
    )
    .orderBy(desc(sql`${servicesResponses.status} = 'accepted'`), servicesResponses.createdAt);
  const summaries = await providerSummaries(executor, responseRows.map((r) => r.providerUserId), params.locale);
  const responses = responseRows
    .filter((r) => r.status !== 'removed' || params.viewerIsModerator)
    .map((r) => ({
      id: r.id,
      message: r.message,
      priceText: r.priceText,
      status: r.status,
      createdAt: r.createdAt,
      provider: summaries.get(r.providerUserId) ?? null,
      whatsappE164: isMine ? r.whatsappE164 : null,
    }));

  let cannotRespondReason: string | null = null;
  if (isMine) cannotRespondReason = 'services.error.own';
  else if (row.status !== 'open') cannotRespondReason = 'services.error.closed';
  else if (!provider) cannotRespondReason = 'services.error.need_profile';
  else if (provider.status !== 'active') cannotRespondReason = 'services.error.provider_suspended';
  else if (!provider.categories.includes(row.category)) cannotRespondReason = 'services.error.not_your_category';
  else if (isRegulated(row.category) && (provider.licenceStatus === 'none' || provider.licenceStatus === 'rejected')) cannotRespondReason = 'services.error.licence_required';
  else if (responseRows.some((r) => r.providerUserId === params.viewerId)) cannotRespondReason = 'services.error.already_responded';
  else if (row.responseCount >= R.maxResponsesPerRequest) cannotRespondReason = 'services.error.full';

  const [review] = await executor.select({ rating: servicesReviews.rating, body: servicesReviews.body }).from(servicesReviews).where(eq(servicesReviews.requestId, row.id)).limit(1);
  return {
    request: { ...toCard(row, params.viewerId, params.locale), acceptedResponseId: row.acceptedResponseId, canRespond: cannotRespondReason === null, cannotRespondReason },
    responses,
    review: review ?? null,
  };
}

export async function myRequests(executor: Executor, params: { userId: string; locale: string }): Promise<RequestCard[]> {
  const rows = await executor
    .select(requestColumns)
    .from(servicesRequests)
    .innerJoin(users, eq(users.id, servicesRequests.requesterUserId))
    .innerJoin(locations, eq(locations.id, servicesRequests.locationId))
    .where(eq(servicesRequests.requesterUserId, params.userId))
    .orderBy(desc(servicesRequests.createdAt))
    .limit(50);
  return rows.map((row) => toCard(row, params.userId, params.locale));
}

export async function myResponses(executor: Executor, params: { userId: string; locale: string }): Promise<Array<RequestCard & { responseStatus: string }>> {
  const rows = await executor
    .select({ ...requestColumns, responseStatus: servicesResponses.status })
    .from(servicesResponses)
    .innerJoin(servicesRequests, eq(servicesRequests.id, servicesResponses.requestId))
    .innerJoin(users, eq(users.id, servicesRequests.requesterUserId))
    .innerJoin(locations, eq(locations.id, servicesRequests.locationId))
    .where(and(eq(servicesResponses.providerUserId, params.userId), sql`${servicesRequests.status} <> 'removed'`))
    .orderBy(desc(servicesResponses.createdAt))
    .limit(50);
  return rows.map((row) => ({ ...toCard(row, params.userId, params.locale), responseStatus: row.responseStatus }));
}

export async function providerPage(
  executor: Executor,
  /** The stored 8-digit form, as `parseYayId` returns it. */
  params: { yayDigits: string; locale: string },
): Promise<{ summary: ProviderSummary; bio: string; reviews: Array<{ rating: number; body: string | null; createdAt: Date }> } | null> {
  const [user] = await executor.select({ id: users.id }).from(users).where(eq(users.yayId, params.yayDigits)).limit(1);
  if (!user) return null;
  const profile = await getProviderProfile(executor, user.id);
  if (!profile || profile.status !== 'active') return null;
  const summary = (await providerSummaries(executor, [user.id], params.locale)).get(user.id);
  if (!summary) return null;
  const reviews = await executor
    .select({ rating: servicesReviews.rating, body: servicesReviews.body, createdAt: servicesReviews.createdAt })
    .from(servicesReviews)
    .where(eq(servicesReviews.providerUserId, user.id))
    .orderBy(desc(servicesReviews.createdAt))
    .limit(20);
  return { summary, bio: profile.bio, reviews };
}

/** Licences waiting for a reviewer, and open reports. `services.review` only. */
export async function servicesReviewQueue(executor: Executor, actor: AuthContext | null, locale: string) {
  await requirePermission(executor, actor, 'services.review');
  const pending = await executor
    .select({ userId: servicesProviderProfiles.userId })
    .from(servicesProviderProfiles)
    .where(eq(servicesProviderProfiles.licenceStatus, 'pending'))
    .orderBy(servicesProviderProfiles.updatedAt)
    .limit(100);
  const licences = await providerSummaries(executor, pending.map((row) => row.userId), locale);
  const open = await executor
    .select({ ticketId: tickets.id, code: tickets.code, priority: tickets.priority, subjectType: tickets.subjectType, subjectId: tickets.subjectId })
    .from(tickets)
    .where(and(inArray(tickets.subjectType, [REQUEST, PROVIDER]), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = open.map((ticket) => ticket.ticketId);
  const reported = ids.length ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description }).from(reports).where(inArray(reports.ticketId, ids)) : [];
  const requestIds = open.filter((t) => t.subjectType === REQUEST).map((t) => t.subjectId);
  const titles = requestIds.length ? await executor.select({ id: servicesRequests.id, title: servicesRequests.title }).from(servicesRequests).where(inArray(servicesRequests.id, requestIds)) : [];
  const providerIds = open.filter((t) => t.subjectType === PROVIDER).map((t) => t.subjectId);
  const providers = await providerSummaries(executor, providerIds, locale);
  return {
    licences: pending.map((row) => licences.get(row.userId)).filter((value): value is ProviderSummary => Boolean(value)),
    reports: open.map((ticket) => ({
      ...ticket,
      kind: ticket.subjectType === REQUEST ? ('request' as const) : ('provider' as const),
      label: ticket.subjectType === REQUEST ? (titles.find((t) => t.id === ticket.subjectId)?.title ?? '—') : (providers.get(ticket.subjectId)?.displayName ?? '—'),
      providerYayId: ticket.subjectType === PROVIDER ? (providers.get(ticket.subjectId)?.yayId ?? null) : null,
      reports: reported.filter((r) => r.ticketId === ticket.ticketId),
    })),
  };
}
