import 'server-only';
import { and, desc, eq, gt, ilike, inArray, ne, or, sql, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '@/server/db/client';
import { boardAlerts, boardPostPhotos, boardPosts, locations, moderationActions, reports, tickets, userProfiles, users } from '@/server/db/schema';
import { BOARD_RULES } from '@/config/business-rules';
import { BOARD_DISTRICTS, BOARD_DISTRICT_KEYS, BOARD_KINDS, isSubdistrict, type BoardDistrict, type BoardKind } from '@/config/boards';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { dayKey, notify } from '@/server/domains/notifications/service';
import { subtreeIds } from '@/server/domains/geography/service';
import { insertMediaRows, markRemoved, type StoredImage } from '@/server/domains/media/service';

/**
 * The board districts: Hogar, Movilidad, Salud y Bienestar, Aprender,
 * Negocios and Campo.
 *
 * A member publishes what they offer or what they are looking for, in a
 * subdistrict and a place. Anyone can read an open post; only a signed-in
 * member is shown how to reach its author. Publishing is free. Yavaya takes
 * no part in what the two people agree, holds no money and guarantees
 * nothing, and the pages say so.
 *
 * Every change is audited in the same transaction as the change.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };

export const BOARD_REPORT_CATEGORIES = ['scam', 'fraud', 'fake_listing', 'spam', 'harassment', 'other'] as const;
export type BoardReportCategory = (typeof BOARD_REPORT_CATEGORIES)[number];

const SUBJECT = 'board_post';

/** The media purpose of a post's photos: public, like Mercadito's, because the post is. */
export const BOARD_PHOTO_PURPOSE = 'board_photo';

const clean = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

export const boardInputSchema = z
  .object({
    district: z.enum(BOARD_DISTRICT_KEYS as [BoardDistrict, ...BoardDistrict[]], { message: 'board.error.district' }),
    subdistrict: z.string(),
    kind: z.enum(BOARD_KINDS, { message: 'board.error.kind' }),
    title: clean(BOARD_RULES.titleMinLength, BOARD_RULES.titleMaxLength, 'board.error.title'),
    body: clean(BOARD_RULES.bodyMinLength, BOARD_RULES.bodyMaxLength, 'board.error.body'),
    priceText: z
      .string()
      .transform((value) => value.replace(/\s+/g, ' ').trim())
      .pipe(z.string().max(BOARD_RULES.priceMaxLength, { message: 'board.error.price' }))
      .transform((value) => value || null),
    locationId: z.string().uuid({ message: 'board.error.location' }),
  })
  .refine((input) => isSubdistrict(input.district, input.subdistrict), { message: 'board.error.subdistrict' });
export type BoardInput = z.output<typeof boardInputSchema>;

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'board.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'board.error.account_restricted');
}

/** Open and still inside its time: what the public pages show. */
const live = () => and(eq(boardPosts.status, 'open'), gt(boardPosts.expiresAt, sql`now()`));

export async function createBoardPost(tx: Executor, params: { authorUserId: string; input: BoardInput; images?: StoredImage[]; audit?: AuditContext }): Promise<string> {
  await activeMember(tx, params.authorUserId);
  const { input } = params;
  const images = params.images ?? [];
  if (images.length > BOARD_RULES.maxPhotos) throw errors.validation('board.error.photo_count');
  const [place] = await tx.select({ active: locations.isActive }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
  if (!place?.active) throw errors.validation('board.error.location');

  // The author's row is locked first, so two posts sent at once cannot both pass the count below.
  await tx.select({ id: users.id }).from(users).where(eq(users.id, params.authorUserId)).for('update');
  const [open] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(boardPosts)
    .where(and(eq(boardPosts.authorUserId, params.authorUserId), eq(boardPosts.district, input.district), live()));
  if ((open?.n ?? 0) >= BOARD_RULES.maxOpenPerDistrict) throw new DomainError('conflict', 'board.error.too_many_open');

  const [post] = await tx
    .insert(boardPosts)
    .values({
      authorUserId: params.authorUserId,
      district: input.district,
      subdistrict: input.subdistrict,
      kind: input.kind,
      title: input.title,
      body: input.body,
      priceText: input.priceText,
      locationId: input.locationId,
      expiresAt: new Date(Date.now() + BOARD_RULES.openDays * 86_400_000),
    })
    .returning({ id: boardPosts.id });
  const postId = post!.id;
  if (images.length > 0) {
    await insertMediaRows(tx, { ownerUserId: params.authorUserId, purpose: BOARD_PHOTO_PURPOSE, images });
    await tx.insert(boardPostPhotos).values(images.map((image, position) => ({ postId, mediaId: image.id, position })));
  }
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: 'board.post_published',
    subjectType: SUBJECT,
    subjectId: postId,
    district: input.district,
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { subdistrict: input.subdistrict, kind: input.kind, photos: images.length },
  });
  await notifyAlertMatches(tx, { postId, authorUserId: params.authorUserId });
  return postId;
}

// --- "Avísame" ---------------------------------------------------------------------

export type BoardAlertFilters = { district: BoardDistrict; subdistrict: string | null; kind: BoardKind | null; query: string | null; placeCode: string | null };
export type BoardAlert = BoardAlertFilters & { id: string; newCount: number };

/** The address of a district list with an alert's filters, so opening the alert shows what it watches. */
export function alertHref(alert: BoardAlertFilters & { id?: string }): string {
  const search = new URLSearchParams();
  if (alert.subdistrict) search.set('sub', alert.subdistrict);
  if (alert.kind) search.set('kind', alert.kind);
  if (alert.query) search.set('q', alert.query);
  // An alert without a place watches everywhere, whatever the header's place says.
  search.set('place', alert.placeCode ?? 'all');
  if (alert.id) search.set('alert', alert.id);
  return `/${BOARD_DISTRICTS[alert.district].slug}?${search.toString()}`;
}

/** Tells the members whose alert a new post matches: never its author, and once a day per alert. */
async function notifyAlertMatches(tx: Executor, params: { postId: string; authorUserId: string }): Promise<void> {
  const escaped = sql`replace(replace(replace(${boardAlerts.query}, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;
  const matches = await tx
    .select({ id: boardAlerts.id, userId: boardAlerts.userId, district: boardAlerts.district, subdistrict: boardAlerts.subdistrict, kind: boardAlerts.kind, query: boardAlerts.query, placeCode: boardAlerts.placeCode })
    .from(boardAlerts)
    .innerJoin(boardPosts, eq(boardPosts.id, params.postId))
    .innerJoin(locations, eq(locations.id, boardPosts.locationId))
    .where(
      and(
        ne(boardAlerts.userId, params.authorUserId),
        eq(boardAlerts.district, boardPosts.district),
        sql`(${boardAlerts.subdistrict} is null or ${boardAlerts.subdistrict} = ${boardPosts.subdistrict})`,
        sql`(${boardAlerts.kind} is null or ${boardAlerts.kind} = ${boardPosts.kind})`,
        sql`(${boardAlerts.placeCode} is null or ${locations.code} = ${boardAlerts.placeCode} or ${boardAlerts.placeCode} = any(${locations.path}))`,
        sql`(${boardAlerts.query} is null or ${boardPosts.title} ilike '%' || ${escaped} || '%' or ${boardPosts.body} ilike '%' || ${escaped} || '%')`,
      ),
    )
    .limit(500);
  const day = dayKey();
  await notify(
    tx,
    matches.map((alert) => ({
      userId: alert.userId,
      category: 'districts' as const,
      type: 'board.alert_match',
      titleKey: 'notify.board.alert_match',
      href: alertHref({ ...alert, district: alert.district as BoardDistrict, kind: alert.kind as BoardKind | null }),
      dedupeKey: `board.alert:${alert.id}:${day}`,
      subjectId: params.postId,
    })),
  );
}

/** Saves an alert for the filters a member is looking at. The same filters twice is one alert. */
export async function saveBoardAlert(tx: Executor, params: { userId: string; filters: BoardAlertFilters }): Promise<string> {
  await activeMember(tx, params.userId);
  const f = params.filters;
  const filters: BoardAlertFilters = {
    district: f.district,
    subdistrict: f.subdistrict && isSubdistrict(f.district, f.subdistrict) ? f.subdistrict : null,
    kind: f.kind && (BOARD_KINDS as readonly string[]).includes(f.kind) ? f.kind : null,
    query: f.query?.trim().slice(0, 80) || null,
    placeCode: f.placeCode && /^[a-z0-9._-]{2,80}$/.test(f.placeCode) ? f.placeCode : null,
  };
  const existing = await tx.select().from(boardAlerts).where(and(eq(boardAlerts.userId, params.userId), eq(boardAlerts.district, filters.district)));
  const same = existing.find((a) => a.subdistrict === filters.subdistrict && a.kind === filters.kind && a.query === filters.query && a.placeCode === filters.placeCode);
  if (same) return same.id;
  if (existing.length >= BOARD_RULES.maxAlertsPerDistrict) throw new DomainError('conflict', 'board.error.too_many_alerts');
  const [row] = await tx.insert(boardAlerts).values({ userId: params.userId, ...filters }).returning({ id: boardAlerts.id });
  return row!.id;
}

export async function deleteBoardAlert(tx: Executor, params: { userId: string; id: string }): Promise<void> {
  await tx.delete(boardAlerts).where(and(eq(boardAlerts.id, params.id), eq(boardAlerts.userId, params.userId)));
}

/** Opening an alert: what it matched until now is no longer new. */
export async function markBoardAlertSeen(executor: Executor, params: { userId: string; id: string }): Promise<void> {
  await executor.update(boardAlerts).set({ lastSeenAt: new Date() }).where(and(eq(boardAlerts.id, params.id), eq(boardAlerts.userId, params.userId)));
}

/** A member's alerts in a district, each with how many open posts matched since they last opened it. */
export async function myBoardAlerts(executor: Executor, params: { userId: string; district: BoardDistrict }): Promise<BoardAlert[]> {
  const escaped = sql`replace(replace(replace(${boardAlerts.query}, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;
  const rows = await executor
    .select({
      id: boardAlerts.id,
      subdistrict: boardAlerts.subdistrict,
      kind: boardAlerts.kind,
      query: boardAlerts.query,
      placeCode: boardAlerts.placeCode,
      newCount: sql<number>`(
        select count(*)::int from board_posts p join locations l on l.id = p.location_id
        where p.district = ${boardAlerts.district} and p.status = 'open' and p.expires_at > now()
          and p.created_at > ${boardAlerts.lastSeenAt} and p.author_user_id <> ${boardAlerts.userId}
          and (${boardAlerts.subdistrict} is null or p.subdistrict = ${boardAlerts.subdistrict})
          and (${boardAlerts.kind} is null or p.kind = ${boardAlerts.kind})
          and (${boardAlerts.placeCode} is null or l.code = ${boardAlerts.placeCode} or ${boardAlerts.placeCode} = any(l.path))
          and (${boardAlerts.query} is null or p.title ilike '%' || ${escaped} || '%' or p.body ilike '%' || ${escaped} || '%')
      )`,
    })
    .from(boardAlerts)
    .where(and(eq(boardAlerts.userId, params.userId), eq(boardAlerts.district, params.district)))
    .orderBy(desc(boardAlerts.createdAt));
  return rows.map((row) => ({ ...row, district: params.district, kind: row.kind as BoardKind | null }));
}

export type BoardPostView = {
  id: string;
  district: BoardDistrict;
  subdistrict: string;
  kind: BoardKind;
  title: string;
  body: string;
  priceText: string | null;
  placeName: string;
  status: 'open' | 'closed' | 'removed';
  /** True once its time has run out, whatever its status says. */
  expired: boolean;
  author: { displayName: string; yayId: string };
  isAuthor: boolean;
  /** Media ids of its photos, in order; served at /media/<id>. */
  photoIds: string[];
  createdAt: Date;
  expiresAt: Date;
};

const columns = {
  id: boardPosts.id,
  district: boardPosts.district,
  subdistrict: boardPosts.subdistrict,
  kind: boardPosts.kind,
  title: boardPosts.title,
  body: boardPosts.body,
  priceText: boardPosts.priceText,
  status: boardPosts.status,
  createdAt: boardPosts.createdAt,
  expiresAt: boardPosts.expiresAt,
  authorUserId: boardPosts.authorUserId,
  authorName: users.displayName,
  authorYayId: users.yayId,
  placeName: locations.name,
  placeNames: locations.names,
  photoIds: sql<string[]>`coalesce((select array_agg(p.media_id order by p.position) from board_post_photos p join media m on m.id = p.media_id and m.status = 'active' where p.post_id = ${boardPosts.id}), '{}')`,
};

function view(row: Record<keyof typeof columns, unknown>, viewerId: string | null, locale: string): BoardPostView {
  return {
    id: row.id as string,
    district: row.district as BoardDistrict,
    subdistrict: row.subdistrict as string,
    kind: row.kind as BoardKind,
    title: row.title as string,
    body: row.body as string,
    priceText: row.priceText as string | null,
    placeName: (row.placeNames as Record<string, string> | null)?.[locale] ?? (row.placeName as string),
    status: row.status as BoardPostView['status'],
    expired: (row.expiresAt as Date).getTime() <= Date.now(),
    author: { displayName: row.authorName as string, yayId: formatYayId(row.authorYayId as string) },
    isAuthor: viewerId !== null && row.authorUserId === viewerId,
    photoIds: (row.photoIds as string[] | null) ?? [],
    createdAt: row.createdAt as Date,
    expiresAt: row.expiresAt as Date,
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** A district's open posts, newest first. Public: no viewer is needed to read. */
export async function listBoardPosts(
  executor: Executor,
  params: { district: BoardDistrict; subdistrict?: string; kind?: BoardKind; query?: string; placeCode?: string; viewerId?: string | null; page?: number; locale: string },
): Promise<{ items: BoardPostView[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const size = BOARD_RULES.pageSize;
  const conditions = [eq(boardPosts.district, params.district), live()];
  if (params.subdistrict && isSubdistrict(params.district, params.subdistrict)) conditions.push(eq(boardPosts.subdistrict, params.subdistrict));
  if (params.kind) conditions.push(eq(boardPosts.kind, params.kind));
  const query = params.query?.trim().slice(0, 80);
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(boardPosts.title, pattern), ilike(boardPosts.body, pattern)));
  }
  if (params.placeCode) {
    // A place includes everything inside it: a department shows its towns' posts.
    const ids = await subtreeIds(executor, params.placeCode);
    if (ids.length === 0) return { items: [], hasMore: false, page };
    conditions.push(inArray(boardPosts.locationId, ids));
  }
  const rows = await executor
    .select(columns)
    .from(boardPosts)
    .innerJoin(users, eq(users.id, boardPosts.authorUserId))
    .innerJoin(locations, eq(locations.id, boardPosts.locationId))
    .where(and(...conditions))
    .orderBy(desc(boardPosts.createdAt))
    .limit(size + 1)
    .offset((page - 1) * size);
  return { items: rows.slice(0, size).map((row) => view(row, params.viewerId ?? null, params.locale)), hasMore: rows.length > size, page };
}

/**
 * Open posts of every board district within `radiusKm` of a point, nearest
 * first ("Cerca de mí"). A post is where its town is: the distance is to the
 * town's centre, which is all Yavaya knows of where a post is, and is said as
 * such on the page. Towns without coordinates are left out rather than guessed.
 */
export async function nearbyBoardPosts(
  executor: Executor,
  params: { latitude: number; longitude: number; radiusKm: number; viewerId?: string | null; locale: string; limit: number },
): Promise<Array<BoardPostView & { distanceKm: number }>> {
  const { latitude: lat, longitude: lng } = params;
  const distance = sql<number>`(6371 * 2 * asin(sqrt(power(sin(radians(${locations.latitude} - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(${locations.latitude})) * power(sin(radians(${locations.longitude} - ${lng}) / 2), 2))))`;
  const rows = await executor
    .select({ ...columns, distanceKm: distance })
    .from(boardPosts)
    .innerJoin(users, eq(users.id, boardPosts.authorUserId))
    .innerJoin(locations, eq(locations.id, boardPosts.locationId))
    .where(and(live(), isNotNull(locations.latitude), isNotNull(locations.longitude), sql`${distance} <= ${params.radiusKm}`))
    .orderBy(distance, desc(boardPosts.createdAt))
    .limit(params.limit);
  return rows.map((row) => ({ ...view(row, params.viewerId ?? null, params.locale), distanceKm: Number(row.distanceKm) }));
}

/** Where a place is, when Yavaya knows: the point "Cerca de mí" measures from when the visitor chose a town rather than shared their location. */
export async function placePoint(executor: Executor, code: string): Promise<{ latitude: number; longitude: number } | null> {
  const [row] = await executor.select({ latitude: locations.latitude, longitude: locations.longitude }).from(locations).where(eq(locations.code, code)).limit(1);
  return row?.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : null;
}

/** How many open posts each subdistrict holds, for the district's own navigation. Only real posts are counted. */
export async function subdistrictCounts(executor: Executor, district: BoardDistrict): Promise<Record<string, number>> {
  const rows = await executor
    .select({ subdistrict: boardPosts.subdistrict, n: sql<number>`count(*)::int` })
    .from(boardPosts)
    .where(and(eq(boardPosts.district, district), live()))
    .groupBy(boardPosts.subdistrict);
  return Object.fromEntries(rows.map((row) => [row.subdistrict, row.n]));
}

/** A member's own posts in a district, whatever their state, newest first. */
export async function myBoardPosts(executor: Executor, params: { district: BoardDistrict; userId: string; locale: string }): Promise<BoardPostView[]> {
  const rows = await executor
    .select(columns)
    .from(boardPosts)
    .innerJoin(users, eq(users.id, boardPosts.authorUserId))
    .innerJoin(locations, eq(locations.id, boardPosts.locationId))
    .where(and(eq(boardPosts.district, params.district), eq(boardPosts.authorUserId, params.userId)))
    .orderBy(desc(boardPosts.createdAt))
    .limit(100);
  return rows.map((row) => view(row, params.userId, params.locale));
}

/**
 * One post. Anyone may read it while it is open and inside its time; after
 * that only its author. `contact` is filled only for a signed-in member other
 * than the author: the WhatsApp number the author put on their own profile,
 * when they did.
 */
export async function getBoardPost(
  executor: Executor,
  params: { postId: string; viewerId: string | null; locale: string },
): Promise<(BoardPostView & { contact: { whatsapp: string | null } | null }) | null> {
  const [row] = await executor
    .select({ ...columns, whatsapp: userProfiles.whatsappE164 })
    .from(boardPosts)
    .innerJoin(users, eq(users.id, boardPosts.authorUserId))
    .innerJoin(locations, eq(locations.id, boardPosts.locationId))
    .leftJoin(userProfiles, eq(userProfiles.userId, boardPosts.authorUserId))
    .where(eq(boardPosts.id, params.postId))
    .limit(1);
  if (!row) return null;
  const post = view(row, params.viewerId, params.locale);
  if (!post.isAuthor && (post.status !== 'open' || post.expired)) return null;
  return { ...post, contact: params.viewerId && !post.isAuthor ? { whatsapp: row.whatsapp ?? null } : null };
}

/** Takes a post's photos off the public route when the post itself leaves it. */
async function retirePhotos(tx: Executor, postId: string): Promise<void> {
  const rows = await tx.select({ mediaId: boardPostPhotos.mediaId }).from(boardPostPhotos).where(eq(boardPostPhotos.postId, postId));
  await markRemoved(tx, rows.map((row) => row.mediaId));
}

export async function closeBoardPost(tx: Executor, params: { postId: string; authorUserId: string; audit?: AuditContext }): Promise<void> {
  const [post] = await tx
    .select({ status: boardPosts.status, authorUserId: boardPosts.authorUserId, district: boardPosts.district })
    .from(boardPosts)
    .where(eq(boardPosts.id, params.postId))
    .limit(1)
    .for('update');
  if (!post || post.authorUserId !== params.authorUserId) throw errors.notFound(SUBJECT);
  if (post.status !== 'open') throw errors.conflict('board.error.closed');
  await tx.update(boardPosts).set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() }).where(eq(boardPosts.id, params.postId));
  await retirePhotos(tx, params.postId);
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: 'board.post_closed',
    subjectType: SUBJECT,
    subjectId: params.postId,
    district: post.district,
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
}

// --- Reports and moderation ----------------------------------------------------

export async function reportBoardPost(
  tx: Executor,
  params: { postId: string; reporterUserId: string; category: BoardReportCategory; description: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const [post] = await tx
    .select({ status: boardPosts.status, authorUserId: boardPosts.authorUserId, district: boardPosts.district })
    .from(boardPosts)
    .where(eq(boardPosts.id, params.postId))
    .limit(1)
    .for('update');
  if (!post || post.status !== 'open') throw errors.notFound(SUBJECT);
  if (post.authorUserId === params.reporterUserId) throw errors.validation('board.error.report_own');

  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(
      and(
        eq(reports.subjectType, SUBJECT),
        eq(reports.subjectId, params.postId),
        eq(reports.reporterUserId, params.reporterUserId),
        inArray(tickets.status, [...OPEN_TICKET_STATUSES]),
      ),
    )
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'scam' || params.category === 'fraud' || params.category === 'harassment' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: SUBJECT, subjectId: params.postId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType: SUBJECT,
    subjectId: params.postId,
    district: post.district,
    category: params.category,
    description: params.description,
    evidence: [],
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: 'board.post_reported',
    subjectType: SUBJECT,
    subjectId: params.postId,
    district: post.district,
    metadata: { category: params.category, ticketId },
  });
  return { ticketCode: ticket!.code, duplicate: false };
}

export type BoardQueueItem = {
  ticketId: string;
  code: string;
  category: string;
  priority: string;
  reports: number;
  post: { id: string; district: string; subdistrict: string; title: string; body: string; status: string; authorName: string; authorYayId: string };
};

/** Open cases about board posts, most urgent first. The reporter is never part of what is returned. */
export async function boardQueue(executor: Executor, actor: AuthContext | null): Promise<BoardQueueItem[]> {
  await requirePermission(executor, actor, 'moderation.queue.read');
  const rows = await executor
    .select({
      ticketId: tickets.id,
      code: tickets.code,
      category: tickets.category,
      priority: tickets.priority,
      reports: sql<number>`(select count(*)::int from reports r where r.ticket_id = ${tickets.id})`,
      postId: boardPosts.id,
      district: boardPosts.district,
      subdistrict: boardPosts.subdistrict,
      title: boardPosts.title,
      body: boardPosts.body,
      status: boardPosts.status,
      authorName: users.displayName,
      authorYayId: users.yayId,
    })
    .from(tickets)
    .innerJoin(boardPosts, sql`${boardPosts.id}::text = ${tickets.subjectId}::text`)
    .innerJoin(users, eq(users.id, boardPosts.authorUserId))
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`(${tickets.priority} = 'high') desc`, tickets.createdAt)
    .limit(100);
  return rows.map((row) => ({
    ticketId: row.ticketId,
    code: row.code,
    category: row.category,
    priority: row.priority,
    reports: row.reports,
    post: {
      id: row.postId,
      district: row.district,
      subdistrict: row.subdistrict,
      title: row.title,
      body: row.body,
      status: row.status,
      authorName: row.authorName,
      authorYayId: formatYayId(row.authorYayId),
    },
  }));
}

export const BOARD_DECISIONS = ['dismiss', 'remove'] as const;
export type BoardDecision = (typeof BOARD_DECISIONS)[number];

/** A moderator's decision on a case: leave the post, or take it down. Nobody decides a case about their own post. */
export async function resolveBoardTicket(tx: Executor, params: { actor: AuthContext | null; ticketId: string; decision: BoardDecision; note: string | null }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'moderation.content.remove');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT)))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');
  const [post] = await tx
    .select({ id: boardPosts.id, authorUserId: boardPosts.authorUserId, district: boardPosts.district })
    .from(boardPosts)
    .where(sql`${boardPosts.id}::text = ${ticket.subjectId}::text`)
    .limit(1)
    .for('update');
  if (!post) throw errors.notFound(SUBJECT);
  if (post.authorUserId === actor.userId) throw errors.forbidden('moderation.content.remove');

  if (params.decision === 'remove') {
    await tx.update(boardPosts).set({ status: 'removed', removedBy: actor.userId, closedAt: new Date(), updatedAt: new Date() }).where(eq(boardPosts.id, post.id));
    await retirePhotos(tx, post.id);
  }
  const removed = params.decision === 'remove';
  await tx
    .update(tickets)
    .set({
      status: removed ? 'resolved' : 'rejected',
      resolutionSummary: removed ? 'moderation.resolution.removed' : 'moderation.resolution.no_action',
      assignedTo: actor.userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticket.id));
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `board_${params.decision}`, internalNote: params.note });
  if (removed) {
    await notify(tx, [{ userId: post.authorUserId, category: 'moderation', type: 'board.remove', titleKey: 'notify.moderation.post_removed', href: `/${BOARD_DISTRICTS[post.district as BoardDistrict]?.slug ?? ''}` }]);
  }
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.board_${params.decision}`,
    subjectType: SUBJECT,
    subjectId: post.id,
    district: post.district,
    metadata: { ticketId: ticket.id },
  });
}
