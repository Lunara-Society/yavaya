import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { moderationActions, reports, tickets, users } from '@/server/db/schema';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { resetIdentityByModerator } from './studio';

/**
 * Reports about what a member shows on their profile.
 *
 * They use the moderation tickets every district shares, so twenty reports
 * about one profile are one item with twenty reasons. A moderator either
 * finds nothing to correct, or puts the profile back to Yavaya's own design
 * (`resetIdentityByModerator`): the member keeps their account, their
 * listings and their history — only what they chose to show goes.
 */

const SUBJECT = 'user_profile';
const DISTRICT = 'profiles';

export const PROFILE_REPORT_CATEGORIES = ['harassment', 'fraud', 'scam', 'spam', 'other'] as const;
export type ProfileReportCategory = (typeof PROFILE_REPORT_CATEGORIES)[number];

export async function reportProfile(
  tx: Executor,
  params: { profileUserId: string; reporterUserId: string; category: ProfileReportCategory; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  if (params.profileUserId === params.reporterUserId) throw errors.validation('profile.report.error.own');
  const [profile] = await tx.select({ id: users.id }).from(users).where(eq(users.id, params.profileUserId)).limit(1);
  if (!profile) throw errors.notFound('user');

  // A second report from the same person adds nothing a moderator needs.
  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(
      and(
        eq(reports.subjectType, SUBJECT),
        eq(reports.subjectId, params.profileUserId),
        eq(reports.reporterUserId, params.reporterUserId),
        inArray(tickets.status, [...OPEN_TICKET_STATUSES]),
      ),
    )
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'harassment' || params.category === 'scam' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: SUBJECT, subjectId: params.profileUserId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType: SUBJECT,
    subjectId: params.profileUserId,
    district: DISTRICT,
    category: params.category,
    description: params.description,
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: 'identity.profile_reported',
    subjectType: SUBJECT,
    subjectId: params.profileUserId,
    metadata: { category: params.category, ticketId },
  });
  return { ticketCode: ticket!.code, duplicate: false };
}

export type ProfileQueueItem = {
  ticketId: string;
  ticketCode: string;
  priority: string;
  createdAt: Date;
  member: { displayName: string; yayId: string };
  reports: Array<{ category: string; description: string | null }>;
};

export async function profileQueue(executor: Executor, actor: AuthContext | null): Promise<ProfileQueueItem[]> {
  await requirePermission(executor, actor, 'moderation.queue.read');
  const rows = await executor
    .select({
      ticketId: tickets.id,
      ticketCode: tickets.code,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      displayName: users.displayName,
      yayId: users.yayId,
    })
    .from(tickets)
    .innerJoin(users, sql`${users.id}::text = ${tickets.subjectId}`)
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = rows.map((row) => row.ticketId);
  const reportRows = ids.length
    ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description }).from(reports).where(inArray(reports.ticketId, ids))
    : [];
  return rows.map((row) => ({
    ticketId: row.ticketId,
    ticketCode: row.ticketCode,
    priority: row.priority,
    createdAt: row.createdAt,
    member: { displayName: row.displayName, yayId: formatYayId(row.yayId) },
    reports: reportRows.filter((report) => report.ticketId === row.ticketId).map(({ category, description }) => ({ category, description })),
  }));
}

export const PROFILE_DECISIONS = ['dismiss', 'reset'] as const;
export type ProfileDecision = (typeof PROFILE_DECISIONS)[number];

/**
 * - dismiss: nothing to correct.
 * - reset: the profile goes back to Yavaya's design and its photos are
 *   removed; the note is required, and kept in the audit chain.
 */
export async function resolveProfileTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: ProfileDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'moderation.content.remove');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT)))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  // Nobody decides a report about themselves.
  if (ticket.subjectId === actor.userId) throw errors.forbidden('moderation.content.remove');

  if (params.decision === 'reset') {
    await resetIdentityByModerator(tx, { actor: params.actor, userId: ticket.subjectId, note: params.note ?? '' });
  }
  const actedOn = params.decision === 'reset';
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
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `profile_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.profile_${params.decision}`,
    subjectType: SUBJECT,
    subjectId: ticket.subjectId,
    metadata: { ticketId: ticket.id },
  });
}
