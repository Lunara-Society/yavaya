import 'server-only';
import { and, asc, count, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import {
  locations,
  media,
  mercaditoListingPhotos,
  mercaditoListings,
  mercaditoSavedSearches,
  reputationScores,
  userProfiles,
  users,
} from '@/server/db/schema';
import { MERCADITO_RULES, REPUTATION_RULES } from '@/config/business-rules';
import { statusKeyFor } from '@/server/domains/trust/shield';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { chargeForAction } from '@/server/domains/tokens/service';
import { publishActivity } from '@/server/domains/notifications/activity';
import { getSetting } from '@/server/domains/platform/settings';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { hashesUsedByOthers, insertMediaRows, markRemoved, type StoredImage } from '@/server/domains/media/service';
import { openSystemTicket } from './moderation';
import {
  OPEN_STATUSES,
  PUBLIC_STATUSES,
  titleFingerprint,
  type ListingCategory,
  type ListingCondition,
  type ListingInput,
} from './rules';

/**
 * Mercadito.
 *
 * Money and reputation never move here directly: publishing is charged
 * through `chargeForAction`, and every change is audited in the same
 * transaction as the change itself.
 */

export const PHOTO_PURPOSE = 'listing_photo';
const PLACE_LEVELS = ['city', 'town', 'village', 'neighborhood'] as const;

export type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };

export async function newSellerRules(executor: Executor) {
  const [windowDays, maxListings] = await Promise.all([
    getSetting(executor, 'mercadito.new_seller_window_days', MERCADITO_RULES.newSellerWindowDays),
    getSetting(executor, 'mercadito.new_seller_max_listings', MERCADITO_RULES.newSellerMaxListings),
  ]);
  return { windowDays, maxListings };
}

/**
 * Whether a member may publish, and why not. The publish page asks this
 * before showing a form, so nobody fills one in only to be refused.
 */
export async function sellerStanding(
  executor: Executor,
  userId: string,
): Promise<{
  allowed: boolean;
  reasonKey?: string;
  newSeller: { limited: boolean; used: number; max: number; windowDays: number };
}> {
  const [user] = await executor
    .select({ status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const rules = await newSellerRules(executor);
  const [row] = await executor
    .select({ used: count() })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.sellerUserId, userId));
  const used = row?.used ?? 0;
  const limited = Boolean(user) && isNewSeller(user!.createdAt, rules.windowDays);
  const newSeller = { limited, used, max: rules.maxListings, windowDays: rules.windowDays };

  if (!user) return { allowed: false, reasonKey: 'error.unauthenticated', newSeller };
  const statusKey = statusBlock(user.status);
  if (statusKey) return { allowed: false, reasonKey: statusKey, newSeller };
  if (limited && used >= rules.maxListings) {
    return { allowed: false, reasonKey: 'mercadito.error.new_seller_limit', newSeller };
  }
  return { allowed: true, newSeller };
}

function isNewSeller(createdAt: Date, windowDays: number): boolean {
  return Date.now() - createdAt.getTime() < windowDays * 24 * 60 * 60 * 1000;
}

function statusBlock(status: string): string | null {
  if (status === 'active') return null;
  if (status === 'pending_verification') return 'mercadito.error.verify_email';
  return 'mercadito.error.account_restricted';
}

/**
 * Checks the place is a real, active settlement inside a launch market, and
 * that the currency is that country's or US dollars — the two a buyer there
 * would expect to see.
 */
async function resolvePlace(
  executor: Executor,
  locationId: string,
  currency: string,
): Promise<void> {
  const [place] = await executor
    .select({ level: locations.level, path: locations.path, isActive: locations.isActive })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!place || !place.isActive || !(PLACE_LEVELS as readonly string[]).includes(place.level)) {
    throw errors.validation('mercadito.error.location');
  }
  const [country] = await executor
    .select({ currencyCode: locations.currencyCode, supported: locations.isSupportedMarket })
    .from(locations)
    .where(and(inArray(locations.code, place.path), eq(locations.level, 'country')))
    .limit(1);
  if (!country?.supported) throw errors.validation('mercadito.error.location');
  if (currency !== 'USD' && currency !== country.currencyCode) {
    throw errors.validation('mercadito.error.currency');
  }
}

function checkPhotoCount(total: number): void {
  if (total < MERCADITO_RULES.minPhotos || total > MERCADITO_RULES.maxPhotos) {
    throw errors.validation('mercadito.error.photo_count', {
      min: MERCADITO_RULES.minPhotos,
      max: MERCADITO_RULES.maxPhotos,
    });
  }
}

/**
 * Automatic screening. Flags go to moderators; they never hide a listing on
 * their own, because an honest seller reposting their own photo from another
 * account of the family would otherwise vanish without recourse.
 */
async function screen(
  tx: Executor,
  params: { listingId: string; sellerUserId: string; title: string; images: StoredImage[] },
): Promise<string[]> {
  const flags: string[] = [];
  const reused = await hashesUsedByOthers(tx, {
    ownerUserId: params.sellerUserId,
    hashes: params.images.map((image) => image.sourceSha256),
  });
  if (reused.length > 0) flags.push('duplicate_photo');

  const fingerprint = titleFingerprint(params.title);
  const others = await tx
    .select({ title: mercaditoListings.title })
    .from(mercaditoListings)
    .where(
      and(
        eq(mercaditoListings.sellerUserId, params.sellerUserId),
        inArray(mercaditoListings.status, [...OPEN_STATUSES]),
        sql`${mercaditoListings.id} <> ${params.listingId}`,
      ),
    );
  if (others.some((other) => titleFingerprint(other.title) === fingerprint)) flags.push('repeated_listing');
  return flags;
}

export async function publishListing(
  tx: Executor,
  params: {
    listingId: string;
    sellerUserId: string;
    input: ListingInput;
    images: StoredImage[];
    audit?: AuditContext;
  },
): Promise<{ listingId: string; deduplicated: boolean; cost: number }> {
  // Serialises this seller's publishes, so two tabs cannot both pass the
  // new-seller limit with one slot left.
  const [seller] = await tx
    .select({ status: users.status, createdAt: users.createdAt, identityVerifiedAt: users.identityVerifiedAt })
    .from(users)
    .where(eq(users.id, params.sellerUserId))
    .limit(1)
    .for('update');
  if (!seller) throw errors.unauthenticated();

  const [existing] = await tx
    .select({ sellerUserId: mercaditoListings.sellerUserId })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.id, params.listingId))
    .limit(1);
  if (existing) {
    // The same form submitted twice: the first one succeeded, so this one
    // reports that success rather than charging again.
    if (existing.sellerUserId === params.sellerUserId) {
      return { listingId: params.listingId, deduplicated: true, cost: 0 };
    }
    throw errors.conflict('mercadito.error.conflict');
  }

  const statusKey = statusBlock(seller.status);
  if (statusKey) throw new DomainError('forbidden', statusKey);

  const { input } = params;
  if (!seller.identityVerifiedAt) {
    const restricted = await getSetting<readonly string[]>(
      tx,
      'mercadito.restricted_categories_unverified',
      MERCADITO_RULES.restrictedCategoriesForUnverified,
    );
    if (restricted.includes(input.category)) throw new DomainError('forbidden', 'mercadito.error.category_restricted');
  }

  const rules = await newSellerRules(tx);
  if (isNewSeller(seller.createdAt, rules.windowDays)) {
    const [row] = await tx
      .select({ used: count() })
      .from(mercaditoListings)
      .where(eq(mercaditoListings.sellerUserId, params.sellerUserId));
    if ((row?.used ?? 0) >= rules.maxListings) {
      throw errors.conflict('mercadito.error.new_seller_limit', {
        max: rules.maxListings,
        days: rules.windowDays,
      });
    }
  }

  checkPhotoCount(params.images.length);
  await resolvePlace(tx, input.locationId, input.currency);
  const flags = await screen(tx, {
    listingId: params.listingId,
    sellerUserId: params.sellerUserId,
    title: input.title,
    images: params.images,
  });

  await insertMediaRows(tx, { ownerUserId: params.sellerUserId, purpose: PHOTO_PURPOSE, images: params.images });
  await tx.insert(mercaditoListings).values({
    id: params.listingId,
    sellerUserId: params.sellerUserId,
    title: input.title,
    description: input.description,
    priceMinor: input.price,
    currencyCode: input.currency,
    category: input.category,
    condition: input.condition,
    locationId: input.locationId,
    flags,
  });
  await tx.insert(mercaditoListingPhotos).values(
    params.images.map((image, position) => ({ listingId: params.listingId, mediaId: image.id, position })),
  );

  // Last of the writes that can fail on the member's side (not enough
  // tokens), so the refusal rolls back everything above with it.
  const charge = await chargeForAction(tx, {
    userId: params.sellerUserId,
    actionKey: 'mercadito.publish_listing',
    idempotencyKey: `mercadito.listing:${params.listingId}:publish`,
    relatedType: 'mercadito_listing',
    relatedId: params.listingId,
  });

  if (flags.length > 0) {
    await openSystemTicket(tx, { listingId: params.listingId, flags });
  }

  await publishActivity(tx, {
    kind: 'listing_published',
    district: 'mercadito',
    locationId: input.locationId,
    subject: { type: 'mercadito_listing', id: params.listingId },
  });

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.sellerUserId,
    action: 'mercadito.listing_published',
    subjectType: 'mercadito_listing',
    subjectId: params.listingId,
    district: 'mercadito',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { category: input.category, photos: params.images.length, cost: charge.cost, flags },
  });

  return { listingId: params.listingId, deduplicated: false, cost: charge.cost };
}

/**
 * Edits a published listing. Editing is free: the token paid for putting the
 * listing up, not for keeping it accurate.
 *
 * Returns the storage keys of photos the seller dropped, for the caller to
 * delete once this transaction has committed.
 */
export async function updateListing(
  tx: Executor,
  params: {
    listingId: string;
    sellerUserId: string;
    input: ListingInput;
    keepMediaIds: string[];
    newImages: StoredImage[];
    audit?: AuditContext;
  },
): Promise<{ droppedStorageKeys: string[] }> {
  const listing = await lockOwnListing(tx, params.listingId, params.sellerUserId);
  if (!(OPEN_STATUSES as readonly string[]).includes(listing.status)) throw errors.conflict('mercadito.error.not_editable');

  const [seller] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.sellerUserId));
  const statusKey = statusBlock(seller?.status ?? 'deactivated');
  if (statusKey) throw new DomainError('forbidden', statusKey);

  const current = await tx
    .select({ mediaId: mercaditoListingPhotos.mediaId, storageKey: media.storageKey })
    .from(mercaditoListingPhotos)
    .innerJoin(media, eq(media.id, mercaditoListingPhotos.mediaId))
    .where(eq(mercaditoListingPhotos.listingId, params.listingId))
    .orderBy(asc(mercaditoListingPhotos.position));

  const currentIds = new Set(current.map((photo) => photo.mediaId));
  const kept = [...new Set(params.keepMediaIds)].filter((id) => currentIds.has(id));
  const dropped = current.filter((photo) => !kept.includes(photo.mediaId));

  checkPhotoCount(kept.length + params.newImages.length);
  await resolvePlace(tx, params.input.locationId, params.input.currency);

  await insertMediaRows(tx, { ownerUserId: params.sellerUserId, purpose: PHOTO_PURPOSE, images: params.newImages });
  // Rewritten whole: simpler than shuffling positions under a unique index.
  await tx.delete(mercaditoListingPhotos).where(eq(mercaditoListingPhotos.listingId, params.listingId));
  const order = [...kept, ...params.newImages.map((image) => image.id)];
  await tx
    .insert(mercaditoListingPhotos)
    .values(order.map((mediaId, position) => ({ listingId: params.listingId, mediaId, position })));
  await markRemoved(tx, dropped.map((photo) => photo.mediaId));

  const { input } = params;
  await tx
    .update(mercaditoListings)
    .set({
      title: input.title,
      description: input.description,
      priceMinor: input.price,
      currencyCode: input.currency,
      category: input.category,
      condition: input.condition,
      locationId: input.locationId,
      updatedAt: new Date(),
    })
    .where(eq(mercaditoListings.id, params.listingId));

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.sellerUserId,
    action: 'mercadito.listing_updated',
    subjectType: 'mercadito_listing',
    subjectId: params.listingId,
    district: 'mercadito',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
    metadata: { photosAdded: params.newImages.length, photosRemoved: dropped.length },
  });

  return { droppedStorageKeys: dropped.map((photo) => photo.storageKey) };
}

/** The seller marks a listing sold, or takes it down. Neither is refunded. */
export async function closeListing(
  tx: Executor,
  params: { listingId: string; sellerUserId: string; outcome: 'sold' | 'withdrawn'; audit?: AuditContext },
): Promise<void> {
  const listing = await lockOwnListing(tx, params.listingId, params.sellerUserId);
  if (!(OPEN_STATUSES as readonly string[]).includes(listing.status)) throw errors.conflict('mercadito.error.not_editable');

  await tx
    .update(mercaditoListings)
    .set({ status: params.outcome, closedAt: new Date(), updatedAt: new Date() })
    .where(eq(mercaditoListings.id, params.listingId));

  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.sellerUserId,
    action: params.outcome === 'sold' ? 'mercadito.listing_sold' : 'mercadito.listing_withdrawn',
    subjectType: 'mercadito_listing',
    subjectId: params.listingId,
    district: 'mercadito',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
}

async function lockOwnListing(tx: Executor, listingId: string, sellerUserId: string) {
  const [listing] = await tx
    .select({ status: mercaditoListings.status, sellerUserId: mercaditoListings.sellerUserId })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.id, listingId))
    .limit(1)
    .for('update');
  // Someone else's listing is reported as missing, not as forbidden: it
  // reveals nothing about which ids exist.
  if (!listing || listing.sellerUserId !== sellerUserId) throw errors.notFound('mercadito_listing');
  return listing;
}

/** Sets or clears the WhatsApp number buyers use to reach this member. */
export async function setWhatsapp(
  tx: Executor,
  params: { userId: string; phoneE164: string | null; audit?: AuditContext },
): Promise<void> {
  await tx
    .insert(userProfiles)
    .values({ userId: params.userId, whatsappE164: params.phoneE164 })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { whatsappE164: params.phoneE164, updatedAt: new Date() },
    });
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: params.phoneE164 ? 'mercadito.whatsapp_set' : 'mercadito.whatsapp_cleared',
    subjectType: 'user',
    subjectId: params.userId,
    district: 'mercadito',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
}

export async function getWhatsapp(executor: Executor, userId: string): Promise<string | null> {
  const [row] = await executor
    .select({ phone: userProfiles.whatsappE164 })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row?.phone ?? null;
}

// --- Reading -----------------------------------------------------------------

export type ListingCard = {
  id: string;
  title: string;
  priceMinor: number;
  currencyCode: string;
  category: ListingCategory;
  condition: ListingCondition;
  status: string;
  placeName: string;
  coverMediaId: string | null;
  publishedAt: Date;
  /**
   * The seller's trust, on every card — "never hide trust" (Master Bible).
   * Derived from the same evidence as the Trust Shield, never stored.
   */
  trust: { score: number; statusKey: string; emailVerified: boolean; identityVerified: boolean };
};

/** Columns every listing card needs, the seller's trust included. */
const cardColumns = {
  id: mercaditoListings.id,
  title: mercaditoListings.title,
  priceMinor: mercaditoListings.priceMinor,
  currencyCode: mercaditoListings.currencyCode,
  category: mercaditoListings.category,
  condition: mercaditoListings.condition,
  status: mercaditoListings.status,
  publishedAt: mercaditoListings.publishedAt,
  placeName: locations.name,
  placeNames: locations.names,
  sellerStatus: users.status,
  sellerTrustState: users.trustState,
  sellerEmailVerifiedAt: users.emailVerifiedAt,
  sellerIdentityVerifiedAt: users.identityVerifiedAt,
  sellerScore: reputationScores.score,
};

type CardRow = {
  [K in keyof typeof cardColumns]: (typeof cardColumns)[K]['_']['data'] | (K extends 'sellerScore' | 'sellerEmailVerifiedAt' | 'sellerIdentityVerifiedAt' ? null : never);
} & { coverMediaId: string | null };

function toCard(row: CardRow, locale: string): ListingCard {
  const score = row.sellerScore ?? REPUTATION_RULES.initialScore;
  return {
    id: row.id,
    title: row.title,
    priceMinor: row.priceMinor,
    currencyCode: row.currencyCode,
    category: row.category,
    condition: row.condition,
    status: row.status,
    publishedAt: row.publishedAt,
    placeName: localized(row.placeName, row.placeNames, locale),
    coverMediaId: row.coverMediaId,
    trust: {
      score,
      statusKey: statusKeyFor({ status: row.sellerStatus, trustState: row.sellerTrustState, score }),
      emailVerified: row.sellerEmailVerifiedAt !== null,
      identityVerified: row.sellerIdentityVerifiedAt !== null,
    },
  };
}

const coverMediaId = sql<string | null>`(
  select p.media_id from mercadito_listing_photos p
  where p.listing_id = ${mercaditoListings.id}
  order by p.position asc limit 1
)`;

function localized(name: string, names: unknown, locale: string): string {
  return (names as Record<string, string> | null)?.[locale] ?? name;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export type SearchFilters = { query?: string | null; category?: ListingCategory | null; placeCode?: string | null };

/** The market's search rules, shared by browsing and by saved searches. */
function listingFilters(params: SearchFilters) {
  const conditions = [inArray(mercaditoListings.status, [...OPEN_STATUSES])];
  if (params.category) conditions.push(eq(mercaditoListings.category, params.category));
  if (params.placeCode) {
    conditions.push(sql`(${locations.code} = ${params.placeCode} or ${params.placeCode} = any(${locations.path}))`);
  }
  const query = params.query?.trim().slice(0, 80);
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      sql`(${mercaditoListings.title} ilike ${pattern} or ${mercaditoListings.description} ilike ${pattern})`,
    );
  }
  return conditions;
}

export async function browseListings(
  executor: Executor,
  params: { query?: string; category?: ListingCategory; placeCode?: string; page?: number; locale: string },
): Promise<{ items: ListingCard[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 500));
  const size = MERCADITO_RULES.pageSize;
  const conditions = listingFilters(params);

  const rows = await executor
    .select({ ...cardColumns, coverMediaId })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .innerJoin(users, eq(users.id, mercaditoListings.sellerUserId))
    .leftJoin(reputationScores, eq(reputationScores.userId, mercaditoListings.sellerUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, mercaditoListings.sellerUserId))
    .where(and(...conditions))
    // "Listings with no phone: reduced visibility" (Master Bible): a seller
    // buyers cannot reach sorts after those they can, never out of sight.
    .orderBy(sql`(${userProfiles.whatsappE164} is null)`, desc(mercaditoListings.publishedAt))
    .limit(size + 1)
    .offset((page - 1) * size);

  return {
    items: rows.slice(0, size).map((row) => toCard(row, params.locale)),
    hasMore: rows.length > size,
    page,
  };
}

export type ListingDetail = Omit<ListingCard, 'trust'> & {
  description: string;
  flags: string[];
  updatedAt: Date;
  locationId: string;
  placeTrail: string[];
  photos: Array<{ mediaId: string; width: number; height: number }>;
  seller: {
    userId: string;
    yayId: string;
    displayName: string;
    memberSince: Date;
    whatsappE164: string | null;
    phoneVerified: boolean;
  };
};

export async function getListing(executor: Executor, id: string, locale: string): Promise<ListingDetail | null> {
  const [row] = await executor
    .select({
      id: mercaditoListings.id,
      title: mercaditoListings.title,
      description: mercaditoListings.description,
      priceMinor: mercaditoListings.priceMinor,
      currencyCode: mercaditoListings.currencyCode,
      category: mercaditoListings.category,
      condition: mercaditoListings.condition,
      status: mercaditoListings.status,
      flags: mercaditoListings.flags,
      publishedAt: mercaditoListings.publishedAt,
      updatedAt: mercaditoListings.updatedAt,
      locationId: mercaditoListings.locationId,
      placeName: locations.name,
      placeNames: locations.names,
      placePath: locations.path,
      sellerUserId: users.id,
      sellerYayId: users.yayId,
      sellerName: users.displayName,
      sellerSince: users.createdAt,
      whatsapp: userProfiles.whatsappE164,
      sellerPhone: users.phoneE164,
      sellerPhoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .innerJoin(users, eq(users.id, mercaditoListings.sellerUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, mercaditoListings.sellerUserId))
    .where(eq(mercaditoListings.id, id))
    .limit(1);
  if (!row) return null;

  const [photos, trail] = await Promise.all([
    executor
      .select({ mediaId: media.id, width: media.width, height: media.height })
      .from(mercaditoListingPhotos)
      .innerJoin(media, eq(media.id, mercaditoListingPhotos.mediaId))
      .where(and(eq(mercaditoListingPhotos.listingId, id), eq(media.status, 'active')))
      .orderBy(asc(mercaditoListingPhotos.position)),
    // The place's ancestors below the region — state, then country — so the
    // page reads "city, state, country". The region adds nothing a buyer needs.
    executor
      .select({ name: locations.name, names: locations.names })
      .from(locations)
      .where(and(inArray(locations.code, row.placePath), notInArray(locations.level, ['region'])))
      .orderBy(desc(locations.depth)),
  ]);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceMinor: row.priceMinor,
    currencyCode: row.currencyCode,
    category: row.category,
    condition: row.condition,
    status: row.status,
    flags: row.flags,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    locationId: row.locationId,
    placeName: localized(row.placeName, row.placeNames, locale),
    placeTrail: [
      localized(row.placeName, row.placeNames, locale),
      ...trail.map((place) => localized(place.name, place.names, locale)),
    ],
    coverMediaId: photos[0]?.mediaId ?? null,
    photos,
    seller: {
      userId: row.sellerUserId,
      yayId: formatYayId(row.sellerYayId),
      displayName: row.sellerName,
      memberSince: row.sellerSince,
      whatsappE164: row.whatsapp,
      // Verified means *this* number: the WhatsApp number buyers are sent to
      // is the one the seller proved they hold by SMS. A seller with some
      // other verified phone does not make this one trustworthy.
      phoneVerified: row.whatsapp !== null && row.sellerPhoneVerifiedAt !== null && row.whatsapp === row.sellerPhone,
    },
  };
}

export async function sellerListings(
  executor: Executor,
  userId: string,
  locale: string,
  options: { publicOnly?: boolean } = {},
): Promise<ListingCard[]> {
  const conditions = [eq(mercaditoListings.sellerUserId, userId)];
  // Others see what is up or sold; withdrawn and removed stay the seller's.
  if (options.publicOnly) conditions.push(inArray(mercaditoListings.status, [...PUBLIC_STATUSES]));
  const rows = await executor
    .select({ ...cardColumns, coverMediaId })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .innerJoin(users, eq(users.id, mercaditoListings.sellerUserId))
    .leftJoin(reputationScores, eq(reputationScores.userId, mercaditoListings.sellerUserId))
    .where(and(...conditions))
    .orderBy(desc(mercaditoListings.createdAt))
    .limit(200);
  return rows.map((row) => toCard(row, locale));
}

export type PlaceOption = { id: string; label: string; countryCode: string; currencyCode: string };
export type CountryOption = { code: string; name: string; currencyCode: string; places: PlaceOption[] };

/** Every settlement a listing may be placed in, grouped by launch country. */
export async function placeOptions(executor: Executor, locale: string): Promise<CountryOption[]> {
  const countries = await executor
    .select({
      code: locations.code,
      name: locations.name,
      names: locations.names,
      currencyCode: locations.currencyCode,
    })
    .from(locations)
    .where(
      and(eq(locations.level, 'country'), eq(locations.isSupportedMarket, true), eq(locations.isActive, true)),
    )
    .orderBy(asc(locations.sortOrder), asc(locations.name));

  const places = await executor
    .select({
      id: locations.id,
      name: locations.name,
      names: locations.names,
      path: locations.path,
    })
    .from(locations)
    .where(and(inArray(locations.level, [...PLACE_LEVELS]), eq(locations.isActive, true)))
    .orderBy(asc(locations.name));

  return countries.map((country) => ({
    code: country.code,
    name: localized(country.name, country.names, locale),
    currencyCode: country.currencyCode ?? 'USD',
    places: places
      .filter((place) => place.path.includes(country.code))
      .map((place) => ({
        id: place.id,
        label: localized(place.name, place.names, locale),
        countryCode: country.code,
        currencyCode: country.currencyCode ?? 'USD',
      })),
  }));
}

/** The seller holds a listing for a buyer, or releases it. It stays up either way. */
export async function setReserved(
  tx: Executor,
  params: { listingId: string; sellerUserId: string; reserved: boolean; audit?: AuditContext },
): Promise<void> {
  const listing = await lockOwnListing(tx, params.listingId, params.sellerUserId);
  const from = params.reserved ? 'published' : 'reserved';
  if (listing.status !== from) throw errors.conflict('mercadito.error.not_editable');
  await tx
    .update(mercaditoListings)
    .set({ status: params.reserved ? 'reserved' : 'published', updatedAt: new Date() })
    .where(eq(mercaditoListings.id, params.listingId));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.sellerUserId,
    action: params.reserved ? 'mercadito.listing_reserved' : 'mercadito.listing_unreserved',
    subjectType: 'mercadito_listing',
    subjectId: params.listingId,
    district: 'mercadito',
    ipHash: params.audit?.ipHash ?? null,
    userAgentHash: params.audit?.userAgentHash ?? null,
  });
}

/** Other open listings in the same category, newest first — "you may also like". */
export async function similarListings(
  executor: Executor,
  params: { listingId: string; category: ListingCategory; locale: string; limit?: number },
): Promise<ListingCard[]> {
  const rows = await executor
    .select({ ...cardColumns, coverMediaId })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .innerJoin(users, eq(users.id, mercaditoListings.sellerUserId))
    .leftJoin(reputationScores, eq(reputationScores.userId, mercaditoListings.sellerUserId))
    .where(
      and(
        inArray(mercaditoListings.status, [...OPEN_STATUSES]),
        eq(mercaditoListings.category, params.category),
        sql`${mercaditoListings.id} <> ${params.listingId}`,
      ),
    )
    .orderBy(desc(mercaditoListings.publishedAt))
    .limit(params.limit ?? 6);
  return rows.map((row) => toCard(row, params.locale));
}

// --- Saved searches -------------------------------------------------------------

export type SavedSearch = SearchFilters & { id: string; createdAt: Date; newCount: number };

export async function saveSearch(tx: Executor, params: { userId: string } & SearchFilters): Promise<string> {
  const filters = {
    query: params.query?.trim().slice(0, 80) || null,
    category: params.category ?? null,
    placeCode: params.placeCode ?? null,
  };
  if (!filters.query && !filters.category && !filters.placeCode) throw errors.validation('mercadito.saved.error.empty');

  const existing = await tx
    .select({
      id: mercaditoSavedSearches.id,
      query: mercaditoSavedSearches.query,
      category: mercaditoSavedSearches.category,
      placeCode: mercaditoSavedSearches.placeCode,
    })
    .from(mercaditoSavedSearches)
    .where(eq(mercaditoSavedSearches.userId, params.userId));
  const same = existing.find(
    (row) => row.query === filters.query && row.category === filters.category && row.placeCode === filters.placeCode,
  );
  if (same) return same.id;
  if (existing.length >= MERCADITO_RULES.maxSavedSearches) {
    throw errors.conflict('mercadito.saved.error.limit', { max: MERCADITO_RULES.maxSavedSearches });
  }
  const [row] = await tx
    .insert(mercaditoSavedSearches)
    .values({ userId: params.userId, ...filters })
    .returning({ id: mercaditoSavedSearches.id });
  return row!.id;
}

export async function deleteSavedSearch(tx: Executor, params: { userId: string; id: string }): Promise<void> {
  await tx
    .delete(mercaditoSavedSearches)
    .where(and(eq(mercaditoSavedSearches.id, params.id), eq(mercaditoSavedSearches.userId, params.userId)));
}

/** Opening a saved search resets its "new" count. Someone else's is ignored. */
export async function markSavedSearchSeen(executor: Executor, params: { userId: string; id: string }): Promise<void> {
  await executor
    .update(mercaditoSavedSearches)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(mercaditoSavedSearches.id, params.id), eq(mercaditoSavedSearches.userId, params.userId)));
}

export async function listSavedSearches(executor: Executor, userId: string): Promise<SavedSearch[]> {
  const rows = await executor
    .select()
    .from(mercaditoSavedSearches)
    .where(eq(mercaditoSavedSearches.userId, userId))
    .orderBy(desc(mercaditoSavedSearches.createdAt));
  const out: SavedSearch[] = [];
  for (const row of rows) {
    const [counted] = await executor
      .select({ total: count() })
      .from(mercaditoListings)
      .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
      .where(and(...listingFilters(row), gt(mercaditoListings.publishedAt, row.lastSeenAt)));
    out.push({
      id: row.id,
      query: row.query,
      category: row.category,
      placeCode: row.placeCode,
      createdAt: row.createdAt,
      newCount: counted?.total ?? 0,
    });
  }
  return out;
}
