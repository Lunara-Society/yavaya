import 'server-only';
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '@/server/db/client';
import {
  locations,
  moderationActions,
  reports,
  sanctuaryChurches,
  sanctuaryDevotionals,
  sanctuaryFollows,
  sanctuaryServices,
  tickets,
  users,
} from '@/server/db/schema';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { chargeForAction } from '@/server/domains/tokens/service';
import { hasPermission, requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { notify } from '@/server/domains/notifications/service';

/**
 * Sanctuary: a space of faith inside Community.
 *
 * Yavaya writes none of its words. A member registers their church; a
 * person with `sanctuary.review` approves it; only then does it appear, and
 * only then may it publish its prayer and guidance for the day. Everything
 * here is free, declared billable at zero so the ledger stays silent.
 *
 * A change to what identifies a church — its name, place, broadcast link or
 * WhatsApp number — sends it back for review. Otherwise a church approved as
 * one thing could quietly become another, with its approval still attached.
 */

const SUBJECT = 'sanctuary_church';
type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const REVIEW_DECISIONS = ['approve', 'reject', 'suspend'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const SANCTUARY_REPORT_CATEGORIES = ['fraud', 'scam', 'harassment', 'spam', 'other'] as const;
export type SanctuaryReportCategory = (typeof SANCTUARY_REPORT_CATEGORIES)[number];

const R = SANCTUARY_RULES;
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

/** Only an https address on a real host. Shown as a link out, never embedded. */
export function normalizeStreamUrl(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export const churchInputSchema = z.object({
  name: text(R.nameMinLength, R.nameMaxLength, 'sanctuary.error.name'),
  denomination: optionalText(R.denominationMaxLength, 'sanctuary.error.denomination'),
  description: text(R.descriptionMinLength, R.descriptionMaxLength, 'sanctuary.error.description'),
  locationId: z.string().uuid({ message: 'sanctuary.error.location' }),
  address: optionalText(R.addressMaxLength, 'sanctuary.error.address'),
  whatsapp: z
    .string()
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const phone = normalizeWhatsapp(value);
      if (!phone) ctx.addIssue({ code: 'custom', message: 'sanctuary.error.whatsapp' });
      return phone;
    }),
  streamUrl: z.string().transform((value, ctx) => {
    const url = normalizeStreamUrl(value);
    if (url === undefined) ctx.addIssue({ code: 'custom', message: 'sanctuary.error.stream' });
    return url ?? null;
  }),
});
export type ChurchInput = z.output<typeof churchInputSchema>;

export const serviceInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'sanctuary.error.service_time' }),
  title: text(2, R.serviceTitleMaxLength, 'sanctuary.error.service_title'),
});
export type ServiceInput = z.output<typeof serviceInputSchema>;

export const devotionalInputSchema = z.object({
  forDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'sanctuary.error.date' }),
  title: text(R.devotionalTitleMinLength, R.devotionalTitleMaxLength, 'sanctuary.error.devotional_title'),
  scripture: optionalText(R.scriptureMaxLength, 'sanctuary.error.scripture'),
  body: text(R.devotionalBodyMinLength, R.devotionalBodyMaxLength, 'sanctuary.error.devotional_body'),
});
export type DevotionalInput = z.output<typeof devotionalInputSchema>;

// --- Time --------------------------------------------------------------------

/** The church's own timezone: the nearest place in its path that has one. */
const churchTimezone = sql<string | null>`(
  select l2.timezone from locations l2
  where l2.code = any(${locations.path} || array[${locations.code}]) and l2.timezone is not null
  order by l2.depth desc limit 1
)`;

/** Today's date (YYYY-MM-DD) where the church is. */
export function localDate(timezone: string | null, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekday and minutes since midnight, where the church is. */
function localClock(timezone: string | null, now = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone ?? 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** The next service from now, in the church's own time; null when it lists none. */
export function nextService<T extends { weekday: number; startTime: string }>(services: T[], timezone: string | null, now = new Date()): (T & { inDays: number }) | null {
  if (services.length === 0) return null;
  const clock = localClock(timezone, now);
  let best: (T & { inDays: number }) | null = null;
  let bestDistance = Infinity;
  for (const service of services) {
    const [h, m] = service.startTime.split(':').map(Number);
    const start = h! * 60 + m!;
    let days = (service.weekday - clock.weekday + 7) % 7;
    if (days === 0 && start < clock.minutes) days = 7;
    const distance = days * 1440 + start - clock.minutes;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { ...service, inDays: days };
    }
  }
  return best;
}

// --- Writing -----------------------------------------------------------------

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'sanctuary.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'sanctuary.error.account_restricted');
}

async function assertActivePlace(executor: Executor, locationId: string): Promise<void> {
  const [place] = await executor.select({ active: locations.isActive }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place?.active) throw errors.validation('sanctuary.error.location');
}

async function ownedChurch(tx: Executor, churchId: string, userId: string) {
  const [church] = await tx.select().from(sanctuaryChurches).where(eq(sanctuaryChurches.id, churchId)).limit(1).for('update');
  if (!church) throw errors.notFound('sanctuary_church');
  if (church.ownerUserId !== userId) throw errors.forbidden();
  return church;
}

export async function registerChurch(
  tx: Executor,
  params: { ownerUserId: string; input: ChurchInput; services: ServiceInput[]; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.ownerUserId);
  await assertActivePlace(tx, params.input.locationId);
  if (params.services.length > R.maxServicesPerChurch) throw errors.validation('sanctuary.error.too_many_services');

  // Rejected churches don't count: their owner may try again, properly.
  const [owned] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(sanctuaryChurches)
    .where(and(eq(sanctuaryChurches.ownerUserId, params.ownerUserId), ne(sanctuaryChurches.status, 'rejected')));
  if ((owned?.count ?? 0) >= R.maxChurchesPerOwner) throw errors.conflict('sanctuary.error.church_limit', { limit: R.maxChurchesPerOwner });

  const { input } = params;
  const [church] = await tx
    .insert(sanctuaryChurches)
    .values({
      ownerUserId: params.ownerUserId,
      name: input.name,
      denomination: input.denomination,
      description: input.description,
      locationId: input.locationId,
      address: input.address,
      whatsappE164: input.whatsapp,
      streamUrl: input.streamUrl,
    })
    .returning({ id: sanctuaryChurches.id });
  const churchId = church!.id;
  if (params.services.length > 0) {
    await tx.insert(sanctuaryServices).values(params.services.map((service) => ({ churchId, ...service })));
  }

  await chargeForAction(tx, {
    userId: params.ownerUserId,
    actionKey: 'sanctuary.register_church',
    idempotencyKey: `sanctuary.church:${churchId}:register`,
    relatedType: SUBJECT,
    relatedId: churchId,
  });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.ownerUserId,
    action: 'sanctuary.church_registered',
    subjectType: SUBJECT,
    subjectId: churchId,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
  return churchId;
}

/** Edits a church and its service times. Identity changes return it to review. */
export async function updateChurch(
  tx: Executor,
  params: { actorUserId: string; churchId: string; input: ChurchInput; services: ServiceInput[]; audit?: AuditContext },
): Promise<{ reReview: boolean }> {
  await activeMember(tx, params.actorUserId);
  const church = await ownedChurch(tx, params.churchId, params.actorUserId);
  if (church.status === 'suspended') throw errors.conflict('sanctuary.error.suspended');
  await assertActivePlace(tx, params.input.locationId);
  if (params.services.length > R.maxServicesPerChurch) throw errors.validation('sanctuary.error.too_many_services');

  const { input } = params;
  const identityChanged =
    church.name !== input.name ||
    church.locationId !== input.locationId ||
    (church.streamUrl ?? null) !== input.streamUrl ||
    (church.whatsappE164 ?? null) !== input.whatsapp ||
    (church.denomination ?? null) !== input.denomination;
  const reReview = identityChanged && church.status === 'approved';
  // A rejected church that is corrected goes back to the queue too.
  const nextStatus = church.status === 'rejected' || reReview ? 'pending' : church.status;

  await tx
    .update(sanctuaryChurches)
    .set({
      name: input.name,
      denomination: input.denomination,
      description: input.description,
      locationId: input.locationId,
      address: input.address,
      whatsappE164: input.whatsapp,
      streamUrl: input.streamUrl,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(sanctuaryChurches.id, church.id));
  await tx.delete(sanctuaryServices).where(eq(sanctuaryServices.churchId, church.id));
  if (params.services.length > 0) {
    await tx.insert(sanctuaryServices).values(params.services.map((service) => ({ churchId: church.id, ...service })));
  }

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.actorUserId,
    action: 'sanctuary.church_updated',
    subjectType: SUBJECT,
    subjectId: church.id,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { identityChanged, status: nextStatus },
  });
  return { reReview: nextStatus === 'pending' && church.status !== 'pending' };
}

export async function reviewChurch(
  tx: Executor,
  params: { actor: AuthContext | null; churchId: string; decision: ReviewDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'sanctuary.review');
  const [church] = await tx.select().from(sanctuaryChurches).where(eq(sanctuaryChurches.id, params.churchId)).limit(1).for('update');
  if (!church) throw errors.notFound('sanctuary_church');
  // Nobody approves their own church.
  if (church.ownerUserId === actor.userId) throw errors.forbidden('sanctuary.review');
  if (params.decision === 'suspend' && church.status !== 'approved') throw errors.conflict('sanctuary.error.not_approved');
  if (params.decision !== 'suspend' && church.status !== 'pending') throw errors.conflict('sanctuary.error.not_pending');
  if (params.decision !== 'approve' && !params.note) throw errors.validation('sanctuary.error.review_note');

  const status = params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'suspended';
  await tx
    .update(sanctuaryChurches)
    .set({ status, reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(sanctuaryChurches.id, church.id));
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `sanctuary.church_${status}`,
    subjectType: SUBJECT,
    subjectId: church.id,
    district: 'community',
    metadata: { ownerUserId: church.ownerUserId },
  });
  await notify(tx, [
    {
      userId: church.ownerUserId,
      category: 'sanctuary',
      type: `sanctuary.church_${status}`,
      titleKey: `notify.sanctuary.church_${status}`,
      params: { church: church.name },
      href: `/sanctuary/manage/${church.id}`,
    },
  ]);
}

export async function publishDevotional(
  tx: Executor,
  params: { actorUserId: string; churchId: string; input: DevotionalInput; now?: Date; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.actorUserId);
  const church = await ownedChurch(tx, params.churchId, params.actorUserId);
  if (church.status !== 'approved') throw errors.conflict('sanctuary.error.not_approved');

  const [place] = await tx.select({ timezone: churchTimezone }).from(locations).where(eq(locations.id, church.locationId)).limit(1);
  const today = localDate(place?.timezone ?? null, params.now);
  const { forDate } = params.input;
  if (forDate < addDays(today, -R.devotionalDaysBack) || forDate > addDays(today, R.devotionalDaysAhead)) {
    throw errors.validation('sanctuary.error.date_range', { back: R.devotionalDaysBack, ahead: R.devotionalDaysAhead });
  }
  const [sameDay] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(sanctuaryDevotionals)
    .where(and(eq(sanctuaryDevotionals.churchId, church.id), eq(sanctuaryDevotionals.forDate, forDate), eq(sanctuaryDevotionals.status, 'published')));
  if ((sameDay?.count ?? 0) >= R.maxDevotionalsPerChurchPerDay) {
    throw errors.conflict('sanctuary.error.devotional_limit', { limit: R.maxDevotionalsPerChurchPerDay });
  }

  const [devotional] = await tx
    .insert(sanctuaryDevotionals)
    .values({ churchId: church.id, authorUserId: params.actorUserId, ...params.input })
    .returning({ id: sanctuaryDevotionals.id });
  const id = devotional!.id;
  await chargeForAction(tx, {
    userId: params.actorUserId,
    actionKey: 'sanctuary.publish_devotional',
    idempotencyKey: `sanctuary.devotional:${id}:publish`,
    relatedType: 'sanctuary_devotional',
    relatedId: id,
  });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.actorUserId,
    action: 'sanctuary.devotional_published',
    subjectType: 'sanctuary_devotional',
    subjectId: id,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { churchId: church.id, forDate },
  });
  // Followers hear of it when it can be read: a word prepared for next
  // Sunday is not news today. (Delivery on its day is not built yet.)
  if (forDate === today) {
    const followers = await tx.select({ userId: sanctuaryFollows.userId }).from(sanctuaryFollows).where(eq(sanctuaryFollows.churchId, church.id));
    await notify(
      tx,
      followers
        .filter((row) => row.userId !== params.actorUserId)
        .map((row) => ({
          userId: row.userId,
          category: 'sanctuary' as const,
          type: 'sanctuary.word_published',
          titleKey: 'notify.sanctuary.word',
          params: { church: church.name, title: params.input.title },
          href: `/sanctuary/words/${id}`,
          dedupeKey: `sanctuary.word:${church.id}:${forDate}`,
          subjectId: id,
        })),
    );
  }
  return id;
}

/** The church's owner withdraws its words, or a moderator removes them. */
export async function removeDevotional(tx: Executor, params: { actorUserId: string; devotionalId: string; note?: string | null }): Promise<void> {
  const [row] = await tx
    .select({ id: sanctuaryDevotionals.id, status: sanctuaryDevotionals.status, ownerUserId: sanctuaryChurches.ownerUserId, churchId: sanctuaryChurches.id })
    .from(sanctuaryDevotionals)
    .innerJoin(sanctuaryChurches, eq(sanctuaryChurches.id, sanctuaryDevotionals.churchId))
    .where(eq(sanctuaryDevotionals.id, params.devotionalId))
    .limit(1)
    .for('update');
  if (!row || row.status !== 'published') throw errors.notFound('sanctuary_devotional');
  const isOwner = row.ownerUserId === params.actorUserId;
  if (!isOwner && !(await hasPermission(tx, params.actorUserId, 'moderation.content.remove'))) throw errors.forbidden('moderation.content.remove');

  await tx.update(sanctuaryDevotionals).set({ status: 'removed', removedBy: params.actorUserId }).where(eq(sanctuaryDevotionals.id, row.id));
  await recordAudit(tx, {
    actorType: isOwner ? 'user' : 'admin',
    actorUserId: params.actorUserId,
    action: isOwner ? 'sanctuary.devotional_withdrawn' : 'sanctuary.devotional_removed',
    subjectType: 'sanctuary_devotional',
    subjectId: row.id,
    district: 'community',
    metadata: { churchId: row.churchId, note: params.note ?? null },
  });
}

/** Follow or unfollow an approved church. Returns whether the member now follows it. */
export async function toggleFollow(tx: Executor, params: { userId: string; churchId: string }): Promise<boolean> {
  await activeMember(tx, params.userId);
  const [church] = await tx.select({ status: sanctuaryChurches.status }).from(sanctuaryChurches).where(eq(sanctuaryChurches.id, params.churchId)).limit(1);
  if (!church || church.status !== 'approved') throw errors.notFound('sanctuary_church');
  const removed = await tx
    .delete(sanctuaryFollows)
    .where(and(eq(sanctuaryFollows.churchId, params.churchId), eq(sanctuaryFollows.userId, params.userId)))
    .returning({ churchId: sanctuaryFollows.churchId });
  if (removed.length > 0) return false;
  await tx.insert(sanctuaryFollows).values({ churchId: params.churchId, userId: params.userId }).onConflictDoNothing();
  return true;
}

export async function reportChurch(
  tx: Executor,
  params: { churchId: string; reporterUserId: string; category: SanctuaryReportCategory; description: string | null; devotionalId?: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const [church] = await tx.select({ ownerUserId: sanctuaryChurches.ownerUserId, status: sanctuaryChurches.status }).from(sanctuaryChurches).where(eq(sanctuaryChurches.id, params.churchId)).limit(1);
  if (!church || church.status !== 'approved') throw errors.notFound('sanctuary_church');
  if (church.ownerUserId === params.reporterUserId) throw errors.validation('sanctuary.report.error.own');

  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, SUBJECT), eq(reports.subjectId, params.churchId), eq(reports.reporterUserId, params.reporterUserId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'fraud' || params.category === 'scam' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: SUBJECT, subjectId: params.churchId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType: SUBJECT,
    subjectId: params.churchId,
    district: 'community',
    category: params.category,
    description: params.description,
    evidence: params.devotionalId ? [{ type: 'sanctuary_devotional', ref: params.devotionalId }] : [],
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: 'sanctuary.church_reported',
    subjectType: SUBJECT,
    subjectId: params.churchId,
    district: 'community',
    metadata: { category: params.category, ticketId, devotional: params.devotionalId ?? null },
  });
  return { ticketCode: ticket!.code, duplicate: false };
}

export const REPORT_DECISIONS = ['dismiss', 'remove_devotionals', 'suspend_church'] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export async function resolveSanctuaryTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: ReportDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'sanctuary.review');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT)))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  const [church] = await tx.select({ id: sanctuaryChurches.id, name: sanctuaryChurches.name, ownerUserId: sanctuaryChurches.ownerUserId, status: sanctuaryChurches.status }).from(sanctuaryChurches).where(eq(sanctuaryChurches.id, ticket.subjectId)).limit(1).for('update');
  if (!church) throw errors.notFound('sanctuary_church');
  if (church.ownerUserId === actor.userId) throw errors.forbidden('sanctuary.review');
  if (params.decision !== 'dismiss' && !params.note) throw errors.validation('sanctuary.error.review_note');

  if (params.decision === 'remove_devotionals') {
    const reported = await tx.select({ evidence: reports.evidence }).from(reports).where(eq(reports.ticketId, ticket.id));
    const ids = reported.flatMap((row) => row.evidence.filter((item) => item.type === 'sanctuary_devotional').map((item) => item.ref));
    if (ids.length > 0) {
      await tx
        .update(sanctuaryDevotionals)
        .set({ status: 'removed', removedBy: actor.userId })
        .where(and(inArray(sanctuaryDevotionals.id, ids), eq(sanctuaryDevotionals.churchId, church.id), eq(sanctuaryDevotionals.status, 'published')));
    }
  }
  if (params.decision === 'suspend_church' && church.status === 'approved') {
    await tx
      .update(sanctuaryChurches)
      .set({ status: 'suspended', reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(sanctuaryChurches.id, church.id));
  }
  if (params.decision !== 'dismiss') {
    await notify(tx, [
      {
        userId: church.ownerUserId,
        category: 'moderation',
        type: `sanctuary.${params.decision}`,
        titleKey: params.decision === 'suspend_church' ? 'notify.sanctuary.church_suspended' : 'notify.moderation.words_removed',
        params: { church: church.name },
        href: `/sanctuary/manage/${church.id}`,
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
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `sanctuary_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.sanctuary_${params.decision}`,
    subjectType: SUBJECT,
    subjectId: church.id,
    district: 'community',
    metadata: { ticketId: ticket.id },
  });
}

// --- Reading -----------------------------------------------------------------

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

export type ChurchCard = {
  id: string;
  name: string;
  denomination: string | null;
  placeName: string;
  status: string;
  timezone: string | null;
  next: { weekday: number; startTime: string; title: string; inDays: number } | null;
};

export type ChurchDetail = ChurchCard & {
  description: string;
  address: string | null;
  whatsappE164: string | null;
  streamUrl: string | null;
  ownerUserId: string;
  reviewNote: string | null;
  services: Array<{ weekday: number; startTime: string; title: string }>;
  followerCount: number;
  followedByViewer: boolean;
};

export type DevotionalView = {
  id: string;
  forDate: string;
  title: string;
  scripture: string | null;
  body: string;
  church: { id: string; name: string; placeName: string };
  isToday: boolean;
};

const churchColumns = {
  id: sanctuaryChurches.id,
  name: sanctuaryChurches.name,
  denomination: sanctuaryChurches.denomination,
  status: sanctuaryChurches.status,
  placeName: locations.name,
  placeNames: locations.names,
  timezone: churchTimezone,
};

async function servicesFor(executor: Executor, churchIds: string[]) {
  if (churchIds.length === 0) return [];
  return executor
    .select({ churchId: sanctuaryServices.churchId, weekday: sanctuaryServices.weekday, startTime: sanctuaryServices.startTime, title: sanctuaryServices.title })
    .from(sanctuaryServices)
    .where(inArray(sanctuaryServices.churchId, churchIds))
    .orderBy(sanctuaryServices.weekday, sanctuaryServices.startTime);
}

function toCards(rows: Array<{ [K in keyof typeof churchColumns]: unknown }>, services: Awaited<ReturnType<typeof servicesFor>>, locale: string, now: Date): ChurchCard[] {
  return rows.map((row) => {
    const own = services.filter((service) => service.churchId === row.id);
    return {
      id: row.id as string,
      name: row.name as string,
      denomination: row.denomination as string | null,
      placeName: localized(row.placeName as string, row.placeNames, locale),
      status: row.status as string,
      timezone: row.timezone as string | null,
      next: nextService(own, row.timezone as string | null, now),
    };
  });
}

/** Approved churches, optionally within a place (its code or any ancestor's). */
export async function listChurches(executor: Executor, params: { locale: string; placeCode?: string; query?: string; now?: Date }): Promise<ChurchCard[]> {
  const filters = [eq(sanctuaryChurches.status, 'approved')];
  if (params.placeCode) filters.push(sql`(${locations.code} = ${params.placeCode} or ${params.placeCode} = any(${locations.path}))`);
  if (params.query) {
    const pattern = `%${params.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(sql`(${sanctuaryChurches.name} ilike ${pattern} or ${sanctuaryChurches.denomination} ilike ${pattern})`);
  }
  const rows = await executor
    .select(churchColumns)
    .from(sanctuaryChurches)
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(and(...filters))
    .orderBy(sanctuaryChurches.name)
    .limit(200);
  return toCards(rows, await servicesFor(executor, rows.map((row) => row.id)), params.locale, params.now ?? new Date());
}

/** The churches a member follows, each with its next service. */
export async function followedChurches(executor: Executor, params: { userId: string; locale: string; now?: Date }): Promise<ChurchCard[]> {
  const rows = await executor
    .select(churchColumns)
    .from(sanctuaryFollows)
    .innerJoin(sanctuaryChurches, eq(sanctuaryChurches.id, sanctuaryFollows.churchId))
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(and(eq(sanctuaryFollows.userId, params.userId), eq(sanctuaryChurches.status, 'approved')))
    .orderBy(sanctuaryChurches.name);
  return toCards(rows, await servicesFor(executor, rows.map((row) => row.id)), params.locale, params.now ?? new Date());
}

/** The churches a member registered, in any state. */
export async function ownedChurches(executor: Executor, params: { userId: string; locale: string }): Promise<ChurchCard[]> {
  const rows = await executor
    .select(churchColumns)
    .from(sanctuaryChurches)
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(eq(sanctuaryChurches.ownerUserId, params.userId))
    .orderBy(desc(sanctuaryChurches.createdAt));
  return toCards(rows, await servicesFor(executor, rows.map((row) => row.id)), params.locale, new Date());
}

/**
 * One church. Anyone sees an approved church; its owner and reviewers also
 * see it pending, rejected or suspended — everyone else gets nothing.
 */
export async function getChurch(executor: Executor, params: { churchId: string; viewerId: string | null; locale: string; now?: Date }): Promise<ChurchDetail | null> {
  const [row] = await executor
    .select({
      ...churchColumns,
      description: sanctuaryChurches.description,
      address: sanctuaryChurches.address,
      whatsappE164: sanctuaryChurches.whatsappE164,
      streamUrl: sanctuaryChurches.streamUrl,
      ownerUserId: sanctuaryChurches.ownerUserId,
      reviewNote: sanctuaryChurches.reviewNote,
      followerCount: sql<number>`(select count(*)::int from sanctuary_follows f where f.church_id = ${sanctuaryChurches.id})`,
    })
    .from(sanctuaryChurches)
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(eq(sanctuaryChurches.id, params.churchId))
    .limit(1);
  if (!row) return null;
  const isOwner = row.ownerUserId === params.viewerId;
  if (row.status !== 'approved' && !isOwner && !(params.viewerId && (await hasPermission(executor, params.viewerId, 'sanctuary.review')))) return null;

  const services = await servicesFor(executor, [row.id]);
  const [card] = toCards([row], services, params.locale, params.now ?? new Date());
  const followed = params.viewerId
    ? await executor.select({ churchId: sanctuaryFollows.churchId }).from(sanctuaryFollows).where(and(eq(sanctuaryFollows.churchId, row.id), eq(sanctuaryFollows.userId, params.viewerId))).limit(1)
    : [];
  return {
    ...card!,
    description: row.description,
    address: row.address,
    whatsappE164: row.whatsappE164,
    streamUrl: row.streamUrl,
    ownerUserId: row.ownerUserId,
    // The reviewer's reason is for the owner, not the public.
    reviewNote: isOwner ? row.reviewNote : null,
    services: services.map(({ weekday, startTime, title }) => ({ weekday, startTime, title })),
    followerCount: row.followerCount,
    followedByViewer: followed.length > 0,
  };
}

/**
 * Prayer and words from approved churches, newest day first. A church's
 * words appear once their day has arrived where the church is: nothing
 * prepared for next Sunday shows on Thursday.
 */
export async function listDevotionals(
  executor: Executor,
  params: { locale: string; churchId?: string; followedBy?: string; limit?: number; now?: Date; includeFuture?: boolean },
): Promise<DevotionalView[]> {
  const now = params.now ?? new Date();
  const filters = [eq(sanctuaryDevotionals.status, 'published'), eq(sanctuaryChurches.status, 'approved')];
  if (params.churchId) filters.push(eq(sanctuaryDevotionals.churchId, params.churchId));
  if (params.followedBy) {
    filters.push(sql`exists (select 1 from sanctuary_follows f where f.church_id = ${sanctuaryChurches.id} and f.user_id = ${params.followedBy})`);
  }
  // A coarse cut in SQL (one day of slack either side of UTC); the exact one, per church, below.
  if (!params.includeFuture) filters.push(lte(sanctuaryDevotionals.forDate, addDays(now.toISOString().slice(0, 10), 1)));
  else filters.push(gte(sanctuaryDevotionals.forDate, addDays(now.toISOString().slice(0, 10), -60)));

  const limit = params.limit ?? R.feedSize;
  const rows = await executor
    .select({
      id: sanctuaryDevotionals.id,
      forDate: sanctuaryDevotionals.forDate,
      title: sanctuaryDevotionals.title,
      scripture: sanctuaryDevotionals.scripture,
      body: sanctuaryDevotionals.body,
      churchId: sanctuaryChurches.id,
      churchName: sanctuaryChurches.name,
      placeName: locations.name,
      placeNames: locations.names,
      timezone: churchTimezone,
    })
    .from(sanctuaryDevotionals)
    .innerJoin(sanctuaryChurches, eq(sanctuaryChurches.id, sanctuaryDevotionals.churchId))
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(and(...filters))
    .orderBy(desc(sanctuaryDevotionals.forDate), desc(sanctuaryDevotionals.createdAt))
    .limit(limit * 3);

  return rows
    .map((row) => ({ row, today: localDate(row.timezone, now) }))
    .filter(({ row, today }) => params.includeFuture || row.forDate <= today)
    .slice(0, limit)
    .map(({ row, today }) => ({
      id: row.id,
      forDate: row.forDate,
      title: row.title,
      scripture: row.scripture,
      body: row.body,
      church: { id: row.churchId, name: row.churchName, placeName: localized(row.placeName, row.placeNames, params.locale) },
      isToday: row.forDate === today,
    }));
}

export async function getDevotional(executor: Executor, params: { id: string; locale: string; now?: Date }): Promise<DevotionalView | null> {
  const now = params.now ?? new Date();
  const [row] = await executor
    .select({
      id: sanctuaryDevotionals.id,
      forDate: sanctuaryDevotionals.forDate,
      title: sanctuaryDevotionals.title,
      scripture: sanctuaryDevotionals.scripture,
      body: sanctuaryDevotionals.body,
      churchId: sanctuaryChurches.id,
      churchName: sanctuaryChurches.name,
      placeName: locations.name,
      placeNames: locations.names,
      timezone: churchTimezone,
    })
    .from(sanctuaryDevotionals)
    .innerJoin(sanctuaryChurches, eq(sanctuaryChurches.id, sanctuaryDevotionals.churchId))
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .where(and(eq(sanctuaryDevotionals.id, params.id), eq(sanctuaryDevotionals.status, 'published'), eq(sanctuaryChurches.status, 'approved')))
    .limit(1);
  if (!row) return null;
  const today = localDate(row.timezone, now);
  if (row.forDate > today) return null;
  return {
    id: row.id,
    forDate: row.forDate,
    title: row.title,
    scripture: row.scripture,
    body: row.body,
    church: { id: row.churchId, name: row.churchName, placeName: localized(row.placeName, row.placeNames, params.locale) },
    isToday: row.forDate === today,
  };
}

/** For the owner's management page: every published word, including those prepared ahead. */
export async function churchDevotionalsForOwner(executor: Executor, params: { churchId: string; ownerUserId: string }) {
  return executor
    .select({ id: sanctuaryDevotionals.id, forDate: sanctuaryDevotionals.forDate, title: sanctuaryDevotionals.title })
    .from(sanctuaryDevotionals)
    .innerJoin(sanctuaryChurches, eq(sanctuaryChurches.id, sanctuaryDevotionals.churchId))
    .where(and(eq(sanctuaryDevotionals.churchId, params.churchId), eq(sanctuaryChurches.ownerUserId, params.ownerUserId), eq(sanctuaryDevotionals.status, 'published')))
    .orderBy(desc(sanctuaryDevotionals.forDate))
    .limit(60);
}

export type ReviewQueue = {
  pending: Array<ChurchCard & { description: string; streamUrl: string | null; whatsappE164: string | null; address: string | null; owner: { displayName: string; yayId: string; email: string }; createdAt: Date }>;
  reports: Array<{ ticketId: string; ticketCode: string; priority: string; church: { id: string; name: string; status: string }; reports: Array<{ category: string; description: string | null; devotionalTitle: string | null }> }>;
};

export async function reviewQueue(executor: Executor, actor: AuthContext | null, locale: string): Promise<ReviewQueue> {
  await requirePermission(executor, actor, 'sanctuary.review');
  const pendingRows = await executor
    .select({
      ...churchColumns,
      description: sanctuaryChurches.description,
      streamUrl: sanctuaryChurches.streamUrl,
      whatsappE164: sanctuaryChurches.whatsappE164,
      address: sanctuaryChurches.address,
      ownerName: users.displayName,
      ownerYayId: users.yayId,
      ownerEmail: users.email,
      createdAt: sanctuaryChurches.createdAt,
    })
    .from(sanctuaryChurches)
    .innerJoin(locations, eq(locations.id, sanctuaryChurches.locationId))
    .innerJoin(users, eq(users.id, sanctuaryChurches.ownerUserId))
    .where(eq(sanctuaryChurches.status, 'pending'))
    .orderBy(sanctuaryChurches.updatedAt)
    .limit(100);
  const services = await servicesFor(executor, pendingRows.map((row) => row.id));
  const cards = toCards(pendingRows, services, locale, new Date());

  const ticketRows = await executor
    .select({ ticketId: tickets.id, ticketCode: tickets.code, priority: tickets.priority, churchId: sanctuaryChurches.id, name: sanctuaryChurches.name, status: sanctuaryChurches.status })
    .from(tickets)
    .innerJoin(sanctuaryChurches, sql`${sanctuaryChurches.id}::text = ${tickets.subjectId}`)
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = ticketRows.map((row) => row.ticketId);
  const reportRows = ids.length
    ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description, evidence: reports.evidence }).from(reports).where(inArray(reports.ticketId, ids))
    : [];
  const devotionalIds = reportRows.flatMap((row) => row.evidence.filter((item) => item.type === 'sanctuary_devotional').map((item) => item.ref));
  const devotionalRows = devotionalIds.length
    ? await executor.select({ id: sanctuaryDevotionals.id, title: sanctuaryDevotionals.title }).from(sanctuaryDevotionals).where(inArray(sanctuaryDevotionals.id, devotionalIds))
    : [];

  return {
    pending: pendingRows.map((row, index) => ({
      ...cards[index]!,
      description: row.description,
      streamUrl: row.streamUrl,
      whatsappE164: row.whatsappE164,
      address: row.address,
      owner: { displayName: row.ownerName, yayId: formatYayId(row.ownerYayId), email: row.ownerEmail },
      createdAt: row.createdAt,
    })),
    reports: ticketRows.map((row) => ({
      ticketId: row.ticketId,
      ticketCode: row.ticketCode,
      priority: row.priority,
      church: { id: row.churchId, name: row.name, status: row.status },
      reports: reportRows
        .filter((report) => report.ticketId === row.ticketId)
        .map((report) => {
          const ref = report.evidence.find((item) => item.type === 'sanctuary_devotional')?.ref;
          return { category: report.category, description: report.description, devotionalTitle: ref ? (devotionalRows.find((d) => d.id === ref)?.title ?? null) : null };
        }),
    })),
  };
}

export async function pendingChurchCount(executor: Executor): Promise<number> {
  const [row] = await executor.select({ count: sql<number>`count(*)::int` }).from(sanctuaryChurches).where(eq(sanctuaryChurches.status, 'pending'));
  return row?.count ?? 0;
}
