import 'server-only';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations, miradorBlocks, miradorFollows, miradorLikes, miradorPreferences, miradorSaves, miradorVideos, userProfiles, users } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { linkFor, linkViews, type LinkView } from './links';

/**
 * What Mirador shows (docs/mirador/README.md, "Discovery").
 *
 * Six ways in, each one a plain rule a member could check:
 *
 * - **Para ti** — every published video, ranked by what it earned per view
 *   (likes, saves, shares, comments, watched to the end), fresher first, with
 *   a lift for videos near the viewer, from creators they follow, on the
 *   hashtags they chose, in their language. Videos they saw in the last week
 *   come after the ones they have not. Nothing else: no hidden boosts, no
 *   paid placement (there is none to buy yet), and a member can start it over.
 * - **Cerca** — videos from the viewer's place, newest first.
 * - **Siguiendo** — videos from the creators they follow, newest first.
 * - **Negocios** — videos that open a YavayaGo store or a provider's services.
 * - **Mercadito** — videos that open a listing still for sale.
 * - **Tendencias** — engagement in the last two days, from videos enough
 *   people actually watched.
 *
 * The weights are MIRADOR_RULES.ranking; with no data yet, Para ti is simply
 * the newest videos, nearest first — which is the truth.
 */
export const FEED_TABS = ['para_ti', 'cerca', 'siguiendo', 'negocios', 'mercadito', 'tendencias'] as const;
export type FeedTab = (typeof FEED_TABS)[number];

export function isFeedTab(value: unknown): value is FeedTab {
  return typeof value === 'string' && (FEED_TABS as readonly string[]).includes(value);
}

export type FeedVideo = {
  id: string;
  creator: { id: string; name: string; yayId: string; avatar: string | null };
  caption: string;
  hashtags: string[];
  place: string | null;
  district: string | null;
  source: 'upload' | 'ai';
  durationMs: number;
  width: number;
  height: number;
  media: { high: string; low: string; poster: string };
  counts: { likes: number; comments: number; saves: number; shares: number; views: number };
  liked: boolean;
  saved: boolean;
  following: boolean;
  own: boolean;
  link: LinkView | null;
  publishedAt: string;
  /** Why it is in Para ti, for "¿Por qué veo esto?": keys under `mirador.why.*`. */
  why: string[];
};

export const mediaUrls = (id: string) => ({ high: `/mirador/media/${id}/720.mp4`, low: `/mirador/media/${id}/360.mp4`, poster: `/mirador/media/${id}/poster.webp` });

/** Inside the chosen place, or anywhere: a place's own code or any place under it. */
function within(column: SQL | typeof miradorVideos.locationId, code: string): SQL {
  return sql`${column} in (select l.id from locations l where l.code = ${code} or ${code} = any(l.path))`;
}

const visible = and(eq(miradorVideos.status, 'ready'), sql`${miradorVideos.publishedAt} is not null`, isNull(miradorVideos.removedAt));

type Viewer = { userId: string | null; placeCode: string | null; language: string };

export async function feedPage(
  executor: Executor,
  params: { tab: FeedTab; viewer: Viewer; offset?: number; limit?: number; now?: Date },
): Promise<{ items: FeedVideo[]; next: number | null; needsPlace?: boolean }> {
  const { viewer } = params;
  const now = params.now ?? new Date();
  const limit = Math.min(params.limit ?? MIRADOR_RULES.feedPageSize, 20);
  const offset = Math.max(0, Math.min(params.offset ?? 0, 500));
  // The weights are numbers from configuration, written into the query as literals: as parameters, Postgres would type 1.5 as an integer.
  const w = Object.fromEntries(Object.entries(MIRADOR_RULES.ranking).map(([key, value]) => [key, sql.raw(Number(value).toFixed(4))])) as Record<keyof typeof MIRADOR_RULES.ranking, SQL>;
  const conditions: SQL[] = [visible!];

  if (viewer.userId) {
    // Creators the viewer blocked, and creators who blocked the viewer, are out of each other's Mirador.
    conditions.push(sql`not exists (select 1 from mirador_blocks b where (b.blocker_user_id = ${viewer.userId} and b.blocked_user_id = ${miradorVideos.creatorUserId}) or (b.blocker_user_id = ${miradorVideos.creatorUserId} and b.blocked_user_id = ${viewer.userId}))`);
  }

  const prefs = viewer.userId ? (await executor.select().from(miradorPreferences).where(eq(miradorPreferences.userId, viewer.userId)).limit(1))[0] : undefined;
  const since = prefs?.resetAt ?? new Date(0);
  const interests = prefs?.interests ?? [];

  const following = viewer.userId
    ? sql<boolean>`exists (select 1 from mirador_follows f where f.follower_user_id = ${viewer.userId} and f.creator_user_id = ${miradorVideos.creatorUserId})`
    : sql<boolean>`false`;
  const near = viewer.placeCode ? sql<boolean>`(${miradorVideos.locationId} is not null and ${within(miradorVideos.locationId, viewer.placeCode)})` : sql<boolean>`false`;
  const interest = interests.length ? sql<boolean>`(${miradorVideos.hashtags} && ${sql`array[${sql.join(interests.map((tag) => sql`${tag}`), sql`, `)}]::text[]`})` : sql<boolean>`false`;
  const sameLanguage = sql<boolean>`(${miradorVideos.language} = ${viewer.language})`;
  const seen = viewer.userId
    ? sql<boolean>`exists (select 1 from mirador_views v where v.video_id = ${miradorVideos.id} and v.user_id = ${viewer.userId} and v.day >= ${new Date(now.getTime() - MIRADOR_RULES.seenDays * 86_400_000).toISOString().slice(0, 10)}::date and v.updated_at > ${since.toISOString()})`
    : sql<boolean>`false`;
  const ageHours = sql`greatest(0, extract(epoch from (${now.toISOString()}::timestamptz - ${miradorVideos.publishedAt})) / 3600)`;
  const earned = sql`((${miradorVideos.likes} * ${w.like} + ${miradorVideos.saves} * ${w.save} + ${miradorVideos.shares} * ${w.share} + ${miradorVideos.comments} * ${w.comment} + ${miradorVideos.completions} * ${w.completion})::float / (${miradorVideos.views} + ${w.priorViews}) + 0.05)`;
  const score = sql<number>`${earned} / (1 + ${ageHours} / ${w.freshHours}) * (case when ${near} then ${w.near} else 1.0 end) * (case when ${following} then ${w.following} else 1.0 end) * (case when ${interest} then ${w.interest} else 1.0 end) * (case when ${sameLanguage} then ${w.language} else 1.0 end)`;

  let order: SQL[] = [sql`${miradorVideos.publishedAt} desc`];
  switch (params.tab) {
    case 'para_ti':
      // Seen-last only for a member: a signed-out visitor has no history, and a constant cannot be sorted on.
      order = [...(viewer.userId ? [sql`${seen} asc`] : []), sql`${score} desc`, sql`${miradorVideos.publishedAt} desc`];
      break;
    case 'cerca':
      if (!viewer.placeCode) return { items: [], next: null, needsPlace: true };
      conditions.push(sql`${miradorVideos.locationId} is not null`, within(miradorVideos.locationId, viewer.placeCode));
      break;
    case 'siguiendo':
      if (!viewer.userId) return { items: [], next: null };
      conditions.push(following);
      break;
    case 'negocios':
      conditions.push(
        sql`(${miradorVideos.linkType} = 'go_store' and exists (select 1 from go_stores s where s.id = ${miradorVideos.linkId} and s.owner_user_id = ${miradorVideos.creatorUserId} and s.status = 'approved'))
          or (${miradorVideos.linkType} = 'service_provider' and exists (select 1 from services_provider_profiles p where p.user_id = ${miradorVideos.creatorUserId} and p.status = 'active'))`,
      );
      break;
    case 'mercadito':
      conditions.push(sql`${miradorVideos.linkType} = 'mercadito_listing' and exists (select 1 from mercadito_listings l where l.id = ${miradorVideos.linkId} and l.seller_user_id = ${miradorVideos.creatorUserId} and l.status in ('published', 'reserved'))`);
      break;
    case 'tendencias': {
      const from = new Date(now.getTime() - MIRADOR_RULES.trendingHours * 3_600_000);
      const day = from.toISOString().slice(0, 10);
      const viewsIn = sql`(select count(*) from mirador_views v where v.video_id = ${miradorVideos.id} and v.day >= ${day}::date)`;
      const doneIn = sql`(select count(*) from mirador_views v where v.video_id = ${miradorVideos.id} and v.day >= ${day}::date and v.completed)`;
      const likesIn = sql`(select count(*) from mirador_likes x where x.video_id = ${miradorVideos.id} and x.created_at >= ${from.toISOString()})`;
      const savesIn = sql`(select count(*) from mirador_saves x where x.video_id = ${miradorVideos.id} and x.created_at >= ${from.toISOString()})`;
      const commentsIn = sql`(select count(*) from mirador_comments x where x.video_id = ${miradorVideos.id} and x.status = 'visible' and x.created_at >= ${from.toISOString()})`;
      conditions.push(sql`${viewsIn} >= ${MIRADOR_RULES.trendingMinViews}`);
      order = [sql`((${likesIn}) * ${w.like} + (${savesIn}) * ${w.save} + (${commentsIn}) * ${w.comment} + (${doneIn}) * ${w.completion})::float / ((${viewsIn}) + ${w.priorViews}) desc`, sql`${miradorVideos.publishedAt} desc`];
      break;
    }
  }

  const rows = await executor
    .select({ id: miradorVideos.id, following, near, interest, seen, ageHours: sql<number>`${ageHours}` })
    .from(miradorVideos)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(offset);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const why = new Map(
    page.map((row) => [
      row.id,
      [row.following && 'following', row.near && 'near', row.interest && 'interest', Number(row.ageHours) < 24 && 'new'].filter((reason): reason is string => Boolean(reason)),
    ]),
  );
  const items = await videosByIds(executor, { ids: page.map((row) => row.id), viewerId: viewer.userId, locale: viewer.language });
  for (const item of items) item.why = why.get(item.id) ?? [];
  return { items, next: more ? offset + limit : null };
}

/**
 * The feed cards for these videos, in this order, for this viewer: creator,
 * place, live link, and whether the viewer liked, saved or follows. Four
 * queries for any number of videos.
 */
export async function videosByIds(executor: Executor, params: { ids: string[]; viewerId: string | null; locale: string; includeHidden?: boolean }): Promise<FeedVideo[]> {
  if (params.ids.length === 0) return [];
  const rows = await executor
    .select({
      video: miradorVideos,
      name: users.displayName,
      yayId: users.yayId,
      avatar: userProfiles.avatarMediaId,
      place: sql<string | null>`coalesce(${locations.names} ->> ${params.locale}, ${locations.name})`,
    })
    .from(miradorVideos)
    .innerJoin(users, eq(users.id, miradorVideos.creatorUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, miradorVideos.creatorUserId))
    .leftJoin(locations, eq(locations.id, miradorVideos.locationId))
    .where(params.includeHidden ? inArray(miradorVideos.id, params.ids) : and(inArray(miradorVideos.id, params.ids), visible));

  const viewer = params.viewerId;
  const [liked, saved, follows, links] = await Promise.all([
    viewer ? executor.select({ id: miradorLikes.videoId }).from(miradorLikes).where(and(eq(miradorLikes.userId, viewer), inArray(miradorLikes.videoId, params.ids))) : [],
    viewer ? executor.select({ id: miradorSaves.videoId }).from(miradorSaves).where(and(eq(miradorSaves.userId, viewer), inArray(miradorSaves.videoId, params.ids))) : [],
    viewer
      ? executor
          .select({ id: miradorFollows.creatorUserId })
          .from(miradorFollows)
          .where(and(eq(miradorFollows.followerUserId, viewer), inArray(miradorFollows.creatorUserId, rows.map((row) => row.video.creatorUserId))))
      : [],
    linkViews(executor, rows.map((row) => ({ creatorUserId: row.video.creatorUserId, type: row.video.linkType, id: row.video.linkId }))),
  ]);
  const likedSet = new Set(liked.map((row) => row.id));
  const savedSet = new Set(saved.map((row) => row.id));
  const followSet = new Set(follows.map((row) => row.id));
  const byId = new Map(
    rows.map(({ video, name, yayId, avatar, place }) => [
      video.id,
      {
        id: video.id,
        creator: { id: video.creatorUserId, name, yayId, avatar: avatar ? `/media/${avatar}` : null },
        caption: video.caption,
        hashtags: video.hashtags,
        place,
        district: video.district,
        source: video.source === 'ai' ? ('ai' as const) : ('upload' as const),
        durationMs: video.durationMs ?? 0,
        width: video.width ?? 0,
        height: video.height ?? 0,
        media: mediaUrls(video.id),
        counts: { likes: video.likes, comments: video.comments, saves: video.saves, shares: video.shares, views: video.views },
        liked: likedSet.has(video.id),
        saved: savedSet.has(video.id),
        following: followSet.has(video.creatorUserId),
        own: viewer === video.creatorUserId,
        link: linkFor(links, video),
        publishedAt: (video.publishedAt ?? video.createdAt).toISOString(),
        why: [],
      } satisfies FeedVideo,
    ]),
  );
  return params.ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

/** A creator's public page: their name, followers, whether the viewer follows, and their published videos, newest first. */
export async function creatorPage(executor: Executor, params: { yayId: string; viewerId: string | null; locale: string; offset?: number }) {
  const [creator] = await executor
    .select({ id: users.id, name: users.displayName, yayId: users.yayId, status: users.status, avatar: userProfiles.avatarMediaId, bio: userProfiles.bio })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.yayId, params.yayId))
    .limit(1);
  if (!creator || creator.status !== 'active') return null;
  if (params.viewerId) {
    const [blocked] = await executor
      .select({ x: miradorBlocks.blockerUserId })
      .from(miradorBlocks)
      .where(and(eq(miradorBlocks.blockerUserId, creator.id), eq(miradorBlocks.blockedUserId, params.viewerId)))
      .limit(1);
    if (blocked) return null;
  }
  const [counts] = await executor
    .select({
      followers: sql<number>`(select count(*)::int from mirador_follows f where f.creator_user_id = ${creator.id})`,
      following: sql<number>`(select count(*)::int from mirador_follows f where f.follower_user_id = ${creator.id})`,
      likes: sql<number>`coalesce((select sum(v.likes)::int from mirador_videos v where v.creator_user_id = ${creator.id} and v.status = 'ready' and v.removed_at is null and v.published_at is not null), 0)`,
      isFollowing: params.viewerId ? sql<boolean>`exists (select 1 from mirador_follows f where f.follower_user_id = ${params.viewerId} and f.creator_user_id = ${creator.id})` : sql<boolean>`false`,
    })
    .from(sql`(select 1) as one`);
  const ids = await executor
    .select({ id: miradorVideos.id })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.creatorUserId, creator.id), visible))
    .orderBy(desc(miradorVideos.publishedAt))
    .limit(30)
    .offset(params.offset ?? 0);
  const videos = await videosByIds(executor, { ids: ids.map((row) => row.id), viewerId: params.viewerId, locale: params.locale });
  return {
    creator: { id: creator.id, name: creator.name, yayId: creator.yayId, avatar: creator.avatar ? `/media/${creator.avatar}` : null, bio: creator.bio },
    counts: { followers: Number(counts?.followers ?? 0), following: Number(counts?.following ?? 0), likes: Number(counts?.likes ?? 0) },
    isFollowing: Boolean(counts?.isFollowing),
    videos,
  };
}
