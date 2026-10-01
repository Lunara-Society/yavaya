import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '@/server/db/client';
import {
  communityPosts,
  communityReplies,
  communitySupports,
  enforcementRecords,
  locations,
  moderationActions,
  reports,
  tickets,
  users,
} from '@/server/db/schema';
import { COMMUNITY_RULES } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { chargeForAction } from '@/server/domains/tokens/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { applyRule } from '@/server/domains/reputation/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { OPEN_TICKET_STATUSES, openTicketFor } from '@/server/domains/moderation/tickets';
import { dayKey, notify } from '@/server/domains/notifications/service';

/**
 * Community: the town square — local help, the prayer wall, family support.
 *
 * Free to use: posting is declared billable at zero cost
 * (`community.publish_request`), which records no ledger entry at all.
 * Every change is audited in the same transaction as the change.
 */

export const POST_KINDS = ['help_request', 'help_offer', 'prayer', 'family_support'] as const;
export type PostKind = (typeof POST_KINDS)[number];
/**
 * What the Community square lists. Prayer posts are written to the same
 * table but live in the Sanctuary's prayer wall, next to the churches.
 */
export const NEIGHBOUR_KINDS: readonly PostKind[] = ['help_request', 'help_offer', 'family_support'];
/** Kinds where a name may be hidden from other members. Asking for a neighbour's hand is not one of them. */
export const DISCREET_KINDS: readonly PostKind[] = ['prayer', 'family_support'];
/** Kinds answered with "I'm with you" rather than, or as well as, replies. */
export const SUPPORT_KINDS: readonly PostKind[] = ['prayer', 'family_support'];

export const COMMUNITY_REPORT_CATEGORIES = ['harassment', 'scam', 'spam', 'fraud', 'other'] as const;
export type CommunityReportCategory = (typeof COMMUNITY_REPORT_CATEGORIES)[number];

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

export const postInputSchema = z.object({
  kind: z.enum(POST_KINDS, { message: 'community.error.kind' }),
  title: text(COMMUNITY_RULES.titleMinLength, COMMUNITY_RULES.titleMaxLength, 'community.error.title'),
  body: text(COMMUNITY_RULES.bodyMinLength, COMMUNITY_RULES.bodyMaxLength, 'community.error.body'),
  locationId: z.string().uuid().nullable(),
  anonymous: z.boolean(),
});
export type PostInput = z.output<typeof postInputSchema>;

export const replyInputSchema = text(COMMUNITY_RULES.replyMinLength, COMMUNITY_RULES.replyMaxLength, 'community.error.reply');

async function activeMember(executor: Executor, userId: string): Promise<void> {
  const [user] = await executor.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'community.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'community.error.account_restricted');
}

export async function createPost(
  tx: Executor,
  params: { authorUserId: string; input: PostInput; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.authorUserId);
  const { input } = params;
  if (input.kind !== 'prayer' && !input.locationId) throw errors.validation('community.error.location');
  if (input.locationId) {
    const [place] = await tx
      .select({ active: locations.isActive })
      .from(locations)
      .where(eq(locations.id, input.locationId))
      .limit(1);
    if (!place?.active) throw errors.validation('community.error.location');
  }
  const anonymous = input.anonymous && DISCREET_KINDS.includes(input.kind);

  const [post] = await tx
    .insert(communityPosts)
    .values({
      authorUserId: params.authorUserId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      locationId: input.locationId,
      anonymous,
    })
    .returning({ id: communityPosts.id });
  const postId = post!.id;

  // Free, and recorded as free: a zero-cost action writes nothing to the ledger.
  await chargeForAction(tx, {
    userId: params.authorUserId,
    actionKey: 'community.publish_request',
    idempotencyKey: `community.post:${postId}:publish`,
    relatedType: 'community_post',
    relatedId: postId,
  });

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: 'community.post_published',
    subjectType: 'community_post',
    subjectId: postId,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { kind: input.kind, anonymous },
  });
  return postId;
}

// --- Reading -----------------------------------------------------------------

export type PostView = {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  status: string;
  anonymous: boolean;
  /** Null when the author chose discretion and the viewer is not the author. */
  author: { displayName: string; yayId: string } | null;
  isAuthor: boolean;
  placeName: string | null;
  supportCount: number;
  replyCount: number;
  supportedByViewer: boolean;
  createdAt: Date;
};

function localized(name: string | null, names: unknown, locale: string): string | null {
  if (!name) return null;
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

const postColumns = {
  id: communityPosts.id,
  kind: communityPosts.kind,
  title: communityPosts.title,
  body: communityPosts.body,
  status: communityPosts.status,
  anonymous: communityPosts.anonymous,
  authorUserId: communityPosts.authorUserId,
  authorName: users.displayName,
  authorYayId: users.yayId,
  placeName: locations.name,
  placeNames: locations.names,
  supportCount: communityPosts.supportCount,
  replyCount: communityPosts.replyCount,
  createdAt: communityPosts.createdAt,
};

type PostRow = { [K in keyof typeof postColumns]: unknown } & Record<string, unknown>;

function toView(row: PostRow, viewerId: string, supported: Set<string>, locale: string): PostView {
  const isAuthor = row.authorUserId === viewerId;
  return {
    id: row.id as string,
    kind: row.kind as PostKind,
    title: row.title as string,
    body: row.body as string,
    status: row.status as string,
    anonymous: row.anonymous as boolean,
    author:
      row.anonymous && !isAuthor
        ? null
        : { displayName: row.authorName as string, yayId: formatYayId(row.authorYayId as string) },
    isAuthor,
    placeName: localized(row.placeName as string | null, row.placeNames, locale),
    supportCount: row.supportCount as number,
    replyCount: row.replyCount as number,
    supportedByViewer: supported.has(row.id as string),
    createdAt: row.createdAt as Date,
  };
}

async function supportedSet(executor: Executor, viewerId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await executor
    .select({ postId: communitySupports.postId })
    .from(communitySupports)
    .where(and(eq(communitySupports.userId, viewerId), inArray(communitySupports.postId, postIds)));
  return new Set(rows.map((row) => row.postId));
}

/** The square, newest first. Only open and resolved posts; nothing removed. */
export async function listPosts(
  executor: Executor,
  params: { viewerId: string; kind?: PostKind; kinds?: readonly PostKind[]; page?: number; locale: string },
): Promise<{ items: PostView[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const size = COMMUNITY_RULES.pageSize;
  const conditions = [inArray(communityPosts.status, ['open', 'resolved'])];
  if (params.kind) conditions.push(eq(communityPosts.kind, params.kind));
  else if (params.kinds) conditions.push(inArray(communityPosts.kind, [...params.kinds]));
  const rows = await executor
    .select(postColumns)
    .from(communityPosts)
    .innerJoin(users, eq(users.id, communityPosts.authorUserId))
    .leftJoin(locations, eq(locations.id, communityPosts.locationId))
    .where(and(...conditions))
    // Open before resolved, so what still needs someone comes first.
    .orderBy(sql`(${communityPosts.status} = 'resolved')`, desc(communityPosts.createdAt))
    .limit(size + 1)
    .offset((page - 1) * size);
  const supported = await supportedSet(executor, params.viewerId, rows.map((row) => row.id));
  return {
    items: rows.slice(0, size).map((row) => toView(row, params.viewerId, supported, params.locale)),
    hasMore: rows.length > size,
    page,
  };
}

export type ReplyView = { id: string; body: string; author: { displayName: string; yayId: string }; isAuthor: boolean; createdAt: Date };

/**
 * One post with its replies. Withdrawn and removed posts are visible to
 * their author and to moderators only.
 */
export async function getPost(
  executor: Executor,
  params: { postId: string; viewerId: string; viewerIsModerator: boolean; locale: string },
): Promise<{ post: PostView; replies: ReplyView[] } | null> {
  const [row] = await executor
    .select(postColumns)
    .from(communityPosts)
    .innerJoin(users, eq(users.id, communityPosts.authorUserId))
    .leftJoin(locations, eq(locations.id, communityPosts.locationId))
    .where(eq(communityPosts.id, params.postId))
    .limit(1);
  if (!row) return null;
  const visible =
    row.status === 'open' || row.status === 'resolved' || row.authorUserId === params.viewerId || params.viewerIsModerator;
  if (!visible) return null;

  const [supported, replyRows] = await Promise.all([
    supportedSet(executor, params.viewerId, [row.id]),
    executor
      .select({
        id: communityReplies.id,
        body: communityReplies.body,
        authorUserId: communityReplies.authorUserId,
        authorName: users.displayName,
        authorYayId: users.yayId,
        createdAt: communityReplies.createdAt,
      })
      .from(communityReplies)
      .innerJoin(users, eq(users.id, communityReplies.authorUserId))
      .where(and(eq(communityReplies.postId, row.id), eq(communityReplies.status, 'visible')))
      .orderBy(communityReplies.createdAt),
  ]);
  return {
    post: toView(row, params.viewerId, supported, params.locale),
    replies: replyRows.map((reply) => ({
      id: reply.id,
      body: reply.body,
      author: { displayName: reply.authorName, yayId: formatYayId(reply.authorYayId) },
      isAuthor: reply.authorUserId === params.viewerId,
      createdAt: reply.createdAt,
    })),
  };
}

// --- Responding --------------------------------------------------------------

async function lockOpenPost(tx: Executor, postId: string) {
  const [post] = await tx
    .select({ status: communityPosts.status, authorUserId: communityPosts.authorUserId, kind: communityPosts.kind, title: communityPosts.title })
    .from(communityPosts)
    .where(eq(communityPosts.id, postId))
    .limit(1)
    .for('update');
  if (!post || (post.status !== 'open' && post.status !== 'resolved')) throw errors.notFound('community_post');
  return post;
}

export async function addReply(
  tx: Executor,
  params: { postId: string; authorUserId: string; body: string; audit?: AuditContext },
): Promise<string> {
  await activeMember(tx, params.authorUserId);
  const post = await lockOpenPost(tx, params.postId);
  if (post.status !== 'open') throw errors.conflict('community.error.closed');
  const [reply] = await tx
    .insert(communityReplies)
    .values({ postId: params.postId, authorUserId: params.authorUserId, body: params.body })
    .returning({ id: communityReplies.id });
  await tx
    .update(communityPosts)
    .set({ replyCount: sql`${communityPosts.replyCount} + 1`, updatedAt: new Date() })
    .where(eq(communityPosts.id, params.postId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: 'community.reply_posted',
    subjectType: 'community_post',
    subjectId: params.postId,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
  if (post.authorUserId !== params.authorUserId) {
    // The reply is the news; who wrote it is on the post itself.
    await notify(tx, [
      {
        userId: post.authorUserId,
        category: 'community',
        type: 'community.reply',
        titleKey: 'notify.community.reply',
        params: { title: post.title },
        href: `/community/${params.postId}#replies`,
        subjectId: params.postId,
      },
    ]);
  }
  return reply!.id;
}

/** "I'm with you": pressing it again takes it back. One per member per post. */
export async function toggleSupport(
  tx: Executor,
  params: { postId: string; userId: string },
): Promise<{ supported: boolean }> {
  await activeMember(tx, params.userId);
  const post = await lockOpenPost(tx, params.postId);
  if (!SUPPORT_KINDS.includes(post.kind)) throw errors.validation('community.error.kind');
  const removed = await tx
    .delete(communitySupports)
    .where(and(eq(communitySupports.postId, params.postId), eq(communitySupports.userId, params.userId)))
    .returning({ postId: communitySupports.postId });
  if (removed.length > 0) {
    await tx
      .update(communityPosts)
      .set({ supportCount: sql`greatest(${communityPosts.supportCount} - 1, 0)` })
      .where(eq(communityPosts.id, params.postId));
    return { supported: false };
  }
  await tx.insert(communitySupports).values({ postId: params.postId, userId: params.userId });
  await tx
    .update(communityPosts)
    .set({ supportCount: sql`${communityPosts.supportCount} + 1` })
    .where(eq(communityPosts.id, params.postId));
  if (post.authorUserId !== params.userId) {
    // At most one a day per post: a prayer answered by twenty people is one
    // quiet message, not twenty. Never says who; the post shows only a count.
    await notify(tx, [
      {
        userId: post.authorUserId,
        category: 'community',
        type: 'community.support',
        titleKey: 'notify.community.support',
        params: { title: post.title },
        href: `/community/${params.postId}`,
        dedupeKey: `community.support:${params.postId}:${dayKey()}`,
        subjectId: params.postId,
      },
    ]);
  }
  return { supported: true };
}

/** The author marks it answered, or takes it down. */
export async function closePost(
  tx: Executor,
  params: { postId: string; authorUserId: string; outcome: 'resolved' | 'withdrawn'; audit?: AuditContext },
): Promise<void> {
  const [post] = await tx
    .select({ status: communityPosts.status, authorUserId: communityPosts.authorUserId })
    .from(communityPosts)
    .where(eq(communityPosts.id, params.postId))
    .limit(1)
    .for('update');
  if (!post || post.authorUserId !== params.authorUserId) throw errors.notFound('community_post');
  if (post.status !== 'open' && !(post.status === 'resolved' && params.outcome === 'withdrawn')) {
    throw errors.conflict('community.error.closed');
  }
  await tx
    .update(communityPosts)
    .set({ status: params.outcome, closedAt: new Date(), updatedAt: new Date() })
    .where(eq(communityPosts.id, params.postId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.authorUserId,
    action: params.outcome === 'resolved' ? 'community.post_resolved' : 'community.post_withdrawn',
    subjectType: 'community_post',
    subjectId: params.postId,
    district: 'community',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
}

// --- Reports and moderation ----------------------------------------------------

const SUBJECT = 'community_post';

export async function reportPost(
  tx: Executor,
  params: { postId: string; reporterUserId: string; category: CommunityReportCategory; description: string | null; replyId?: string | null },
): Promise<{ ticketCode: string; duplicate: boolean }> {
  const post = await lockOpenPost(tx, params.postId);
  if (post.authorUserId === params.reporterUserId && !params.replyId) throw errors.validation('community.report.error.own');

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

  // Harassment of someone at their most vulnerable is urgent, not normal.
  const priority = params.category === 'harassment' || params.category === 'scam' ? 'high' : 'normal';
  const ticketId = await openTicketFor(tx, { subjectType: SUBJECT, subjectId: params.postId, category: params.category, priority });
  await tx.insert(reports).values({
    reporterUserId: params.reporterUserId,
    subjectType: SUBJECT,
    subjectId: params.postId,
    district: 'community',
    category: params.category,
    description: params.description,
    evidence: params.replyId ? [{ type: 'community_reply', ref: params.replyId }] : [],
    ticketId,
  });
  const [ticket] = await tx.select({ code: tickets.code }).from(tickets).where(eq(tickets.id, ticketId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.reporterUserId,
    action: 'community.post_reported',
    subjectType: SUBJECT,
    subjectId: params.postId,
    district: 'community',
    metadata: { category: params.category, ticketId, reply: params.replyId ?? null },
  });
  return { ticketCode: ticket!.code, duplicate: false };
}

export type CommunityQueueItem = {
  ticketId: string;
  ticketCode: string;
  priority: string;
  createdAt: Date;
  post: { id: string; title: string; body: string; kind: PostKind; status: string };
  author: { displayName: string; yayId: string };
  reports: Array<{ category: string; description: string | null; replyBody: string | null }>;
};

export async function communityQueue(executor: Executor, actor: AuthContext | null): Promise<CommunityQueueItem[]> {
  await requirePermission(executor, actor, 'moderation.queue.read');
  const rows = await executor
    .select({
      ticketId: tickets.id,
      ticketCode: tickets.code,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      postId: communityPosts.id,
      title: communityPosts.title,
      body: communityPosts.body,
      kind: communityPosts.kind,
      status: communityPosts.status,
      authorName: users.displayName,
      authorYayId: users.yayId,
    })
    .from(tickets)
    .innerJoin(communityPosts, sql`${communityPosts.id}::text = ${tickets.subjectId}`)
    .innerJoin(users, eq(users.id, communityPosts.authorUserId))
    .where(and(eq(tickets.subjectType, SUBJECT), inArray(tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, tickets.createdAt)
    .limit(100);

  const ticketIds = rows.map((row) => row.ticketId);
  const reportRows = ticketIds.length
    ? await executor
        .select({ ticketId: reports.ticketId, category: reports.category, description: reports.description, evidence: reports.evidence })
        .from(reports)
        .where(inArray(reports.ticketId, ticketIds))
    : [];
  const replyIds = reportRows.flatMap((row) => row.evidence.filter((item) => item.type === 'community_reply').map((item) => item.ref));
  const replyRows = replyIds.length
    ? await executor.select({ id: communityReplies.id, body: communityReplies.body }).from(communityReplies).where(inArray(communityReplies.id, replyIds))
    : [];

  return rows.map((row) => ({
    ticketId: row.ticketId,
    ticketCode: row.ticketCode,
    priority: row.priority,
    createdAt: row.createdAt,
    post: { id: row.postId, title: row.title, body: row.body, kind: row.kind, status: row.status },
    author: { displayName: row.authorName, yayId: formatYayId(row.authorYayId) },
    reports: reportRows
      .filter((report) => report.ticketId === row.ticketId)
      .map((report) => {
        const replyRef = report.evidence.find((item) => item.type === 'community_reply')?.ref;
        return {
          category: report.category,
          description: report.description,
          replyBody: replyRef ? (replyRows.find((reply) => reply.id === replyRef)?.body ?? null) : null,
        };
      }),
  }));
}

export const COMMUNITY_DECISIONS = ['dismiss', 'remove_post', 'remove_replies', 'warn'] as const;
export type CommunityDecision = (typeof COMMUNITY_DECISIONS)[number];

/**
 * - dismiss: nothing wrong.
 * - remove_post: the post comes down.
 * - remove_replies: the reported replies come down; the post stays.
 * - warn: the post comes down, and its author is warned with the penalty.
 */
export async function resolveCommunityTicket(
  tx: Executor,
  params: { actor: AuthContext | null; ticketId: string; decision: CommunityDecision; note: string | null },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'moderation.content.remove');
  const [ticket] = await tx
    .select({ id: tickets.id, subjectId: tickets.subjectId, status: tickets.status, category: tickets.category })
    .from(tickets)
    .where(and(eq(tickets.id, params.ticketId), eq(tickets.subjectType, SUBJECT)))
    .limit(1)
    .for('update');
  if (!ticket) throw errors.notFound('ticket');
  if (!(OPEN_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw errors.conflict('moderation.error.closed');

  const [post] = await tx
    .select({ id: communityPosts.id, authorUserId: communityPosts.authorUserId })
    .from(communityPosts)
    .where(eq(communityPosts.id, ticket.subjectId))
    .limit(1)
    .for('update');
  if (!post) throw errors.notFound('community_post');
  if (post.authorUserId === actor.userId) throw errors.forbidden('moderation.content.remove');

  if (params.decision === 'remove_post' || params.decision === 'warn') {
    await tx
      .update(communityPosts)
      .set({ status: 'removed', removedBy: actor.userId, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(communityPosts.id, post.id));
  }
  if (params.decision === 'remove_replies') {
    const reported = await tx.select({ evidence: reports.evidence }).from(reports).where(eq(reports.ticketId, ticket.id));
    const replyIds = reported.flatMap((row) => row.evidence.filter((item) => item.type === 'community_reply').map((item) => item.ref));
    if (replyIds.length > 0) {
      const removed = await tx
        .update(communityReplies)
        .set({ status: 'removed', removedBy: actor.userId })
        .where(and(inArray(communityReplies.id, replyIds), eq(communityReplies.status, 'visible')))
        .returning({ id: communityReplies.id });
      await tx
        .update(communityPosts)
        .set({ replyCount: sql`greatest(${communityPosts.replyCount} - ${removed.length}, 0)` })
        .where(eq(communityPosts.id, post.id));
    }
  }
  if (params.decision === 'warn') {
    await tx.insert(enforcementRecords).values({
      userId: post.authorUserId,
      type: 'warning',
      reasonCategory: ticket.category === 'harassment' ? 'harassment' : ticket.category === 'spam' ? 'spam' : 'other',
      internalNote: params.note,
      issuedBy: actor.userId,
    });
    await applyRule(tx, {
      userId: post.authorUserId,
      ruleKey: 'warning_issued',
      source: 'moderation',
      idempotencyKey: `moderation.ticket:${ticket.id}:warn`,
      relatedType: SUBJECT,
      relatedId: post.id,
    });
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
  await tx.insert(moderationActions).values({ ticketId: ticket.id, actorUserId: actor.userId, action: `community_${params.decision}`, internalNote: params.note });
  if (params.decision === 'remove_post' || params.decision === 'warn') {
    await notify(tx, [
      {
        userId: post.authorUserId,
        category: 'moderation',
        type: `community.${params.decision}`,
        titleKey: params.decision === 'warn' ? 'notify.moderation.warned' : 'notify.moderation.post_removed',
        href: '/community',
      },
    ]);
  }
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `moderation.community_${params.decision}`,
    subjectType: SUBJECT,
    subjectId: post.id,
    district: 'community',
    metadata: { ticketId: ticket.id },
  });
}
