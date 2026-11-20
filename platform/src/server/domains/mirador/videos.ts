import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations, miradorVideos, reports, tickets } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { openTicketFor, OPEN_TICKET_STATUSES, type TicketCategory } from '@/server/domains/moderation/tickets';
import { checkOwnLink, isLinkType, type LinkType } from './links';
import { cleanCaption, hashtagsOf } from './text';
import { mediaUrls } from './feed';

/**
 * A creator's own videos (docs/mirador/README.md, "Creators"): what they say
 * about one, where it was, what it links to, whether it is published; taking
 * it down; and the numbers behind it, which are only ever the real counts.
 *
 * And the other side of a public video: reports, which open a moderation
 * ticket like a report anywhere on Yavaya, and hide the video for review
 * once enough different members have reported it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VideoDetails = {
  caption?: unknown;
  hashtags?: unknown;
  locationId?: unknown;
  link?: { type: unknown; id: unknown } | null;
  /** Publish it (now if ready, the moment it is ready otherwise), or keep it to themselves. */
  publish?: boolean;
};

export async function saveDetails(tx: Executor, params: { userId: string; videoId: string; details: VideoDetails; now?: Date }): Promise<{ status: string; published: boolean }> {
  if (!UUID.test(params.videoId)) throw errors.notFound('mirador_video');
  const [row] = await tx
    .select()
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, params.videoId), eq(miradorVideos.creatorUserId, params.userId)))
    .for('update');
  if (!row || row.status === 'removed' || row.status === 'failed') throw errors.notFound('mirador_video');
  const now = params.now ?? new Date();
  const d = params.details;

  const caption = d.caption === undefined ? row.caption : cleanCaption(d.caption);
  const hashtags = d.caption === undefined && d.hashtags === undefined ? row.hashtags : hashtagsOf(caption, d.hashtags);

  let locationId = row.locationId;
  if (d.locationId !== undefined) {
    if (d.locationId === null || d.locationId === '') locationId = null;
    else {
      const id = String(d.locationId);
      const [place] = UUID.test(id) ? await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, id)).limit(1) : [];
      if (!place) throw errors.validation('mirador.error.place');
      locationId = place.id;
    }
  }

  let link: { type: LinkType | null; id: string | null; district: string | null } = { type: row.linkType as LinkType | null, id: row.linkId, district: row.district };
  if (d.link !== undefined) {
    if (!d.link || !d.link.type) link = { type: null, id: null, district: null };
    else {
      if (!isLinkType(d.link.type)) throw errors.validation('mirador.error.link');
      const id = String(d.link.id ?? '');
      const { district } = await checkOwnLink(tx, { creatorUserId: params.userId, type: d.link.type, id });
      link = { type: d.link.type, id, district };
    }
  }

  // Publishing a ready video puts it up now; one still processing goes up the moment it is ready (process.ts).
  let publishedAt = row.publishedAt;
  if (d.publish === true && !publishedAt) publishedAt = now;
  if (d.publish === false) publishedAt = null;

  await tx
    .update(miradorVideos)
    .set({ caption, hashtags, locationId, linkType: link.type, linkId: link.id, district: link.district, publishedAt, updatedAt: now })
    .where(eq(miradorVideos.id, row.id));
  if (d.publish === true && !row.publishedAt) {
    await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'mirador.video_published', subjectType: 'mirador_video', subjectId: row.id, metadata: { link: link.type } });
  }
  return { status: row.status, published: Boolean(publishedAt) };
}

/** The creator takes their video down: it leaves every feed at once; its files go after the transaction. */
export async function removeOwnVideo(tx: Executor, params: { userId: string; videoId: string; now?: Date }): Promise<string[]> {
  if (!UUID.test(params.videoId)) throw errors.notFound('mirador_video');
  const [row] = await tx
    .select()
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, params.videoId), eq(miradorVideos.creatorUserId, params.userId)))
    .for('update');
  if (!row || row.status === 'removed') throw errors.notFound('mirador_video');
  const now = params.now ?? new Date();
  await tx
    .update(miradorVideos)
    .set({ status: 'removed', removedAt: now, removedBy: params.userId, removedReason: 'creator', updatedAt: now })
    .where(eq(miradorVideos.id, row.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'mirador.video_removed', subjectType: 'mirador_video', subjectId: row.id, metadata: { by: 'creator' } });
  return [row.originalKey, row.playbackKey, row.lowKey, row.posterKey].filter((key): key is string => Boolean(key));
}

export type MyVideo = {
  id: string;
  status: string;
  failureReason: string | null;
  caption: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  poster: string | null;
  durationMs: number;
  source: string;
  removedReason: string | null;
  link: { type: string; id: string } | null;
  counts: { views: number; completions: number; likes: number; comments: number; saves: number; shares: number; linkOpens: number };
};

/** The creator's videos, newest first, every status but abandoned uploads, with their real numbers. */
export async function myVideos(executor: Executor, userId: string): Promise<MyVideo[]> {
  const rows = await executor
    .select()
    .from(miradorVideos)
    .where(and(eq(miradorVideos.creatorUserId, userId), sql`${miradorVideos.status} <> 'uploading'`, sql`(${miradorVideos.removedReason} is distinct from 'creator')`))
    .orderBy(desc(miradorVideos.createdAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    failureReason: row.failureReason,
    caption: row.caption,
    published: Boolean(row.publishedAt),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    poster: row.status === 'ready' || row.removedReason ? mediaUrls(row.id).poster : null,
    durationMs: row.durationMs ?? 0,
    source: row.source,
    removedReason: row.removedReason,
    link: row.linkType && row.linkId ? { type: row.linkType, id: row.linkId } : null,
    counts: { views: row.views, completions: row.completions, likes: row.likes, comments: row.comments, saves: row.saves, shares: row.shares, linkOpens: row.linkOpens },
  }));
}

/** One of the creator's own videos, any status: for the upload page to follow its processing. */
export async function myVideo(executor: Executor, params: { userId: string; videoId: string }): Promise<MyVideo | null> {
  if (!UUID.test(params.videoId)) return null;
  const all = await myVideos(executor, params.userId);
  return all.find((video) => video.id === params.videoId) ?? null;
}

/** Totals across a creator's published videos, and their followers: the analytics header. */
export async function creatorTotals(executor: Executor, userId: string) {
  const [row] = await executor
    .select({
      videos: sql<number>`count(*) filter (where ${miradorVideos.status} = 'ready' and ${miradorVideos.publishedAt} is not null and ${miradorVideos.removedAt} is null)::int`,
      views: sql<number>`coalesce(sum(${miradorVideos.views}), 0)::int`,
      likes: sql<number>`coalesce(sum(${miradorVideos.likes}), 0)::int`,
      comments: sql<number>`coalesce(sum(${miradorVideos.comments}), 0)::int`,
      shares: sql<number>`coalesce(sum(${miradorVideos.shares}), 0)::int`,
      saves: sql<number>`coalesce(sum(${miradorVideos.saves}), 0)::int`,
      linkOpens: sql<number>`coalesce(sum(${miradorVideos.linkOpens}), 0)::int`,
      followers: sql<number>`(select count(*)::int from mirador_follows f where f.creator_user_id = ${userId})`,
      followersWeek: sql<number>`(select count(*)::int from mirador_follows f where f.creator_user_id = ${userId} and f.created_at > now() - interval '7 days')`,
    })
    .from(miradorVideos)
    .where(eq(miradorVideos.creatorUserId, userId));
  return {
    videos: Number(row?.videos ?? 0),
    views: Number(row?.views ?? 0),
    likes: Number(row?.likes ?? 0),
    comments: Number(row?.comments ?? 0),
    shares: Number(row?.shares ?? 0),
    saves: Number(row?.saves ?? 0),
    linkOpens: Number(row?.linkOpens ?? 0),
    followers: Number(row?.followers ?? 0),
    followersWeek: Number(row?.followersWeek ?? 0),
  };
}

export const MIRADOR_REPORT_CATEGORIES = ['scam', 'harassment', 'inappropriate', 'impersonation', 'copyright', 'other'] as const;
export type MiradorReportCategory = (typeof MIRADOR_REPORT_CATEGORIES)[number];

/** Where each reason lands in the shared moderation queue; the ones it has no word for say theirs in the description. */
const TICKET_CATEGORY: Record<MiradorReportCategory, TicketCategory> = { scam: 'scam', harassment: 'harassment', inappropriate: 'other', impersonation: 'fraud', copyright: 'other', other: 'other' };

/**
 * A member reports a video. One open report per member per video; past the
 * threshold of different reporters it is hidden until a moderator looks
 * (`removed_reason = 'reports'`, restorable).
 */
export async function reportVideo(tx: Executor, params: { userId: string; videoId: string; category: MiradorReportCategory; description: string | null }): Promise<{ ticketCode: string; duplicate: boolean }> {
  if (!UUID.test(params.videoId)) throw errors.notFound('mirador_video');
  const [video] = await tx.select().from(miradorVideos).where(eq(miradorVideos.id, params.videoId)).for('update');
  if (!video || video.status !== 'ready' || video.removedAt) throw errors.notFound('mirador_video');
  if (video.creatorUserId === params.userId) throw errors.validation('mirador.error.report_own');
  const category = TICKET_CATEGORY[params.category];

  const [already] = await tx
    .select({ code: tickets.code })
    .from(reports)
    .innerJoin(tickets, eq(tickets.id, reports.ticketId))
    .where(and(eq(reports.subjectType, 'mirador_video'), eq(reports.subjectId, video.id), eq(reports.reporterUserId, params.userId), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .limit(1);
  if (already) return { ticketCode: already.code, duplicate: true };

  const priority = params.category === 'scam' || params.category === 'harassment' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: 'mirador_video', subjectId: video.id, category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.userId,
    subjectType: 'mirador_video',
    subjectId: video.id,
    district: video.district,
    category,
    description: category === params.category ? params.description : `[${params.category}] ${params.description ?? ''}`.trim(),
    evidence: [],
    ticketId,
  });
  const reportsNow = video.reports + 1;
  const hide = reportsNow >= MIRADOR_RULES.reportsToHide;
  await tx
    .update(miradorVideos)
    .set({ reports: reportsNow, ...(hide ? { removedAt: new Date(), removedReason: 'reports' } : {}), updatedAt: new Date() })
    .where(eq(miradorVideos.id, video.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'mirador.video_reported', subjectType: 'mirador_video', subjectId: video.id, metadata: { category: params.category, hidden: hide } });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  return { ticketCode: ticket?.code ?? '', duplicate: false };
}

/** Moderators: take a video down, or put back one hidden by reports or removed by mistake. */
export async function moderateVideo(tx: Executor, params: { actor: AuthContext | null; videoId: string; action: 'remove' | 'restore'; note?: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'moderation.content.remove');
  const [video] = await tx.select().from(miradorVideos).where(eq(miradorVideos.id, params.videoId)).for('update');
  if (!video || video.status !== 'ready') throw errors.notFound('mirador_video');
  const now = new Date();
  if (params.action === 'remove') {
    await tx.update(miradorVideos).set({ removedAt: now, removedBy: actor.userId, removedReason: 'moderator', updatedAt: now }).where(eq(miradorVideos.id, video.id));
  } else {
    if (video.removedReason === 'creator') throw errors.conflict('mirador.error.removed_by_creator');
    await tx.update(miradorVideos).set({ removedAt: null, removedBy: null, removedReason: null, reports: 0, updatedAt: now }).where(eq(miradorVideos.id, video.id));
  }
  await recordAudit(tx, { actorType: 'user', actorUserId: actor.userId, action: `mirador.video_${params.action === 'remove' ? 'removed' : 'restored'}`, subjectType: 'mirador_video', subjectId: video.id, metadata: { note: params.note ?? null } });
}

/** The moderation queue: videos hidden by reports or with open reports, most reported first. */
export async function moderationQueue(executor: Executor, actor: AuthContext | null) {
  await requirePermission(executor, actor, 'moderation.queue.read');
  return executor
    .select({ id: miradorVideos.id, caption: miradorVideos.caption, reports: miradorVideos.reports, removedReason: miradorVideos.removedReason, creatorUserId: miradorVideos.creatorUserId, source: miradorVideos.source, publishedAt: miradorVideos.publishedAt })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.status, 'ready'), sql`(${miradorVideos.reports} > 0 or ${miradorVideos.removedReason} = 'reports')`, sql`${miradorVideos.removedReason} is distinct from 'creator'`))
    .orderBy(desc(miradorVideos.reports))
    .limit(100);
}

