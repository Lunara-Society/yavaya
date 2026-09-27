import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import {
  enforcementRecords,
  media,
  mercaditoListingPhotos,
  mercaditoListings,
  moderationActions,
  reports,
  tickets,
  users,
} from '@/server/db/schema';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { applyRule } from '@/server/domains/reputation/service';
import { markRemoved } from '@/server/domains/media/service';
import { formatYayId } from '@/server/domains/identity/yay-id';

/**
 * Reports on Mercadito listings, and what moderators do about them.
 *
 * Reports on the same listing collect under one open ticket, so a listing
 * reported twenty times is one item in the queue with a count of twenty —
 * not twenty items a moderator could resolve inconsistently.
 */

export const LISTING_REPORT_CATEGORIES = ['scam', 'fraud', 'fake_listing', 'spam', 'harassment', 'other'] as const;
export type ListingReportCategory = (typeof LISTING_REPORT_CATEGORIES)[number];

const OPEN_STATUSES = ['open', 'triaged', 'in_review', 'awaiting_reporter'] as const;
const SUBJECT = 'mercadito_listing';

function ticketCode(): string {
  return `TCK-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function openTicketFor(
  tx: Executor,
  params: { listingId: string; category: ListingReportCategory; priority: 'normal' | 'high' },
): Promise<string> {
  const [existing] = await tx
    .select({ id: tickets.id, priority: tickets.priority })
    .from(tickets)
    .where(
      and(
        eq(tickets.subjectType, SUBJECT),
        eq(tickets.subjectId, params.listingId),
        inArray(tickets.status, [...OPEN_STATUSES]),
      ),
    )
    .limit(1)
    .for('update');
  if (existing) {
    if (params.priority === 'high' && existing.priority !== 'high' && existing.priority !== 'urgent') {
      await tx.update(tickets).set({ priority: 'high', updatedAt: new Date() }).where(eq(tickets.id, existing.id));
    }
    return existing.id;
  }

  // A collision on a 24-bit code is rare but possible; retry rather than fail.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [created] = await tx
      .insert(tickets)
      .values({
        code: ticketCode(),
        subjectType: SUBJECT,
        subjectId: params.listingId,
        category: params.category,
        priority: params.priority,
      })
      .onConflictDoNothing({ target: tickets.code })
      .returning({ id: tickets.id });
    if (created) return created.id;
  }
  throw errors.internal('could not allocate a ticket code');
}

/** Automatic screening found something: queue the listing for a person to look at. */
export async function openSystemTicket(tx: Executor, params: { listingId: string; flags: string[] }): Promise<void> {
  const ticketId = await openTicketFor(tx, { listingId: params.listingId, category: 'fake_listing', priority: 'normal' });
  await tx.insert(moderationActions).values({
    ticketId,
    actorUserId: null,
    action: 'screening_flagged',
    metadata: { flags: params.flags },
  });
}

export async function reportListing(
  tx: Executor,
  params: {
    listingId: string;
    reporterUserId: string;
    category: ListingReportCategory;
    description: string | null;
  },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const [listing] = await tx
    .select({ sellerUserId: mercaditoListings.sellerUserId, status: mercaditoListings.status })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.id, params.listingId))
    .limit(1);
  if (!listing || (listing.status !== 'published' && listing.status !== 'sold')) {
    throw errors.notFound('mercadito_listing');
  }
  if (listing.sellerUserId === params.reporterUserId) throw errors.validation('mercadito.report.error.own');

  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(
      and(
        eq(reports.subjectType, SUBJECT),
        eq(reports.subjectId, params.listingId),
        eq(reports.reporterUserId, params.reporterUserId),
        inArray(tickets.status, [...OPEN_STATUSES]),
      ),
    )
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'scam' || params.category === 'fraud' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { listingId: params.listingId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType: SUBJECT,
    subjectId: params.listingId,
    district: 'mercadito',
    category: params.category,
    description: params.description,
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: 'mercadito.listing_reported',
    subjectType: SUBJECT,
    subjectId: params.listingId,
    district: 'mercadito',
    metadata: { category: params.category, ticketId },
  });

  return { ticketCode: ticket!.code, duplicate: false };
}

export type QueueItem = {
  ticketId: string;
  ticketCode: string;
  category: string;
  priority: string;
  createdAt: Date;
  reportCount: number;
  listing: { id: string; title: string; status: string; flags: string[]; coverMediaId: string | null };
  seller: { yayId: string; displayName: string; status: string };
  reports: Array<{ category: string; description: string | null; createdAt: Date }>;
};

export async function listingQueue(executor: Executor, actor: AuthContext | null): Promise<QueueItem[]> {
  await requirePermission(executor, actor, 'listings.moderate');

  const rows = await executor
    .select({
      ticketId: tickets.id,
      ticketCode: tickets.code,
      category: tickets.category,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      listingId: mercaditoListings.id,
      title: mercaditoListings.title,
      listingStatus: mercaditoListings.status,
      flags: mercaditoListings.flags,
      coverMediaId: sql<string | null>`(
        select p.media_id from mercadito_listing_photos p
        where p.listing_id = ${mercaditoListings.id} order by p.position asc limit 1
      )`,
      sellerYayId: users.yayId,
      sellerName: users.displayName,
      sellerStatus: users.status,
    })
    .from(tickets)
    .innerJoin(mercaditoListings, sql`${mercaditoListings.id}::text = ${tickets.subjectId}`)
    .innerJoin(users, eq(users.id, mercaditoListings.sellerUserId))
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, asc(tickets.createdAt))
    .limit(100);

  const ticketIds = rows.map((row) => row.ticketId);
  const reportRows = ticketIds.length
    ? await executor
        .select({
          ticketId: reports.ticketId,
          category: reports.category,
          description: reports.description,
          createdAt: reports.createdAt,
        })
        .from(reports)
        .where(inArray(reports.ticketId, ticketIds))
        .orderBy(desc(reports.createdAt))
    : [];

  return rows.map((row) => {
    const own = reportRows.filter((report) => report.ticketId === row.ticketId);
    return {
      ticketId: row.ticketId,
      ticketCode: row.ticketCode,
      category: row.category,
      priority: row.priority,
      createdAt: row.createdAt,
      reportCount: own.length,
      listing: {
        id: row.listingId,
        title: row.title,
        status: row.listingStatus,
        flags: row.flags,
        coverMediaId: row.coverMediaId,
      },
      seller: { yayId: formatYayId(row.sellerYayId), displayName: row.sellerName, status: row.sellerStatus },
      reports: own.slice(0, 10).map(({ category, description, createdAt }) => ({ category, description, createdAt })),
    };
  });
}

export async function openListingTicketCount(executor: Executor): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(tickets)
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_STATUSES])));
  return row?.total ?? 0;
}

/**
 * What a moderator can decide:
 *  - dismiss: nothing wrong; the listing stays.
 *  - remove: taken down, no mark against the seller (an honest mistake).
 *  - warn: taken down, and a warning with its reputation penalty.
 *  - fraud: taken down as a confirmed fraudulent listing, with that penalty.
 */
export const MODERATION_DECISIONS = ['dismiss', 'remove', 'warn', 'fraud'] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

const ENFORCEMENT_REASON: Record<string, 'scam' | 'fraud' | 'spam' | 'harassment' | 'financial_deception' | 'other'> = {
  scam: 'scam',
  fraud: 'fraud',
  spam: 'spam',
  harassment: 'harassment',
  fake_listing: 'financial_deception',
};

export async function resolveListingTicket(
  tx: Executor,
  params: {
    actor: AuthContext | null;
    ticketId: string;
    decision: ModerationDecision;
    note: string | null;
  },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'listings.moderate');

  const [ticket] = await tx
    .select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status, category: tickets.category })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT)))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');

  const [listing] = await tx
    .select({ id: mercaditoListings.id, sellerUserId: mercaditoListings.sellerUserId, status: mercaditoListings.status })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.id, ticket.subjectId))
    .limit(1)
    .for('update');
  if (!listing) throw errors.notFound('mercadito_listing');

  // A moderator does not judge their own listing.
  if (listing.sellerUserId === actor.userId) throw errors.forbidden('listings.moderate');

  const takeDown = params.decision !== 'dismiss';
  if (takeDown && listing.status !== 'removed') {
    await tx
      .update(mercaditoListings)
      .set({ status: 'removed', removedBy: actor.userId, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(mercaditoListings.id, listing.id));
    const photos = await tx
      .select({ mediaId: mercaditoListingPhotos.mediaId })
      .from(mercaditoListingPhotos)
      .innerJoin(media, eq(media.id, mercaditoListingPhotos.mediaId))
      .where(eq(mercaditoListingPhotos.listingId, listing.id));
    // Kept in the bucket as evidence, but no longer served to anyone.
    await markRemoved(tx, photos.map((photo) => photo.mediaId));
  }

  if (params.decision === 'warn' || params.decision === 'fraud') {
    await tx.insert(enforcementRecords).values({
      userId: listing.sellerUserId,
      type: 'warning',
      reasonCategory: params.decision === 'fraud' ? 'fraud' : (ENFORCEMENT_REASON[ticket.category] ?? 'other'),
      internalNote: params.note,
      issuedBy: actor.userId,
    });
    await applyRule(tx, {
      userId: listing.sellerUserId,
      ruleKey: params.decision === 'fraud' ? 'confirmed_fraudulent_listing' : 'warning_issued',
      source: 'moderation',
      idempotencyKey: `moderation.ticket:${ticket.id}:${params.decision}`,
      relatedType: SUBJECT,
      relatedId: listing.id,
    });
  }

  await tx
    .update(tickets)
    .set({
      status: takeDown ? 'resolved' : 'rejected',
      // Shown to reporters. An i18n key, so each reads it in their language;
      // never the moderator's note, which is internal.
      resolutionSummary: takeDown ? 'moderation.resolution.removed' : 'moderation.resolution.no_action',
      assignedTo: actor.userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticket.id));

  await tx.insert(moderationActions).values({
    ticketId: ticket.id,
    actorUserId: actor.userId,
    action: `listing_${params.decision}`,
    internalNote: params.note,
  });

  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.listing_${params.decision}`,
    subjectType: SUBJECT,
    subjectId: listing.id,
    district: 'mercadito',
    metadata: { ticketId: ticket.id, sellerUserId: listing.sellerUserId },
  });
}
