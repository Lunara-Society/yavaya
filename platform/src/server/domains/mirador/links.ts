import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { boardPosts, goStores, mercaditoListings, servicesProviderProfiles, users } from '@/server/db/schema';
import { errors } from '@/server/errors';

/**
 * What a Mirador video can point at: one real thing on Yavaya that belongs to
 * the person who posted the video (docs/mirador/README.md, "Video commerce").
 *
 * The button a viewer taps opens that thing's own page, where its own real
 * actions are: the listing's contact and save, the store's order form, the
 * provider's request, the post's WhatsApp. Mirador adds no second way to do
 * any of them, so nothing here can pretend to order, pay or book.
 *
 * Ownership is checked when the link is set and again when the video is
 * shown: a listing that was sold, a store no longer approved or a post
 * closed simply stops showing its button.
 */
export const LINK_TYPES = ['mercadito_listing', 'go_store', 'service_provider', 'board_post'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value);
}

/** The action a viewer sees for each kind: an i18n key under `mirador.action.*`. */
export const LINK_ACTION: Record<LinkType, string> = {
  mercadito_listing: 'view_listing',
  go_store: 'order',
  service_provider: 'view_services',
  board_post: 'view_post',
};

export type LinkView = {
  type: LinkType;
  id: string;
  district: string;
  title: string;
  /** Price in minor units with its currency, for a listing. */
  price: { minor: number; currency: string } | null;
  url: string;
  action: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The district a link gives its video, after checking it is the creator's own and live. Throws a validation error otherwise. */
export async function checkOwnLink(executor: Executor, params: { creatorUserId: string; type: LinkType; id: string }): Promise<{ district: string }> {
  if (!UUID.test(params.id)) throw errors.validation('mirador.error.link');
  const views = await linkViews(executor, [{ creatorUserId: params.creatorUserId, type: params.type, id: params.id }]);
  const view = views.get(linkKey(params.type, params.id, params.creatorUserId));
  if (!view) throw errors.validation('mirador.error.link');
  return { district: view.district };
}

const linkKey = (type: string, id: string, creator: string) => `${type}:${id}:${creator}`;

/**
 * The live links of many videos at once, keyed by `type:id:creator`: one
 * query per kind, never one per video. A link that is gone, not the
 * creator's, or no longer live is simply absent.
 */
export async function linkViews(executor: Executor, wanted: Array<{ creatorUserId: string; type: string | null; id: string | null }>): Promise<Map<string, LinkView>> {
  const out = new Map<string, LinkView>();
  const of = (type: LinkType) => wanted.filter((item): item is { creatorUserId: string; type: LinkType; id: string } => item.type === type && Boolean(item.id && UUID.test(item.id)));

  const listings = of('mercadito_listing');
  if (listings.length) {
    const rows = await executor
      .select({ id: mercaditoListings.id, seller: mercaditoListings.sellerUserId, title: mercaditoListings.title, priceMinor: mercaditoListings.priceMinor, currency: mercaditoListings.currencyCode })
      .from(mercaditoListings)
      .where(and(inArray(mercaditoListings.id, listings.map((item) => item.id)), inArray(mercaditoListings.status, ['published', 'reserved'])));
    for (const row of rows) {
      out.set(linkKey('mercadito_listing', row.id, row.seller), {
        type: 'mercadito_listing',
        id: row.id,
        district: 'mercadito',
        title: row.title,
        price: { minor: row.priceMinor, currency: row.currency },
        url: `/mercadito/${row.id}`,
        action: LINK_ACTION.mercadito_listing,
      });
    }
  }

  const stores = of('go_store');
  if (stores.length) {
    const rows = await executor
      .select({ id: goStores.id, owner: goStores.ownerUserId, name: goStores.name })
      .from(goStores)
      .where(and(inArray(goStores.id, stores.map((item) => item.id)), eq(goStores.status, 'approved')));
    for (const row of rows) {
      out.set(linkKey('go_store', row.id, row.owner), { type: 'go_store', id: row.id, district: 'yavayago', title: row.name, price: null, url: `/yavayago/stores/${row.id}`, action: LINK_ACTION.go_store });
    }
  }

  // A provider's profile is keyed by the provider: the link's id is the creator's own user id.
  const providers = of('service_provider').filter((item) => item.id === item.creatorUserId);
  if (providers.length) {
    const rows = await executor
      .select({ id: servicesProviderProfiles.userId, yayId: users.yayId, name: users.displayName })
      .from(servicesProviderProfiles)
      .innerJoin(users, eq(users.id, servicesProviderProfiles.userId))
      .where(and(inArray(servicesProviderProfiles.userId, providers.map((item) => item.id)), eq(servicesProviderProfiles.status, 'active')));
    for (const row of rows) {
      if (!row.yayId) continue;
      out.set(linkKey('service_provider', row.id, row.id), { type: 'service_provider', id: row.id, district: 'services', title: row.name, price: null, url: `/services/providers/${row.yayId}`, action: LINK_ACTION.service_provider });
    }
  }

  const posts = of('board_post');
  if (posts.length) {
    const rows = await executor
      .select({ id: boardPosts.id, author: boardPosts.authorUserId, district: boardPosts.district, title: boardPosts.title })
      .from(boardPosts)
      .where(and(inArray(boardPosts.id, posts.map((item) => item.id)), eq(boardPosts.status, 'open')));
    for (const row of rows) {
      out.set(linkKey('board_post', row.id, row.author), { type: 'board_post', id: row.id, district: row.district, title: row.title, price: null, url: `/${row.district}/${row.id}`, action: LINK_ACTION.board_post });
    }
  }
  return out;
}

export function linkFor(views: Map<string, LinkView>, video: { creatorUserId: string; linkType: string | null; linkId: string | null }): LinkView | null {
  if (!video.linkType || !video.linkId) return null;
  return views.get(linkKey(video.linkType, video.linkId, video.creatorUserId)) ?? null;
}

/** What a member can link a video to: their own live listings, stores, provider profile and open posts, newest first. */
export async function linkChoices(executor: Executor, userId: string): Promise<Array<{ type: LinkType; id: string; title: string }>> {
  const [listings, stores, provider, posts] = await Promise.all([
    executor
      .select({ id: mercaditoListings.id, title: mercaditoListings.title })
      .from(mercaditoListings)
      .where(and(eq(mercaditoListings.sellerUserId, userId), inArray(mercaditoListings.status, ['published', 'reserved'])))
      .limit(30),
    executor.select({ id: goStores.id, title: goStores.name }).from(goStores).where(and(eq(goStores.ownerUserId, userId), eq(goStores.status, 'approved'))).limit(5),
    executor.select({ id: servicesProviderProfiles.userId }).from(servicesProviderProfiles).where(and(eq(servicesProviderProfiles.userId, userId), eq(servicesProviderProfiles.status, 'active'))).limit(1),
    executor
      .select({ id: boardPosts.id, title: boardPosts.title })
      .from(boardPosts)
      .where(and(eq(boardPosts.authorUserId, userId), eq(boardPosts.status, 'open')))
      .limit(30),
  ]);
  return [
    ...stores.map((row) => ({ type: 'go_store' as const, id: row.id, title: row.title })),
    ...provider.map((row) => ({ type: 'service_provider' as const, id: row.id, title: '' })),
    ...listings.map((row) => ({ type: 'mercadito_listing' as const, id: row.id, title: row.title })),
    ...posts.map((row) => ({ type: 'board_post' as const, id: row.id, title: row.title })),
  ];
}
