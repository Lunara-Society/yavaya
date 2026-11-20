import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { miradorBlocks, miradorComments, miradorFollows, miradorLikes, miradorPreferences, miradorSaves, miradorVideos, miradorViews, users, userProfiles } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { notify } from '@/server/domains/notifications/service';
import { cleanComment, hashtagsOf } from './text';

/**
 * What members do with a video (docs/mirador/README.md, "Interactions"):
 * like, save, share, comment, follow its creator, block one, and the views
 * that rank it. Every counter moves in the same transaction as the row that
 * justifies it, so a count is always the number of real rows behind it.
 *
 * Doing a thing twice is doing it once (a second like is no like), and a
 * creator's own actions never count for their own video: no self-likes, no
 * self-views in the ranking.
 */

async function liveVideo(executor: Executor, videoId: string) {
  const [row] = await executor
    .select({ id: miradorVideos.id, creatorUserId: miradorVideos.creatorUserId, durationMs: miradorVideos.durationMs, caption: miradorVideos.caption })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, videoId), eq(miradorVideos.status, 'ready'), sql`${miradorVideos.publishedAt} is not null`, isNull(miradorVideos.removedAt)))
    .limit(1);
  if (!row) throw errors.notFound('mirador_video');
  return row;
}

async function blockedBetween(executor: Executor, a: string, b: string): Promise<boolean> {
  const [row] = await executor
    .select({ x: miradorBlocks.blockerUserId })
    .from(miradorBlocks)
    .where(sql`(${miradorBlocks.blockerUserId} = ${a} and ${miradorBlocks.blockedUserId} = ${b}) or (${miradorBlocks.blockerUserId} = ${b} and ${miradorBlocks.blockedUserId} = ${a})`)
    .limit(1);
  return Boolean(row);
}

type Counter = 'likes' | 'saves' | 'shares' | 'comments' | 'linkOpens';
async function bump(tx: Executor, videoId: string, counter: Counter, by: 1 | -1) {
  const column = miradorVideos[counter];
  await tx
    .update(miradorVideos)
    .set({ [counter]: sql`greatest(0, ${column} + ${by})` })
    .where(eq(miradorVideos.id, videoId));
}

export async function setLike(tx: Executor, params: { userId: string; videoId: string; on: boolean }): Promise<{ liked: boolean }> {
  const video = await liveVideo(tx, params.videoId);
  if (params.on) {
    if (await blockedBetween(tx, params.userId, video.creatorUserId)) throw errors.notFound('mirador_video');
    const added = await tx.insert(miradorLikes).values({ videoId: video.id, userId: params.userId }).onConflictDoNothing().returning({ id: miradorLikes.videoId });
    if (added.length && params.userId !== video.creatorUserId) await bump(tx, video.id, 'likes', 1);
    return { liked: true };
  }
  const removed = await tx.delete(miradorLikes).where(and(eq(miradorLikes.videoId, video.id), eq(miradorLikes.userId, params.userId))).returning({ id: miradorLikes.videoId });
  if (removed.length && params.userId !== video.creatorUserId) await bump(tx, video.id, 'likes', -1);
  return { liked: false };
}

export async function setSave(tx: Executor, params: { userId: string; videoId: string; on: boolean }): Promise<{ saved: boolean }> {
  const video = await liveVideo(tx, params.videoId);
  if (params.on) {
    const added = await tx.insert(miradorSaves).values({ videoId: video.id, userId: params.userId }).onConflictDoNothing().returning({ id: miradorSaves.videoId });
    if (added.length && params.userId !== video.creatorUserId) await bump(tx, video.id, 'saves', 1);
    return { saved: true };
  }
  const removed = await tx.delete(miradorSaves).where(and(eq(miradorSaves.videoId, video.id), eq(miradorSaves.userId, params.userId))).returning({ id: miradorSaves.videoId });
  if (removed.length && params.userId !== video.creatorUserId) await bump(tx, video.id, 'saves', -1);
  return { saved: false };
}

/** A share sent: counted once per viewer per video per day, and only from someone who watched it today. */
export async function countShare(tx: Executor, params: { viewerKey: string; userId: string | null; videoId: string }): Promise<void> {
  const video = await liveVideo(tx, params.videoId);
  if (params.userId === video.creatorUserId) return;
  const day = new Date().toISOString().slice(0, 10);
  const marked = await tx
    .update(miradorViews)
    .set({ shared: true })
    .where(and(eq(miradorViews.videoId, video.id), eq(miradorViews.viewerKey, params.viewerKey), eq(miradorViews.day, day), eq(miradorViews.shared, false)))
    .returning({ id: miradorViews.videoId });
  if (marked.length) await bump(tx, video.id, 'shares', 1);
}

/** A tap on the video's link (the creator's "clics al producto"). */
export async function countLinkOpen(tx: Executor, params: { userId: string | null; videoId: string }): Promise<void> {
  const video = await liveVideo(tx, params.videoId);
  if (params.userId !== video.creatorUserId) await bump(tx, video.id, 'linkOpens', 1);
}

export async function setFollow(tx: Executor, params: { userId: string; creatorUserId: string; on: boolean }): Promise<{ following: boolean }> {
  if (params.userId === params.creatorUserId) throw errors.validation('mirador.error.follow_self');
  if (params.on) {
    if (await blockedBetween(tx, params.userId, params.creatorUserId)) throw errors.notFound('user');
    const added = await tx.insert(miradorFollows).values({ followerUserId: params.userId, creatorUserId: params.creatorUserId }).onConflictDoNothing().returning({ id: miradorFollows.creatorUserId });
    if (added.length) {
      const [follower] = await tx.select({ name: users.displayName, yayId: users.yayId }).from(users).where(eq(users.id, params.userId)).limit(1);
      await notify(tx, [
        {
          userId: params.creatorUserId,
          category: 'mirador',
          type: 'mirador.follow',
          titleKey: 'mirador.notify.follow',
          params: { name: follower?.name ?? '' },
          href: follower ? `/mirador/creador/${follower.yayId}` : '/mirador',
          dedupeKey: `mirador.follow:${params.userId}:${params.creatorUserId}`,
        },
      ]);
    }
    return { following: true };
  }
  await tx.delete(miradorFollows).where(and(eq(miradorFollows.followerUserId, params.userId), eq(miradorFollows.creatorUserId, params.creatorUserId)));
  return { following: false };
}

/** Blocking hides each from the other in Mirador, and ends any follow between them. */
export async function setBlock(tx: Executor, params: { userId: string; otherUserId: string; on: boolean }): Promise<{ blocked: boolean }> {
  if (params.userId === params.otherUserId) throw errors.validation('mirador.error.block_self');
  if (params.on) {
    await tx.insert(miradorBlocks).values({ blockerUserId: params.userId, blockedUserId: params.otherUserId }).onConflictDoNothing();
    await tx
      .delete(miradorFollows)
      .where(
        sql`(${miradorFollows.followerUserId} = ${params.userId} and ${miradorFollows.creatorUserId} = ${params.otherUserId}) or (${miradorFollows.followerUserId} = ${params.otherUserId} and ${miradorFollows.creatorUserId} = ${params.userId})`,
      );
    return { blocked: true };
  }
  await tx.delete(miradorBlocks).where(and(eq(miradorBlocks.blockerUserId, params.userId), eq(miradorBlocks.blockedUserId, params.otherUserId)));
  return { blocked: false };
}

export type CommentView = { id: string; parentId: string | null; body: string; createdAt: string; author: { id: string; name: string; yayId: string; avatar: string | null }; own: boolean; canRemove: boolean };

export async function listComments(executor: Executor, params: { videoId: string; viewerId: string | null }): Promise<CommentView[]> {
  const video = await liveVideo(executor, params.videoId);
  const rows = await executor
    .select({ comment: miradorComments, name: users.displayName, yayId: users.yayId, avatar: userProfiles.avatarMediaId })
    .from(miradorComments)
    .innerJoin(users, eq(users.id, miradorComments.authorUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, miradorComments.authorUserId))
    .where(
      and(
        eq(miradorComments.videoId, video.id),
        eq(miradorComments.status, 'visible'),
        ...(params.viewerId
          ? [sql`not exists (select 1 from mirador_blocks b where (b.blocker_user_id = ${params.viewerId} and b.blocked_user_id = ${miradorComments.authorUserId}) or (b.blocker_user_id = ${miradorComments.authorUserId} and b.blocked_user_id = ${params.viewerId}))`]
          : []),
      ),
    )
    .orderBy(asc(miradorComments.createdAt))
    .limit(200);
  return rows.map(({ comment, name, yayId, avatar }) => ({
    id: comment.id,
    parentId: comment.parentId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: { id: comment.authorUserId, name, yayId, avatar: avatar ? `/media/${avatar}` : null },
    own: comment.authorUserId === params.viewerId,
    // The author, and the creator of the video on their own video, may take a comment down.
    canRemove: comment.authorUserId === params.viewerId || video.creatorUserId === params.viewerId,
  }));
}

export async function addComment(tx: Executor, params: { userId: string; videoId: string; body: unknown; parentId?: string | null }): Promise<{ id: string }> {
  const video = await liveVideo(tx, params.videoId);
  const body = cleanComment(params.body);
  if (!body) throw errors.validation('mirador.error.comment_empty');
  if (await blockedBetween(tx, params.userId, video.creatorUserId)) throw errors.notFound('mirador_video');
  let parent: { id: string; authorUserId: string } | null = null;
  if (params.parentId) {
    const [row] = await tx
      .select({ id: miradorComments.id, authorUserId: miradorComments.authorUserId, parentId: miradorComments.parentId })
      .from(miradorComments)
      .where(and(eq(miradorComments.id, params.parentId), eq(miradorComments.videoId, video.id), eq(miradorComments.status, 'visible')))
      .limit(1);
    if (!row) throw errors.validation('mirador.error.comment_parent');
    // One level of replies: answering a reply answers its thread.
    parent = row.parentId ? { id: row.parentId, authorUserId: row.authorUserId } : row;
  }
  const [row] = await tx.insert(miradorComments).values({ videoId: video.id, authorUserId: params.userId, parentId: parent?.id ?? null, body }).returning({ id: miradorComments.id });
  await bump(tx, video.id, 'comments', 1);
  const [author] = await tx.select({ name: users.displayName }).from(users).where(eq(users.id, params.userId)).limit(1);
  const href = `/mirador/v/${video.id}?comentarios=1`;
  const news = [];
  if (video.creatorUserId !== params.userId) {
    news.push({ userId: video.creatorUserId, category: 'mirador' as const, type: 'mirador.comment', titleKey: 'mirador.notify.comment', params: { name: author?.name ?? '' }, href, dedupeKey: `mirador.comment:${row!.id}`, subjectId: video.id });
  }
  if (parent && parent.authorUserId !== params.userId && parent.authorUserId !== video.creatorUserId) {
    news.push({ userId: parent.authorUserId, category: 'mirador' as const, type: 'mirador.reply', titleKey: 'mirador.notify.reply', params: { name: author?.name ?? '' }, href, dedupeKey: `mirador.reply:${row!.id}`, subjectId: video.id });
  }
  await notify(tx, news);
  return { id: row!.id };
}

export async function removeComment(tx: Executor, params: { userId: string; commentId: string }): Promise<void> {
  const [row] = await tx
    .select({ id: miradorComments.id, videoId: miradorComments.videoId, author: miradorComments.authorUserId, status: miradorComments.status, creator: miradorVideos.creatorUserId })
    .from(miradorComments)
    .innerJoin(miradorVideos, eq(miradorVideos.id, miradorComments.videoId))
    .where(eq(miradorComments.id, params.commentId))
    .for('update', { of: miradorComments })
    .limit(1);
  if (!row || row.status !== 'visible') throw errors.notFound('mirador_comment');
  if (row.author !== params.userId && row.creator !== params.userId) throw errors.forbidden();
  await tx.update(miradorComments).set({ status: 'removed' }).where(eq(miradorComments.id, row.id));
  await bump(tx, row.videoId, 'comments', -1);
}

/**
 * How much of a video one viewer watched today. The first report of the day
 * is the view (counted once, however often they come back); watching it to
 * the end, once a day, is a completion; coming back is a replay. A creator
 * watching their own video counts for nothing.
 */
export async function recordView(
  tx: Executor,
  params: { videoId: string; viewerKey: string; userId: string | null; watchedMs: number; replay?: boolean; now?: Date },
): Promise<void> {
  const video = await liveVideo(tx, params.videoId);
  if (params.userId && params.userId === video.creatorUserId) return;
  const now = params.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const duration = video.durationMs ?? 0;
  const watched = Math.max(0, Math.min(Math.round(params.watchedMs), duration > 0 ? duration * 4 : 600_000));
  const completed = duration > 0 && watched >= duration * MIRADOR_RULES.completionShare;
  const [before] = await tx
    .select({ completed: miradorViews.completed })
    .from(miradorViews)
    .where(and(eq(miradorViews.videoId, video.id), eq(miradorViews.viewerKey, params.viewerKey), eq(miradorViews.day, day)))
    .for('update')
    .limit(1);
  if (!before) {
    const inserted = await tx
      .insert(miradorViews)
      .values({ videoId: video.id, viewerKey: params.viewerKey, userId: params.userId, day, watchedMs: watched, completed, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: miradorViews.videoId });
    if (inserted.length) {
      await tx
        .update(miradorVideos)
        .set({ views: sql`${miradorVideos.views} + 1`, completions: completed ? sql`${miradorVideos.completions} + 1` : miradorVideos.completions })
        .where(eq(miradorVideos.id, video.id));
    }
    return;
  }
  await tx
    .update(miradorViews)
    .set({
      watchedMs: sql`greatest(${miradorViews.watchedMs}, ${watched})`,
      completed: before.completed || completed,
      replays: params.replay ? sql`least(${miradorViews.replays} + 1, 1000)` : miradorViews.replays,
      updatedAt: now,
    })
    .where(and(eq(miradorViews.videoId, video.id), eq(miradorViews.viewerKey, params.viewerKey), eq(miradorViews.day, day)));
  if (completed && !before.completed) await tx.update(miradorVideos).set({ completions: sql`${miradorVideos.completions} + 1` }).where(eq(miradorVideos.id, video.id));
}

/** The member's own say over Para ti: the hashtags they chose, or starting it over. */
export async function setPreferences(tx: Executor, params: { userId: string; interests?: unknown; reset?: boolean; now?: Date }): Promise<{ interests: string[] }> {
  const now = params.now ?? new Date();
  const interests = params.reset ? [] : hashtagsOf('', params.interests);
  await tx
    .insert(miradorPreferences)
    .values({ userId: params.userId, interests, resetAt: params.reset ? now : null, updatedAt: now })
    .onConflictDoUpdate({
      target: miradorPreferences.userId,
      set: { interests, updatedAt: now, ...(params.reset ? { resetAt: now } : {}) },
    });
  return { interests };
}

/** The members a member blocked in Mirador, for the place they can undo it. */
export async function myBlocks(executor: Executor, userId: string) {
  return executor
    .select({ id: users.id, name: users.displayName, yayId: users.yayId })
    .from(miradorBlocks)
    .innerJoin(users, eq(users.id, miradorBlocks.blockedUserId))
    .where(eq(miradorBlocks.blockerUserId, userId))
    .limit(200);
}

/** Saved videos, newest saved first: ids for the feed cards. */
export async function savedIds(executor: Executor, userId: string): Promise<string[]> {
  const rows = await executor.select({ id: miradorSaves.videoId }).from(miradorSaves).where(eq(miradorSaves.userId, userId)).orderBy(sql`${miradorSaves.createdAt} desc`).limit(60);
  return rows.map((row) => row.id);
}

