import 'server-only';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import { animalsLostFound, animalsLostFoundPhotos, locations, moderationActions, reports, tickets, users } from '@/server/db/schema';
import { ANIMALS_RULES as R } from '@/config/business-rules';
import { SPECIES } from '@/config/animals';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { insertMediaRows, markRemoved, type StoredImage } from '@/server/domains/media/service';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { dayKey, notify } from '@/server/domains/notifications/service';

/**
 * Lost and found. Any active member may post — a lost dog cannot wait for a
 * review — and anyone may read. The contact number is for signed-in members
 * only. Posts close themselves after `lostOpenDays`.
 *
 * When something is found, owners of open "lost" posts for the same species
 * in the same place are told, once a day per post.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const SUBJECT = 'animals_lost_found';
export const LOST_PHOTO_PURPOSE = 'lost_found_photo';
export const LOST_KINDS = ['lost', 'found'] as const;
export type LostKind = (typeof LOST_KINDS)[number];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const lostFoundInputSchema = z
  .object({
    kind: z.enum(LOST_KINDS, { message: 'animals.lost.error.kind' }),
    species: z.enum(SPECIES, { message: 'animals.error.species' }),
    name: z
      .string()
      .transform((value) => value.replace(/\s+/g, ' ').trim())
      .pipe(z.string().max(R.nameMaxLength, { message: 'animals.error.name' }))
      .transform((value) => value || null),
    description: z
      .string()
      .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
      .pipe(z.string().min(R.lostDescriptionMinLength, { message: 'animals.lost.error.description' }).max(R.lostDescriptionMaxLength, { message: 'animals.lost.error.description' })),
    locationId: z.string().uuid({ message: 'animals.error.location' }),
    seenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'animals.lost.error.date' }),
    whatsapp: z.string().transform((value, ctx) => {
      const normalized = normalizeWhatsapp(value);
      if (!normalized) ctx.addIssue({ code: 'custom', message: 'animals.error.whatsapp' });
      return normalized ?? '';
    }),
  })
  .transform((value) => ({ ...value, name: value.kind === 'lost' ? value.name : null }));
export type LostFoundInput = z.output<typeof lostFoundInputSchema>;

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'animals.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'animals.error.account_restricted');
}

export async function publishLostFound(
  tx: Executor,
  params: { authorUserId: string; input: LostFoundInput; images: StoredImage[]; audit?: AuditContext; now?: Date },
): Promise<string> {
  await activeMember(tx, params.authorUserId);
  const now = params.now ?? new Date();
  const { input } = params;
  if (params.images.length < R.lostMinPhotos || params.images.length > R.lostMaxPhotos) throw errors.validation('animals.lost.error.photo_count', { min: R.lostMinPhotos, max: R.lostMaxPhotos });
  const earliest = isoDay(new Date(now.getTime() - R.lostSeenDaysBack * 86_400_000));
  // A day ahead tolerates every time zone's "today".
  if (input.seenOn < earliest || input.seenOn > isoDay(new Date(now.getTime() + 86_400_000))) throw errors.validation('animals.lost.error.date');
  const [place] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place) throw errors.validation('animals.error.location');
  const [open] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(animalsLostFound)
    .where(and(eq(animalsLostFound.authorUserId, params.authorUserId), eq(animalsLostFound.status, 'open')));
  if ((open?.count ?? 0) >= R.lostMaxOpenPerMember) throw errors.conflict('animals.lost.error.too_many', { limit: R.lostMaxOpenPerMember });

  const [post] = await tx
    .insert(animalsLostFound)
    .values({
      authorUserId: params.authorUserId,
      kind: input.kind,
      species: input.species,
      name: input.name,
      description: input.description,
      locationId: input.locationId,
      seenOn: input.seenOn,
      whatsappE164: input.whatsapp,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: animalsLostFound.id });
  const id = post!.id;
  await insertMediaRows(tx, { ownerUserId: params.authorUserId, purpose: LOST_PHOTO_PURPOSE, images: params.images });
  await tx.insert(animalsLostFoundPhotos).values(params.images.map((image, position) => ({ postId: id, mediaId: image.id, position })));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: `animals.${input.kind}_posted`,
    subjectType: SUBJECT,
    subjectId: id,
    district: 'animals',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { species: input.species },
  });

  if (input.kind === 'found') {
    // Someone may be looking for exactly this animal.
    const owners = await tx
      .select({ id: animalsLostFound.id, authorUserId: animalsLostFound.authorUserId })
      .from(animalsLostFound)
      .where(
        and(
          eq(animalsLostFound.kind, 'lost'),
          eq(animalsLostFound.status, 'open'),
          eq(animalsLostFound.species, input.species),
          eq(animalsLostFound.locationId, input.locationId),
          ne(animalsLostFound.authorUserId, params.authorUserId),
        ),
      )
      .limit(200);
    const day = dayKey(now);
    await notify(
      tx,
      owners.map((lost) => ({
        userId: lost.authorUserId,
        category: 'animals' as const,
        type: 'animals.possible_match',
        titleKey: 'notify.animals.possible_match',
        href: `/animals/lost/${lost.id}#matches`,
        dedupeKey: `animals.match:${lost.id}:${day}`,
        subjectId: id,
      })),
    );
  }
  return id;
}

/** The author says how it ended: home again, or no longer looking. */
export async function closeLostFound(tx: Executor, params: { authorUserId: string; postId: string; outcome: 'reunited' | 'closed' }): Promise<void> {
  const [post] = await tx.select().from(animalsLostFound).where(eq(animalsLostFound.id, params.postId)).limit(1).for('update');
  if (!post || post.authorUserId !== params.authorUserId || post.status === 'removed') throw errors.notFound('animals_lost_found');
  if (post.status !== 'open') throw errors.conflict('animals.lost.error.closed');
  await tx.update(animalsLostFound).set({ status: params.outcome, closedAt: new Date(), updatedAt: new Date() }).where(eq(animalsLostFound.id, post.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.authorUserId, action: `animals.lost_found_${params.outcome}`, subjectType: SUBJECT, subjectId: post.id, district: 'animals' });
}

/** Scheduler job: posts open for `lostOpenDays` close, and their authors are told. */
export async function expireLostFound(database: Database, now = new Date()): Promise<{ closed: number }> {
  const cutoff = new Date(now.getTime() - R.lostOpenDays * 86_400_000);
  return database.transaction(async (tx) => {
    const closed = await tx
      .update(animalsLostFound)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(and(eq(animalsLostFound.status, 'open'), lte(animalsLostFound.createdAt, cutoff)))
      .returning({ id: animalsLostFound.id, authorUserId: animalsLostFound.authorUserId });
    await notify(
      tx,
      closed.map((post) => ({ userId: post.authorUserId, category: 'animals' as const, type: 'animals.lost_expired', titleKey: 'notify.animals.lost_expired', href: `/animals/lost/${post.id}`, dedupeKey: `animals.lost_expired:${post.id}` })),
    );
    return { closed: closed.length };
  });
}

export async function reportLostFound(
  tx: Executor,
  params: { reporterUserId: string; postId: string; category: 'scam' | 'fake_listing' | 'animal_abuse' | 'other'; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const [post] = await tx.select({ authorUserId: animalsLostFound.authorUserId, status: animalsLostFound.status }).from(animalsLostFound).where(eq(animalsLostFound.id, params.postId)).limit(1);
  if (!post || post.status === 'removed') throw errors.notFound('animals_lost_found');
  if (post.authorUserId === params.reporterUserId) throw errors.validation('animals.report.error.own');
  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, SUBJECT), eq(reports.subjectId, params.postId), eq(reports.reporterUserId, params.reporterUserId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };
  // A "found" post asking for money is the ransom scam: it goes to the front.
  const priority = params.category === 'scam' || params.category === 'animal_abuse' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: SUBJECT, subjectId: params.postId, category: params.category, priority });
  await tx.insert(reports).values({ reporterUserId: params.reporterUserId, subjectType: SUBJECT, subjectId: params.postId, district: 'animals', category: params.category, description: params.description, evidence: [], ticketId });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.reporterUserId, action: 'animals.lost_found_reported', subjectType: SUBJECT, subjectId: params.postId, district: 'animals', metadata: { category: params.category, ticketId } });
  return { ticketCode: ticket!.code, duplicate: false };
}

export async function resolveLostFoundTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: 'dismiss' | 'remove_post'; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'adoptions.review');
  const [ticket] = await tx.select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status }).from(tickets).where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT))).limit(1).for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  if (params.decision !== 'dismiss' && !params.note) throw errors.validation('animals.error.review_note');
  const [post] = await tx.select().from(animalsLostFound).where(eq(animalsLostFound.id, ticket.subjectId)).limit(1).for('update');
  if (!post) throw errors.notFound('animals_lost_found');
  if (post.authorUserId === actor.userId) throw errors.forbidden('adoptions.review');
  if (params.decision === 'remove_post') {
    await tx.update(animalsLostFound).set({ status: 'removed', removedBy: actor.userId, updatedAt: new Date() }).where(eq(animalsLostFound.id, post.id));
    const photos = await tx.select({ mediaId: animalsLostFoundPhotos.mediaId }).from(animalsLostFoundPhotos).where(eq(animalsLostFoundPhotos.postId, post.id));
    await markRemoved(tx, photos.map((photo) => photo.mediaId));
    await notify(tx, [{ userId: post.authorUserId, category: 'moderation', type: 'animals.lost_removed', titleKey: 'notify.animals.lost_removed', href: '/animals/lost' }]);
  }
  const actedOn = params.decision !== 'dismiss';
  await tx
    .update(tickets)
    .set({ status: actedOn ? 'resolved' : 'rejected', resolutionSummary: actedOn ? 'moderation.resolution.removed' : 'moderation.resolution.no_action', assignedTo: actor.userId, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(tickets.id, ticket.id));
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `animals_lost_${params.decision}`, internalNote: params.note });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `moderation.animals_lost_${params.decision}`, subjectType: SUBJECT, subjectId: post.id, district: 'animals', metadata: { ticketId: ticket.id } });
}

// --- Reading -----------------------------------------------------------------

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

export type LostFoundCard = {
  id: string;
  kind: LostKind;
  species: string;
  name: string | null;
  description: string;
  seenOn: string;
  status: string;
  placeName: string;
  photoId: string | null;
  createdAt: Date;
};

const cardColumns = {
  id: animalsLostFound.id,
  kind: animalsLostFound.kind,
  species: animalsLostFound.species,
  name: animalsLostFound.name,
  description: animalsLostFound.description,
  seenOn: animalsLostFound.seenOn,
  status: animalsLostFound.status,
  createdAt: animalsLostFound.createdAt,
  placeName: locations.name,
  placeNames: locations.names,
  photoId: sql<string | null>`(select p.media_id from animals_lost_found_photos p join media m on m.id = p.media_id and m.status = 'active' where p.post_id = ${animalsLostFound.id} order by p.position limit 1)`,
};

type Row = Omit<LostFoundCard, 'placeName'> & { placeName: string; placeNames: unknown };
const toCard = (row: Row, locale: string): LostFoundCard => {
  const { placeNames, ...rest } = row;
  return { ...rest, placeName: localized(row.placeName, placeNames, locale) };
};

export async function listLostFound(
  executor: Executor,
  params: { locale: string; kind?: string; species?: string; placeCode?: string; page?: number },
): Promise<{ items: LostFoundCard[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const conditions = [eq(animalsLostFound.status, 'open')];
  if (params.kind && (LOST_KINDS as readonly string[]).includes(params.kind)) conditions.push(eq(animalsLostFound.kind, params.kind as LostKind));
  if (params.species && (SPECIES as readonly string[]).includes(params.species)) conditions.push(eq(animalsLostFound.species, params.species));
  if (params.placeCode) conditions.push(sql`(${locations.code} = ${params.placeCode} or ${params.placeCode} = any(${locations.path}))`);
  const rows = await executor
    .select(cardColumns)
    .from(animalsLostFound)
    .innerJoin(locations, eq(locations.id, animalsLostFound.locationId))
    .where(and(...conditions))
    .orderBy(desc(animalsLostFound.createdAt))
    .limit(R.pageSize + 1)
    .offset((page - 1) * R.pageSize);
  return { items: rows.slice(0, R.pageSize).map((row) => toCard(row as Row, params.locale)), hasMore: rows.length > R.pageSize, page };
}

export async function getLostFound(executor: Executor, params: { postId: string; viewerId: string | null; viewerIsReviewer: boolean; locale: string }) {
  const [row] = await executor
    .select({ ...cardColumns, authorUserId: animalsLostFound.authorUserId, whatsappE164: animalsLostFound.whatsappE164, locationId: animalsLostFound.locationId, authorName: users.displayName })
    .from(animalsLostFound)
    .innerJoin(locations, eq(locations.id, animalsLostFound.locationId))
    .innerJoin(users, eq(users.id, animalsLostFound.authorUserId))
    .where(eq(animalsLostFound.id, params.postId))
    .limit(1);
  if (!row) return null;
  const isAuthor = row.authorUserId === params.viewerId;
  if (row.status === 'removed' && !isAuthor && !params.viewerIsReviewer) return null;
  const photos = await executor.select({ id: animalsLostFoundPhotos.mediaId }).from(animalsLostFoundPhotos).where(eq(animalsLostFoundPhotos.postId, row.id)).orderBy(asc(animalsLostFoundPhotos.position));
  // Possible matches: the other kind, same species and place, still open.
  const matches =
    row.status === 'open'
      ? await executor
          .select(cardColumns)
          .from(animalsLostFound)
          .innerJoin(locations, eq(locations.id, animalsLostFound.locationId))
          .where(
            and(
              eq(animalsLostFound.status, 'open'),
              eq(animalsLostFound.kind, row.kind === 'lost' ? 'found' : 'lost'),
              eq(animalsLostFound.species, row.species),
              eq(animalsLostFound.locationId, row.locationId),
            ),
          )
          .orderBy(desc(animalsLostFound.createdAt))
          .limit(12)
      : [];
  return {
    post: toCard(row as Row, params.locale),
    authorName: row.authorName,
    photos: photos.map((photo) => photo.id),
    isAuthor,
    // Contact is for signed-in members: a number on the open web invites the ransom scam.
    whatsappE164: params.viewerId ? row.whatsappE164 : null,
    matches: matches.map((match) => toCard(match as Row, params.locale)),
  };
}

export async function myLostFound(executor: Executor, params: { userId: string; locale: string }) {
  const rows = await executor
    .select(cardColumns)
    .from(animalsLostFound)
    .innerJoin(locations, eq(locations.id, animalsLostFound.locationId))
    .where(and(eq(animalsLostFound.authorUserId, params.userId), ne(animalsLostFound.status, 'removed')))
    .orderBy(desc(animalsLostFound.createdAt))
    .limit(50);
  return rows.map((row) => toCard(row as Row, params.locale));
}

export async function lostFoundReports(executor: Executor) {
  const open = await executor
    .select({ ticketId: tickets.id, code: tickets.code, priority: tickets.priority, postId: animalsLostFound.id, kind: animalsLostFound.kind, species: animalsLostFound.species })
    .from(tickets)
    .innerJoin(animalsLostFound, sql`${animalsLostFound.id}::text = ${tickets.subjectId}`)
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);
  const ids = open.map((t) => t.ticketId);
  const reported = ids.length ? await executor.select({ ticketId: reports.ticketId, category: reports.category, description: reports.description }).from(reports).where(inArray(reports.ticketId, ids)) : [];
  return open.map((ticket) => ({ ...ticket, reports: reported.filter((r) => r.ticketId === ticket.ticketId) }));
}
