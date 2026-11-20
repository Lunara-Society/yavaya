import 'server-only';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { miradorBlocks, miradorOfferRequests, miradorOffers, miradorVideos, sanctuaryChurches, userProfiles, users } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import { errors } from '@/server/errors';
import { notify } from '@/server/domains/notifications/service';
import { recordAudit } from '@/server/domains/audit/service';
import { placeById } from '@/server/domains/geography/places';

/**
 * Offers on Mirador videos (docs/mirador/README.md, "Offers"): someone films
 * or photographs something they made — a dish, a cake, a craft — or have,
 * and whoever sees it can ask for it at once with "Lo quiero".
 *
 * Four kinds, each an honest promise:
 * - `sale` — at a price, paid between them at the pickup (Yavaya holds no
 *   money, as in Mercadito);
 * - `free` — given away, to any member who asks first;
 * - `contribution` — given for whatever the other person wants to give;
 * - `donation` — for soup kitchens: only a verified Santuario church may ask
 *   for it, because they are the ones who feed people living on the street;
 *   Yavaya cannot check a stranger who says they will.
 *
 * Food is the case that needs care: the creator writes what is in it, says
 * when it may be had (a day at most), and confirms the food rules (made
 * today, kept cold or hot, nothing on the not-allowed list). Yavaya inspects
 * no kitchen and says so where the buyer sees it.
 *
 * The exact pickup place and time are told only to someone whose request
 * was accepted; the public sees the area.
 */
export const OFFER_KINDS = ['sale', 'free', 'contribution', 'donation'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export const OFFER_CATEGORIES = ['food', 'baked', 'crafts', 'clothes', 'plants', 'other'] as const;
export type OfferCategory = (typeof OFFER_CATEGORIES)[number];
const FOOD: readonly string[] = ['food', 'baked'];

export const isFood = (category: string) => FOOD.includes(category);

export type OfferInput = {
  kind?: unknown;
  category?: unknown;
  title?: unknown;
  price?: unknown;
  unit?: unknown;
  quantity?: unknown;
  ingredients?: unknown;
  foodRules?: unknown;
  pickupDetails?: unknown;
  hours?: unknown;
};

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * A price as the member typed it ("80", "C$ 1,250.50", "1.250,50"), in minor
 * units; null when it is not a price. The last separator followed by one or
 * two digits is the decimal one; any other separator groups thousands.
 */
export function parsePrice(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(cleaned);
  const whole = (decimal ? cleaned.slice(0, decimal.index) : cleaned).replace(/[.,]/g, '');
  const amount = Number(`${whole || '0'}.${decimal?.[1] ?? '0'}`);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round(amount * 100);
}

/**
 * Puts an offer on the creator's own video, or changes it. The video must
 * say where it is (the pickup area), which also gives the currency.
 */
export async function saveOffer(tx: Executor, params: { userId: string; videoId: string; input: OfferInput; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const [video] = await tx
    .select({ id: miradorVideos.id, creator: miradorVideos.creatorUserId, status: miradorVideos.status, locationId: miradorVideos.locationId })
    .from(miradorVideos)
    .where(and(eq(miradorVideos.id, params.videoId), eq(miradorVideos.creatorUserId, params.userId)))
    .for('update');
  if (!video || video.status === 'removed' || video.status === 'failed') throw errors.notFound('mirador_video');
  const input = params.input;
  const kind = OFFER_KINDS.find((k) => k === input.kind);
  const category = OFFER_CATEGORIES.find((c) => c === input.category);
  if (!kind || !category) throw errors.validation('mirador.offer.error.kind');
  const title = text(input.title, MIRADOR_RULES.offerTitleMaxLength);
  if (title.length < 3) throw errors.validation('mirador.offer.error.title');
  const quantity = Number.parseInt(String(input.quantity ?? ''), 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MIRADOR_RULES.offerMaxQuantity) throw errors.validation('mirador.offer.error.quantity', { max: MIRADOR_RULES.offerMaxQuantity });
  const price = kind === 'sale' ? parsePrice(input.price) : null;
  if (kind === 'sale' && price === null) throw errors.validation('mirador.offer.error.price');
  if (!video.locationId) throw errors.validation('mirador.offer.error.place');
  const place = await placeById(tx, video.locationId);
  if (!place) throw errors.validation('mirador.offer.error.place');

  const food = isFood(category);
  const ingredients = text(input.ingredients, MIRADOR_RULES.offerIngredientsMaxLength);
  if (food && ingredients.length < 3) throw errors.validation('mirador.offer.error.ingredients');
  if (food && input.foodRules !== true) throw errors.validation('mirador.offer.error.food_rules');
  const hours = Number(input.hours);
  if (!(MIRADOR_RULES.offerHours as readonly number[]).includes(hours) || (food && hours > MIRADOR_RULES.foodMaxHours)) throw errors.validation('mirador.offer.error.hours', { max: MIRADOR_RULES.foodMaxHours });

  const [existing] = await tx.select().from(miradorOffers).where(eq(miradorOffers.videoId, video.id)).for('update');
  if (!existing || existing.status !== 'open') {
    // A few open at once, so the feed is not one person's shop window.
    const [{ open }] = (await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(miradorOffers)
      .where(and(eq(miradorOffers.creatorUserId, params.userId), eq(miradorOffers.status, 'open')))) as [{ open: number }];
    if (open >= MIRADOR_RULES.openOffersPerMember) throw errors.validation('mirador.offer.error.too_many', { max: MIRADOR_RULES.openOffersPerMember });
  }
  // Quantity already promised to accepted requests stays promised.
  const promised = existing ? existing.quantity - existing.remaining : 0;
  if (quantity < promised) throw errors.validation('mirador.offer.error.quantity_promised', { count: promised });

  const values = {
    kind,
    category,
    title,
    priceMinor: price,
    currency: place.currencyCode,
    unit: text(input.unit, 30) || null,
    quantity,
    remaining: quantity - promised,
    ingredients: food ? ingredients : text(input.ingredients, MIRADOR_RULES.offerIngredientsMaxLength) || null,
    foodRulesAt: food ? now : null,
    pickupLocationId: place.id,
    pickupDetails: text(input.pickupDetails, MIRADOR_RULES.offerPickupMaxLength),
    availableUntil: new Date(now.getTime() + hours * 3_600_000),
    status: 'open',
    closedAt: null,
  };
  if (existing) await tx.update(miradorOffers).set(values).where(eq(miradorOffers.videoId, video.id));
  else await tx.insert(miradorOffers).values({ videoId: video.id, creatorUserId: params.userId, createdAt: now, ...values });
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: existing ? 'mirador.offer_changed' : 'mirador.offer_opened', subjectType: 'mirador_video', subjectId: video.id, metadata: { kind, category, quantity } });
}

/** The creator ends an offer: no more requests; accepted ones stand. */
export async function closeOffer(tx: Executor, params: { userId: string; videoId: string; now?: Date }): Promise<void> {
  const closed = await tx
    .update(miradorOffers)
    .set({ status: 'closed', closedAt: params.now ?? new Date() })
    .where(and(eq(miradorOffers.videoId, params.videoId), eq(miradorOffers.creatorUserId, params.userId), eq(miradorOffers.status, 'open')))
    .returning({ id: miradorOffers.videoId });
  if (!closed.length) throw errors.notFound('mirador_offer');
}

async function verifiedKitchen(executor: Executor, userId: string): Promise<boolean> {
  const [church] = await executor
    .select({ id: sanctuaryChurches.id })
    .from(sanctuaryChurches)
    .where(and(eq(sanctuaryChurches.ownerUserId, userId), eq(sanctuaryChurches.status, 'approved')))
    .limit(1);
  return Boolean(church);
}

/**
 * "Lo quiero": a member asks for some of an offer. One request per member
 * per offer — asking again changes the quantity of the one still waiting.
 * The creator is told at once.
 */
export async function requestOffer(tx: Executor, params: { userId: string; videoId: string; quantity: unknown; note?: unknown; now?: Date }): Promise<{ id: string; status: string }> {
  const now = params.now ?? new Date();
  const [offer] = await tx
    .select({ offer: miradorOffers, removedAt: miradorVideos.removedAt, published: miradorVideos.publishedAt, videoStatus: miradorVideos.status })
    .from(miradorOffers)
    .innerJoin(miradorVideos, eq(miradorVideos.id, miradorOffers.videoId))
    .where(eq(miradorOffers.videoId, params.videoId))
    .limit(1);
  if (!offer || offer.removedAt || !offer.published || offer.videoStatus !== 'ready') throw errors.notFound('mirador_offer');
  const o = offer.offer;
  if (o.creatorUserId === params.userId) throw errors.validation('mirador.offer.error.own');
  if (o.status !== 'open' || o.availableUntil <= now) throw errors.conflict('mirador.offer.error.closed');
  const [blocked] = await tx
    .select({ x: miradorBlocks.blockerUserId })
    .from(miradorBlocks)
    .where(sql`(${miradorBlocks.blockerUserId} = ${params.userId} and ${miradorBlocks.blockedUserId} = ${o.creatorUserId}) or (${miradorBlocks.blockerUserId} = ${o.creatorUserId} and ${miradorBlocks.blockedUserId} = ${params.userId})`)
    .limit(1);
  if (blocked) throw errors.notFound('mirador_offer');
  if (o.kind === 'donation' && !(await verifiedKitchen(tx, params.userId))) throw errors.validation('mirador.offer.error.kitchens_only');
  const quantity = Number.parseInt(String(params.quantity ?? '1'), 10);
  if (!Number.isInteger(quantity) || quantity < 1) throw errors.validation('mirador.offer.error.quantity', { max: o.remaining });
  if (quantity > o.remaining) throw errors.conflict('mirador.offer.error.not_enough', { count: o.remaining });
  const note = typeof params.note === 'string' ? params.note.replace(/\s+/g, ' ').trim().slice(0, 200) || null : null;

  const [open] = await tx
    .select({ id: miradorOfferRequests.id, status: miradorOfferRequests.status })
    .from(miradorOfferRequests)
    .where(and(eq(miradorOfferRequests.videoId, o.videoId), eq(miradorOfferRequests.requesterUserId, params.userId), inArray(miradorOfferRequests.status, ['pending', 'accepted'])))
    .limit(1)
    .for('update');
  if (open?.status === 'accepted') throw errors.conflict('mirador.offer.error.already_accepted');
  let id: string;
  if (open) {
    await tx.update(miradorOfferRequests).set({ quantity, note, createdAt: now }).where(eq(miradorOfferRequests.id, open.id));
    id = open.id;
  } else {
    const [row] = await tx.insert(miradorOfferRequests).values({ videoId: o.videoId, requesterUserId: params.userId, quantity, note, createdAt: now }).returning({ id: miradorOfferRequests.id });
    id = row!.id;
  }
  const [who] = await tx.select({ name: users.displayName }).from(users).where(eq(users.id, params.userId)).limit(1);
  await notify(tx, [
    {
      userId: o.creatorUserId,
      category: 'mirador',
      type: 'mirador.offer_request',
      titleKey: 'mirador.notify.offer_request',
      params: { name: who?.name ?? '', count: quantity, title: o.title },
      href: '/mirador/estudio#pedidos',
      dedupeKey: `mirador.offer_request:${id}:${quantity}`,
      subjectId: o.videoId,
    },
  ]);
  return { id, status: 'pending' };
}

/**
 * The creator answers a request. Accepting takes the quantity out of what
 * is left, in this transaction, and tells the member where and when; it is
 * refused if there is no longer enough.
 */
export async function decideRequest(tx: Executor, params: { userId: string; requestId: string; accept: boolean; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const [row] = await tx
    .select({ request: miradorOfferRequests, offer: miradorOffers })
    .from(miradorOfferRequests)
    .innerJoin(miradorOffers, eq(miradorOffers.videoId, miradorOfferRequests.videoId))
    .where(eq(miradorOfferRequests.id, params.requestId))
    .for('update')
    .limit(1);
  if (!row || row.offer.creatorUserId !== params.userId) throw errors.notFound('mirador_offer_request');
  if (row.request.status !== 'pending') throw errors.conflict('mirador.offer.error.decided');
  if (params.accept) {
    if (row.request.quantity > row.offer.remaining) throw errors.conflict('mirador.offer.error.not_enough', { count: row.offer.remaining });
    await tx.update(miradorOffers).set({ remaining: row.offer.remaining - row.request.quantity }).where(eq(miradorOffers.videoId, row.offer.videoId));
  }
  await tx.update(miradorOfferRequests).set({ status: params.accept ? 'accepted' : 'declined', decidedAt: now }).where(eq(miradorOfferRequests.id, row.request.id));
  await notify(tx, [
    {
      userId: row.request.requesterUserId,
      category: 'mirador',
      type: params.accept ? 'mirador.offer_accepted' : 'mirador.offer_declined',
      titleKey: params.accept ? 'mirador.notify.offer_accepted' : 'mirador.notify.offer_declined',
      params: { title: row.offer.title },
      href: '/mirador/estudio#pedidos',
      dedupeKey: `mirador.offer_decided:${row.request.id}`,
      subjectId: row.offer.videoId,
    },
  ]);
}

/** The member who asked changes their mind: an accepted quantity goes back to what is left. */
export async function cancelRequest(tx: Executor, params: { userId: string; requestId: string; now?: Date }): Promise<void> {
  const [row] = await tx
    .select({ request: miradorOfferRequests, offer: miradorOffers })
    .from(miradorOfferRequests)
    .innerJoin(miradorOffers, eq(miradorOffers.videoId, miradorOfferRequests.videoId))
    .where(and(eq(miradorOfferRequests.id, params.requestId), eq(miradorOfferRequests.requesterUserId, params.userId)))
    .for('update')
    .limit(1);
  if (!row || (row.request.status !== 'pending' && row.request.status !== 'accepted')) throw errors.notFound('mirador_offer_request');
  if (row.request.status === 'accepted') await tx.update(miradorOffers).set({ remaining: Math.min(row.offer.quantity, row.offer.remaining + row.request.quantity) }).where(eq(miradorOffers.videoId, row.offer.videoId));
  await tx.update(miradorOfferRequests).set({ status: 'cancelled', decidedAt: params.now ?? new Date() }).where(eq(miradorOfferRequests.id, row.request.id));
  await notify(tx, [
    { userId: row.offer.creatorUserId, category: 'mirador', type: 'mirador.offer_cancelled', titleKey: 'mirador.notify.offer_cancelled', params: { title: row.offer.title }, href: '/mirador/estudio#pedidos', dedupeKey: `mirador.offer_cancelled:${row.request.id}`, subjectId: row.offer.videoId },
  ]);
}

/** Offers past their time close themselves (the scheduler). */
export async function expireOffers(executor: Executor, now = new Date()): Promise<number> {
  const rows = await executor
    .update(miradorOffers)
    .set({ status: 'expired', closedAt: now })
    .where(and(eq(miradorOffers.status, 'open'), lt(miradorOffers.availableUntil, now)))
    .returning({ id: miradorOffers.videoId });
  return rows.length;
}

export type OfferView = {
  kind: OfferKind;
  category: string;
  title: string;
  price: { minor: number; currency: string } | null;
  unit: string | null;
  quantity: number;
  remaining: number;
  ingredients: string | null;
  food: boolean;
  until: string;
  open: boolean;
  /** The viewer's own request on it, if any. */
  mine: { id: string; status: string; quantity: number } | null;
  /** The creator's WhatsApp, for a signed-in viewer, when the creator shares it on their listings. */
  whatsapp: string | null;
};

/** The offers of these videos, for this viewer. */
export async function offerViews(executor: Executor, params: { videoIds: string[]; viewerId: string | null; now?: Date }): Promise<Map<string, OfferView>> {
  const out = new Map<string, OfferView>();
  if (!params.videoIds.length) return out;
  const now = params.now ?? new Date();
  const rows = await executor
    .select({ offer: miradorOffers, whatsapp: userProfiles.whatsappE164 })
    .from(miradorOffers)
    .leftJoin(userProfiles, eq(userProfiles.userId, miradorOffers.creatorUserId))
    .where(inArray(miradorOffers.videoId, params.videoIds));
  const mine = params.viewerId
    ? await executor
        .select({ videoId: miradorOfferRequests.videoId, id: miradorOfferRequests.id, status: miradorOfferRequests.status, quantity: miradorOfferRequests.quantity })
        .from(miradorOfferRequests)
        .where(and(eq(miradorOfferRequests.requesterUserId, params.viewerId), inArray(miradorOfferRequests.videoId, params.videoIds), inArray(miradorOfferRequests.status, ['pending', 'accepted'])))
    : [];
  const mineBy = new Map(mine.map((row) => [row.videoId, row]));
  for (const { offer, whatsapp } of rows) {
    const request = mineBy.get(offer.videoId);
    out.set(offer.videoId, {
      kind: offer.kind as OfferKind,
      category: offer.category,
      title: offer.title,
      price: offer.priceMinor !== null ? { minor: offer.priceMinor, currency: offer.currency } : null,
      unit: offer.unit,
      quantity: offer.quantity,
      remaining: offer.remaining,
      ingredients: offer.ingredients,
      food: isFood(offer.category),
      until: offer.availableUntil.toISOString(),
      open: offer.status === 'open' && offer.availableUntil > now,
      mine: request ? { id: request.id, status: request.status, quantity: request.quantity } : null,
      // As in Mercadito: only to signed-in members, and only a number the creator chose to give.
      whatsapp: params.viewerId && params.viewerId !== offer.creatorUserId ? whatsapp ?? null : null,
    });
  }
  return out;
}

/**
 * The creator's side: requests on their offers, waiting ones first. The one
 * who asked is named, never given a phone number: they reach the creator,
 * as buyers reach sellers in Mercadito.
 */
export async function incomingRequests(executor: Executor, userId: string) {
  return executor
    .select({ id: miradorOfferRequests.id, videoId: miradorOfferRequests.videoId, title: miradorOffers.title, quantity: miradorOfferRequests.quantity, note: miradorOfferRequests.note, status: miradorOfferRequests.status, createdAt: miradorOfferRequests.createdAt, name: users.displayName, yayId: users.yayId, remaining: miradorOffers.remaining })
    .from(miradorOfferRequests)
    .innerJoin(miradorOffers, eq(miradorOffers.videoId, miradorOfferRequests.videoId))
    .innerJoin(users, eq(users.id, miradorOfferRequests.requesterUserId))
    .where(and(eq(miradorOffers.creatorUserId, userId), inArray(miradorOfferRequests.status, ['pending', 'accepted'])))
    .orderBy(sql`${miradorOfferRequests.status} = 'pending' desc`, desc(miradorOfferRequests.createdAt))
    .limit(100);
}

/** The asking side: what the member asked for, and for accepted ones where and when to pick it up. */
export async function outgoingRequests(executor: Executor, userId: string) {
  const rows = await executor
    .select({ id: miradorOfferRequests.id, videoId: miradorOfferRequests.videoId, title: miradorOffers.title, quantity: miradorOfferRequests.quantity, status: miradorOfferRequests.status, createdAt: miradorOfferRequests.createdAt, pickupDetails: miradorOffers.pickupDetails, name: users.displayName, whatsapp: userProfiles.whatsappE164 })
    .from(miradorOfferRequests)
    .innerJoin(miradorOffers, eq(miradorOffers.videoId, miradorOfferRequests.videoId))
    .innerJoin(users, eq(users.id, miradorOffers.creatorUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, miradorOffers.creatorUserId))
    .where(and(eq(miradorOfferRequests.requesterUserId, userId), inArray(miradorOfferRequests.status, ['pending', 'accepted', 'declined'])))
    .orderBy(desc(miradorOfferRequests.createdAt))
    .limit(50);
  // Where and when exactly, only once accepted. The creator's number is the one they share on their offers anyway.
  return rows.map((row) => ({ ...row, pickupDetails: row.status === 'accepted' ? row.pickupDetails : null }));
}
