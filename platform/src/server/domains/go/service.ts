import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import { goDrivers, goMenuItems, goOrders, goStores, goTracking, locations, userProfiles, users, type GoOrderLine } from '@/server/db/schema';
import { GO_RULES as R } from '@/config/business-rules';
import { GO_CATEGORIES, GO_VEHICLES, VEHICLES_WITH_PLATE } from '@/config/go';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { haversineKm } from '@/server/domains/geography/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { insertMediaRows, type StoredImage } from '@/server/domains/media/service';
import { notify } from '@/server/domains/notifications/service';
import { chargeForAction } from '@/server/domains/tokens/service';
import { getSetting } from '@/server/domains/platform/settings';
import { featuredFirst, featuredUntilAfterPurchase, isFeatured } from '@/server/domains/promotion/featured';

/**
 * YavayaGo: stores, their menus, the drivers Yavaya checked, and the orders
 * between them. See the schema for why no money passes through Yavaya.
 *
 * Who sees what is the heart of this module, so it is stated once here:
 * - a store is public (it is a public place), and so is its menu;
 * - the customer sees the driver's name, face, vehicle and plate, and where
 *   the driver is — only for their own order, only while it is on its way;
 * - the driver sees the exact drop-off point and the customer's WhatsApp —
 *   only after taking the order, and only until it ends;
 * - the store sees the order and the customer's first name, not where they live.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const STORE = 'go_store';
const DRIVER = 'go_driver';
const ORDER = 'go_order';

export const STORE_PHOTO_PURPOSE = 'go_store_photo';
export const ITEM_PHOTO_PURPOSE = 'go_item_photo';
export const DRIVER_PHOTO_PURPOSE = 'go_driver_photo';
/** Never served by the public media route; see PRIVATE_MEDIA_PURPOSES. */
export const DRIVER_DOCUMENT_PURPOSE = 'go_driver_document';

const OPEN_STATUSES = ['placed', 'accepted', 'ready', 'picked_up'] as const;
const DRIVER_ACTIVE_STATUSES = ['accepted', 'ready', 'picked_up'] as const;

const text = (min: number, max: number, key: string) =>
  z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(min, { message: key }).max(max, { message: key }));

const whatsapp = z.string().transform((value, ctx) => {
  const normalized = normalizeWhatsapp(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'go.error.whatsapp' });
  return normalized ?? '';
});

const latitude = z.number({ message: 'go.error.map_point' }).min(-90, { message: 'go.error.map_point' }).max(90, { message: 'go.error.map_point' });
const longitude = z.number({ message: 'go.error.map_point' }).min(-180, { message: 'go.error.map_point' }).max(180, { message: 'go.error.map_point' });

/** "45", "45.50", "1,250.00" → minor units in a two-decimal currency. Prices here are entered by people, so commas are allowed. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

const money = (key: string) =>
  z.string().transform((value, ctx) => {
    const minor = parseMoney(value);
    if (minor === null) ctx.addIssue({ code: 'custom', message: key });
    return minor ?? 0;
  });

async function activeMember(executor: Executor, userId: string): Promise<{ displayName: string }> {
  const [user] = await executor.select({ status: users.status, displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'go.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'go.error.account_restricted');
  return { displayName: user.displayName };
}

/** The currency of the country a place belongs to. A store prices in it; nothing converts. */
async function currencyOf(executor: Executor, locationId: string): Promise<string> {
  const [self] = await executor.select({ path: locations.path, currency: locations.currencyCode }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!self) throw errors.validation('go.error.location');
  if (self.currency) return self.currency;
  const chain = self.path.length > 0 ? await executor.select({ currency: locations.currencyCode, depth: locations.depth }).from(locations).where(inArray(locations.code, self.path)).orderBy(desc(locations.depth)) : [];
  const currency = chain.find((node) => node.currency)?.currency;
  if (!currency) throw errors.validation('go.error.location');
  return currency;
}

async function cityExists(executor: Executor, locationId: string): Promise<void> {
  const [row] = await executor.select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.isActive, true))).limit(1);
  if (!row) throw errors.validation('go.error.location');
}

// --- Stores ------------------------------------------------------------------------

export const storeInputSchema = z.object({
  name: text(2, 80, 'go.error.store_name'),
  category: z.enum(GO_CATEGORIES, { message: 'go.error.category' }),
  about: text(10, 600, 'go.error.about'),
  locationId: z.string().uuid({ message: 'go.error.location' }),
  address: text(5, 300, 'go.error.address'),
  latitude,
  longitude,
  whatsapp,
  hours: text(3, 200, 'go.error.hours'),
  deliveryFee: money('go.error.delivery_fee'),
  minimumOrder: money('go.error.minimum_order'),
  prepMinutes: z.number().int({ message: 'go.error.prep' }).min(5, { message: 'go.error.prep' }).max(180, { message: 'go.error.prep' }),
});
export type StoreInput = z.output<typeof storeInputSchema>;

/**
 * A member asks to open a store. It waits for a reviewer, who checks that
 * the place exists and the person runs it. A rejected application can be
 * corrected and sent again; an approved store's edits keep it approved.
 */
export async function saveStore(
  tx: Executor,
  params: { userId: string; input: StoreInput; photo?: StoredImage | null; audit?: AuditContext; now?: Date },
): Promise<string> {
  await activeMember(tx, params.userId);
  await cityExists(tx, params.input.locationId);
  const now = params.now ?? new Date();
  const currency = await currencyOf(tx, params.input.locationId);
  if (params.photo) await insertMediaRows(tx, { ownerUserId: params.userId, purpose: STORE_PHOTO_PURPOSE, images: [params.photo] });
  const { deliveryFee, minimumOrder, whatsapp: whatsappE164, ...rest } = params.input;
  const values = { ...rest, whatsappE164, currency, deliveryFeeMinor: deliveryFee, minimumOrderMinor: minimumOrder, updatedAt: now, ...(params.photo ? { photoMediaId: params.photo.id } : {}) };

  const [existing] = await tx.select().from(goStores).where(eq(goStores.ownerUserId, params.userId)).limit(1).for('update');
  if (existing?.status === 'suspended') throw new DomainError('forbidden', 'go.error.store_suspended');
  let id: string;
  if (existing) {
    // A rejected store goes back to the queue with its corrections.
    await tx.update(goStores).set({ ...values, ...(existing.status === 'rejected' ? { status: 'pending' as const } : {}) }).where(eq(goStores.id, existing.id));
    id = existing.id;
  } else {
    const [row] = await tx.insert(goStores).values({ ownerUserId: params.userId, ...values }).returning({ id: goStores.id });
    id = row!.id;
  }
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: existing ? 'go.store_updated' : 'go.store_applied', subjectType: STORE, subjectId: id, district: 'yavayago', ipHash: params.audit?.ipHash, userAgentHash: params.audit?.userAgentHash });
  return id;
}

export async function myStore(executor: Executor, userId: string) {
  const [store] = await executor.select().from(goStores).where(eq(goStores.ownerUserId, userId)).limit(1);
  return store ?? null;
}

/** Only an approved store opens; closing is always allowed. */
export async function setStoreOpen(tx: Executor, params: { userId: string; open: boolean }): Promise<void> {
  const store = await myStore(tx, params.userId);
  if (!store) throw errors.notFound(STORE);
  if (params.open && store.status !== 'approved') throw new DomainError('forbidden', 'go.error.store_not_approved');
  await tx.update(goStores).set({ isOpen: params.open, updatedAt: new Date() }).where(eq(goStores.id, store.id));
}

export async function goFeatureDays(executor: Executor): Promise<number> {
  return getSetting(executor, 'go.feature_days', R.featureDays);
}

/**
 * Features the owner's store: listed first among open stores, labelled
 * "Destacado", for `go.feature_days`. Stores pay no commission on orders;
 * this optional placement is what YavayaGo charges for.
 */
export async function featureStore(
  tx: Executor,
  params: { userId: string; purchaseId: string; now?: Date },
): Promise<{ featuredUntil: Date; cost: number }> {
  const now = params.now ?? new Date();
  const [store] = await tx.select().from(goStores).where(eq(goStores.ownerUserId, params.userId)).limit(1).for('update');
  if (!store) throw errors.notFound(STORE);
  if (store.status !== 'approved') throw new DomainError('forbidden', 'go.error.store_not_approved');
  const featuredUntil = featuredUntilAfterPurchase(store.featuredUntil, await goFeatureDays(tx), now);
  const charge = await chargeForAction(tx, {
    userId: params.userId,
    actionKey: 'go.feature_store',
    idempotencyKey: `go.feature:${params.purchaseId}`,
    relatedType: STORE,
    relatedId: store.id,
  });
  if (charge.deduplicated && charge.cost > 0) return { featuredUntil: store.featuredUntil ?? featuredUntil, cost: charge.cost };
  await tx.update(goStores).set({ featuredUntil, updatedAt: now }).where(eq(goStores.id, store.id));
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.userId,
    action: 'go.store_featured',
    subjectType: STORE,
    subjectId: store.id,
    district: 'yavayago',
    metadata: { cost: charge.cost, featuredUntil: featuredUntil.toISOString(), wasFeatured: isFeatured(store.featuredUntil, now) },
  });
  return { featuredUntil, cost: charge.cost };
}

export type ReviewDecision = 'approve' | 'reject' | 'suspend' | 'reinstate';

/** Cancels every open order of a store that can no longer serve them, telling each customer. */
async function cancelStoreOrders(tx: Executor, storeId: string, reason: string, now: Date): Promise<void> {
  const cancelled = await tx
    .update(goOrders)
    .set({ status: 'cancelled', closedAt: now, closedReason: reason, updatedAt: now })
    .where(and(eq(goOrders.storeId, storeId), inArray(goOrders.status, ['placed', 'accepted', 'ready'])))
    .returning({ id: goOrders.id, customerUserId: goOrders.customerUserId, driverUserId: goOrders.driverUserId, code: goOrders.code });
  if (cancelled.length === 0) return;
  await tx.delete(goTracking).where(inArray(goTracking.orderId, cancelled.map((o) => o.id)));
  await notify(tx, [
    ...cancelled.map((o) => ({ userId: o.customerUserId, category: 'yavayago' as const, type: 'go.order_cancelled', titleKey: 'notify.go.order_cancelled', params: { code: o.code }, href: `/yavayago/orders/${o.id}`, subjectId: o.id })),
    ...cancelled.filter((o) => o.driverUserId).map((o) => ({ userId: o.driverUserId!, category: 'yavayago' as const, type: 'go.order_cancelled', titleKey: 'notify.go.order_cancelled', params: { code: o.code }, href: '/yavayago/driver', subjectId: o.id })),
  ]);
}

export async function reviewStore(tx: Executor, params: { actor: AuthContext | null; storeId: string; decision: ReviewDecision; note: string | null; now?: Date }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'stores.review');
  const [store] = await tx.select().from(goStores).where(eq(goStores.id, params.storeId)).limit(1).for('update');
  if (!store) throw errors.notFound(STORE);
  if (actor.userId === store.ownerUserId) throw errors.forbidden('stores.review');
  const allowed: Record<ReviewDecision, string[]> = { approve: ['pending'], reject: ['pending'], suspend: ['approved'], reinstate: ['suspended'] };
  if (!allowed[params.decision].includes(store.status)) throw errors.conflict('go.error.review_state');
  if ((params.decision === 'reject' || params.decision === 'suspend') && !params.note) throw errors.validation('go.error.review_note');
  const now = params.now ?? new Date();
  const status = params.decision === 'approve' || params.decision === 'reinstate' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'suspended';
  await tx
    .update(goStores)
    .set({ status, reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: now, updatedAt: now, ...(status === 'approved' ? {} : { isOpen: false }) })
    .where(eq(goStores.id, store.id));
  if (status === 'suspended') await cancelStoreOrders(tx, store.id, 'store_suspended', now);
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `go.store_${status}`, subjectType: STORE, subjectId: store.id, district: 'yavayago' });
  await notify(tx, [{ userId: store.ownerUserId, category: 'yavayago', type: `go.store_${status}`, titleKey: `notify.go.store_${status}`, href: '/yavayago/store' }]);
}

export async function storeReviewQueue(executor: Executor, actor: AuthContext | null) {
  await requirePermission(executor, actor, 'stores.review');
  const rows = await executor
    .select({ store: goStores, placeName: locations.name, displayName: users.displayName, yayId: users.yayId, accountCreatedAt: users.createdAt })
    .from(goStores)
    .innerJoin(locations, eq(locations.id, goStores.locationId))
    .innerJoin(users, eq(users.id, goStores.ownerUserId))
    .where(inArray(goStores.status, ['pending', 'approved', 'suspended']))
    .orderBy(asc(goStores.status), asc(goStores.updatedAt))
    .limit(200);
  return rows.map((row) => ({ ...row.store, placeName: row.placeName, ownerName: row.displayName, ownerYayId: formatYayId(row.yayId), accountCreatedAt: row.accountCreatedAt }));
}

export type StoreCard = typeof goStores.$inferSelect & { placeName: string };

/** Approved stores in these places, open ones first. */
export async function browseStores(executor: Executor, params: { locationIds?: string[] | null; category?: string | null }): Promise<StoreCard[]> {
  const filters = [eq(goStores.status, 'approved')];
  if (params.locationIds && params.locationIds.length > 0) filters.push(inArray(goStores.locationId, params.locationIds));
  if (params.category && (GO_CATEGORIES as readonly string[]).includes(params.category)) filters.push(eq(goStores.category, params.category));
  const rows = await executor
    .select({ store: goStores, placeName: locations.name })
    .from(goStores)
    .innerJoin(locations, eq(locations.id, goStores.locationId))
    .where(and(...filters))
    // Open first; among them, featured stores (paid, and labelled) lead.
    .orderBy(desc(goStores.isOpen), featuredFirst(goStores.featuredUntil), asc(goStores.name))
    .limit(200);
  return rows.map((row) => ({ ...row.store, placeName: row.placeName }));
}

/** A store as the public sees it: approved only, unless the viewer owns it. */
export async function getStore(executor: Executor, storeId: string, viewerUserId?: string | null): Promise<StoreCard | null> {
  const [row] = await executor
    .select({ store: goStores, placeName: locations.name })
    .from(goStores)
    .innerJoin(locations, eq(locations.id, goStores.locationId))
    .where(eq(goStores.id, storeId))
    .limit(1);
  if (!row) return null;
  if (row.store.status !== 'approved' && row.store.ownerUserId !== viewerUserId) return null;
  return { ...row.store, placeName: row.placeName };
}

// --- Menu ---------------------------------------------------------------------------

export const menuItemInputSchema = z.object({
  section: text(1, 40, 'go.error.section'),
  name: text(2, 80, 'go.error.item_name'),
  description: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(300, { message: 'go.error.item_description' })),
  price: money('go.error.price').refine((minor) => minor > 0, { message: 'go.error.price' }),
});
export type MenuItemInput = z.output<typeof menuItemInputSchema>;

async function ownStore(executor: Executor, userId: string) {
  const store = await myStore(executor, userId);
  if (!store) throw errors.notFound(STORE);
  if (store.status === 'suspended') throw new DomainError('forbidden', 'go.error.store_suspended');
  return store;
}

export async function addMenuItem(tx: Executor, params: { userId: string; input: MenuItemInput; photo?: StoredImage | null }): Promise<string> {
  const store = await ownStore(tx, params.userId);
  const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(goMenuItems).where(and(eq(goMenuItems.storeId, store.id), isNull(goMenuItems.removedAt)))) as [{ n: number }];
  if (n >= R.menuMaxItems) throw errors.conflict('go.error.menu_full');
  if (params.photo) await insertMediaRows(tx, { ownerUserId: params.userId, purpose: ITEM_PHOTO_PURPOSE, images: [params.photo] });
  const { price, ...rest } = params.input;
  const [row] = await tx
    .insert(goMenuItems)
    .values({ storeId: store.id, ...rest, priceMinor: price, position: n, photoMediaId: params.photo?.id ?? null })
    .returning({ id: goMenuItems.id });
  return row!.id;
}

export async function updateMenuItem(tx: Executor, params: { userId: string; itemId: string; input: MenuItemInput }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  const { price, ...rest } = params.input;
  const updated = await tx
    .update(goMenuItems)
    .set({ ...rest, priceMinor: price, updatedAt: new Date() })
    .where(and(eq(goMenuItems.id, params.itemId), eq(goMenuItems.storeId, store.id), isNull(goMenuItems.removedAt)))
    .returning({ id: goMenuItems.id });
  if (updated.length === 0) throw errors.notFound('go_menu_item');
}

export async function setMenuItemAvailable(tx: Executor, params: { userId: string; itemId: string; available: boolean }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  await tx.update(goMenuItems).set({ available: params.available, updatedAt: new Date() }).where(and(eq(goMenuItems.id, params.itemId), eq(goMenuItems.storeId, store.id)));
}

/** Kept, not deleted: past orders copied its name and price, and still show them. */
export async function removeMenuItem(tx: Executor, params: { userId: string; itemId: string }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  await tx.update(goMenuItems).set({ removedAt: new Date(), available: false }).where(and(eq(goMenuItems.id, params.itemId), eq(goMenuItems.storeId, store.id)));
}

export async function storeMenu(executor: Executor, storeId: string, options: { includeUnavailable?: boolean } = {}) {
  const filters = [eq(goMenuItems.storeId, storeId), isNull(goMenuItems.removedAt)];
  if (!options.includeUnavailable) filters.push(eq(goMenuItems.available, true));
  return executor.select().from(goMenuItems).where(and(...filters)).orderBy(asc(goMenuItems.section), asc(goMenuItems.position), asc(goMenuItems.name));
}

// --- Drivers ------------------------------------------------------------------------

export const driverInputSchema = z
  .object({
    vehicleType: z.enum(GO_VEHICLES, { message: 'go.error.vehicle' }),
    vehicleDescription: text(3, 80, 'go.error.vehicle_description'),
    plate: z
      .string()
      .transform((value) => value.replace(/\s+/g, ' ').trim().toUpperCase())
      .pipe(z.string().max(16, { message: 'go.error.plate' }))
      .transform((value) => value || null),
    locationId: z.string().uuid({ message: 'go.error.location' }),
    whatsapp,
  })
  .superRefine((value, ctx) => {
    // The customer checks the plate at the door; a vehicle that carries one must give it.
    if (VEHICLES_WITH_PLATE.includes(value.vehicleType) && !value.plate) ctx.addIssue({ code: 'custom', path: ['plate'], message: 'go.error.plate' });
  });
export type DriverInput = z.output<typeof driverInputSchema>;

/**
 * A member asks to drive. The face photo and the identity document are both
 * required; the document is stored privately and seen only by a reviewer.
 */
export async function applyDriver(
  tx: Executor,
  params: { userId: string; input: DriverInput; photo: StoredImage | null; document: StoredImage | null; audit?: AuditContext; now?: Date },
): Promise<void> {
  await activeMember(tx, params.userId);
  await cityExists(tx, params.input.locationId);
  const now = params.now ?? new Date();
  const [existing] = await tx.select().from(goDrivers).where(eq(goDrivers.userId, params.userId)).limit(1).for('update');
  if (existing && existing.status !== 'rejected' && existing.status !== 'pending') throw errors.conflict('go.error.driver_exists');
  if (!existing && (!params.photo || !params.document)) throw errors.validation('go.error.driver_documents');
  if (params.photo) await insertMediaRows(tx, { ownerUserId: params.userId, purpose: DRIVER_PHOTO_PURPOSE, images: [params.photo] });
  if (params.document) await insertMediaRows(tx, { ownerUserId: params.userId, purpose: DRIVER_DOCUMENT_PURPOSE, images: [params.document] });
  const { whatsapp: whatsappE164, ...rest } = params.input;
  const media = { ...(params.photo ? { photoMediaId: params.photo.id } : {}), ...(params.document ? { documentMediaId: params.document.id } : {}) };
  if (existing) {
    await tx.update(goDrivers).set({ ...rest, whatsappE164, ...media, status: 'pending', updatedAt: now }).where(eq(goDrivers.userId, params.userId));
  } else {
    await tx.insert(goDrivers).values({ userId: params.userId, ...rest, whatsappE164, photoMediaId: params.photo!.id, documentMediaId: params.document!.id });
  }
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.driver_applied', subjectType: DRIVER, subjectId: params.userId, district: 'yavayago', ipHash: params.audit?.ipHash, userAgentHash: params.audit?.userAgentHash });
}

export async function myDriver(executor: Executor, userId: string) {
  const [driver] = await executor.select().from(goDrivers).where(eq(goDrivers.userId, userId)).limit(1);
  return driver ?? null;
}

/**
 * The reviewer's decision. Approval requires the reviewer to have spoken to
 * the driver on the phone they gave (or the account to have a phone verified
 * by SMS) and to say what they checked: the specification asks for identity,
 * a matching photo, the vehicle and the phone, and the note is the record
 * that someone actually looked.
 */
export async function reviewDriver(
  tx: Executor,
  params: { actor: AuthContext | null; driverUserId: string; decision: ReviewDecision; note: string | null; phoneConfirmed?: boolean; now?: Date },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'drivers.approve');
  if (actor.userId === params.driverUserId) throw errors.forbidden('drivers.approve');
  const [driver] = await tx.select().from(goDrivers).where(eq(goDrivers.userId, params.driverUserId)).limit(1).for('update');
  if (!driver) throw errors.notFound(DRIVER);
  const allowed: Record<ReviewDecision, string[]> = { approve: ['pending'], reject: ['pending'], suspend: ['approved'], reinstate: ['suspended'] };
  if (!allowed[params.decision].includes(driver.status)) throw errors.conflict('go.error.review_state');
  if (!params.note) throw errors.validation('go.error.review_note');
  if (params.decision === 'approve') {
    const [user] = await tx.select({ phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, driver.userId)).limit(1);
    if (!params.phoneConfirmed && !user?.phoneVerifiedAt) throw errors.validation('go.error.phone_unconfirmed');
  }
  const now = params.now ?? new Date();
  const status = params.decision === 'approve' || params.decision === 'reinstate' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'suspended';
  await tx
    .update(goDrivers)
    .set({ status, reviewNote: params.note, reviewedBy: actor.userId, reviewedAt: now, updatedAt: now, ...(status === 'approved' ? {} : { online: false }) })
    .where(eq(goDrivers.userId, driver.userId));
  if (status === 'suspended') {
    // Orders they had not picked up yet go back to other drivers.
    const released = await tx
      .update(goOrders)
      .set({ driverUserId: null, assignedAt: null, updatedAt: now })
      .where(and(eq(goOrders.driverUserId, driver.userId), inArray(goOrders.status, ['accepted', 'ready'])))
      .returning({ id: goOrders.id });
    if (released.length > 0) await tx.delete(goTracking).where(inArray(goTracking.orderId, released.map((o) => o.id)));
  }
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: `go.driver_${status}`,
    subjectType: DRIVER,
    subjectId: driver.userId,
    district: 'yavayago',
    metadata: params.decision === 'approve' ? { phoneConfirmedByCall: Boolean(params.phoneConfirmed) } : {},
  });
  await notify(tx, [{ userId: driver.userId, category: 'yavayago', type: `go.driver_${status}`, titleKey: `notify.go.driver_${status}`, href: '/yavayago/driver' }]);
}

export async function driverReviewQueue(executor: Executor, actor: AuthContext | null) {
  await requirePermission(executor, actor, 'drivers.review');
  const rows = await executor
    .select({ driver: goDrivers, placeName: locations.name, displayName: users.displayName, yayId: users.yayId, phoneVerifiedAt: users.phoneVerifiedAt, accountCreatedAt: users.createdAt })
    .from(goDrivers)
    .innerJoin(locations, eq(locations.id, goDrivers.locationId))
    .innerJoin(users, eq(users.id, goDrivers.userId))
    .where(inArray(goDrivers.status, ['pending', 'approved', 'suspended']))
    .orderBy(asc(goDrivers.status), asc(goDrivers.updatedAt))
    .limit(200);
  return rows.map((row) => ({ ...row.driver, placeName: row.placeName, displayName: row.displayName, yayId: formatYayId(row.yayId), phoneVerifiedAt: row.phoneVerifiedAt, accountCreatedAt: row.accountCreatedAt }));
}

/** Whether this person may see a driver's identity document: a reviewer, nobody else — not even the driver's customers. */
export async function canSeeDriverDocument(executor: Executor, actor: AuthContext | null, mediaId: string): Promise<boolean> {
  try {
    await requirePermission(executor, actor, 'drivers.review');
  } catch {
    return false;
  }
  const [row] = await executor.select({ id: goDrivers.userId }).from(goDrivers).where(eq(goDrivers.documentMediaId, mediaId)).limit(1);
  return Boolean(row);
}

export async function setDriverOnline(tx: Executor, params: { userId: string; online: boolean; now?: Date }): Promise<void> {
  const driver = await myDriver(tx, params.userId);
  if (!driver) throw errors.notFound(DRIVER);
  if (params.online && driver.status !== 'approved') throw new DomainError('forbidden', 'go.error.driver_not_approved');
  await tx.update(goDrivers).set({ online: params.online, lastSeenAt: params.now ?? new Date(), updatedAt: params.now ?? new Date() }).where(eq(goDrivers.userId, params.userId));
}

// --- Orders -------------------------------------------------------------------------

const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

async function freshCode(executor: Executor): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
    const [taken] = await executor.select({ id: goOrders.id }).from(goOrders).where(eq(goOrders.code, code)).limit(1);
    if (!taken) return code;
  }
  throw errors.internal('no free order code');
}

export const orderInputSchema = z.object({
  storeId: z.string().uuid({ message: 'go.error.store' }),
  lines: z
    .array(z.object({ itemId: z.string().uuid({ message: 'go.error.item' }), quantity: z.number().int().min(1, { message: 'go.error.quantity' }).max(R.maxQuantityPerLine, { message: 'go.error.quantity' }) }))
    .min(1, { message: 'go.error.empty_cart' })
    .max(R.maxLinesPerOrder, { message: 'go.error.too_many_lines' }),
  dropoffLatitude: latitude,
  dropoffLongitude: longitude,
  dropoffDirections: text(5, 300, 'go.error.directions'),
  whatsapp,
  payingWith: z
    .string()
    .transform((value, ctx) => {
      if (!value.trim()) return null;
      const minor = parseMoney(value);
      if (minor === null) ctx.addIssue({ code: 'custom', message: 'go.error.paying_with' });
      return minor;
    }),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(300, { message: 'go.error.note' }))
    .transform((value) => value || null),
});
export type OrderInput = z.output<typeof orderInputSchema>;

/**
 * A customer orders. Everything the money depends on is recomputed here from
 * the store's own menu — the browser's cart is a list of ids and quantities,
 * never prices.
 */
export async function placeOrder(tx: Executor, params: { customerUserId: string; input: OrderInput; audit?: AuditContext; now?: Date }): Promise<{ id: string; code: string }> {
  const customer = await activeMember(tx, params.customerUserId);
  const now = params.now ?? new Date();
  const input = params.input;
  const [store] = await tx.select().from(goStores).where(eq(goStores.id, input.storeId)).limit(1).for('share');
  if (!store || store.status !== 'approved') throw errors.notFound(STORE);
  if (!store.isOpen) throw errors.conflict('go.error.store_closed');
  if (store.ownerUserId === params.customerUserId) throw errors.conflict('go.error.own_store');

  const [{ open }] = (await tx
    .select({ open: sql<number>`count(*)::int` })
    .from(goOrders)
    .where(and(eq(goOrders.customerUserId, params.customerUserId), inArray(goOrders.status, [...OPEN_STATUSES])))) as [{ open: number }];
  if (open >= R.maxOpenOrdersPerCustomer) throw errors.conflict('go.error.too_many_open');

  const distance = haversineKm(store.latitude, store.longitude, input.dropoffLatitude, input.dropoffLongitude);
  if (distance > R.maxDeliveryKm) throw errors.validation('go.error.too_far', { maxKm: R.maxDeliveryKm });

  const ids = [...new Set(input.lines.map((line) => line.itemId))];
  const items = await tx
    .select()
    .from(goMenuItems)
    .where(and(inArray(goMenuItems.id, ids), eq(goMenuItems.storeId, store.id), isNull(goMenuItems.removedAt), eq(goMenuItems.available, true)));
  const byId = new Map(items.map((item) => [item.id, item]));
  const quantities = new Map<string, number>();
  for (const line of input.lines) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + line.quantity);
  const lines: GoOrderLine[] = [];
  for (const [itemId, quantity] of quantities) {
    const item = byId.get(itemId);
    if (!item) throw errors.conflict('go.error.item_unavailable');
    if (quantity > R.maxQuantityPerLine) throw errors.validation('go.error.quantity');
    lines.push({ itemId, name: item.name, priceMinor: item.priceMinor, quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.priceMinor * line.quantity, 0);
  if (subtotal < store.minimumOrderMinor) throw errors.validation('go.error.below_minimum');
  const total = subtotal + store.deliveryFeeMinor;
  if (input.payingWith !== null && input.payingWith < total) throw errors.validation('go.error.paying_with');

  const code = await freshCode(tx);
  const [order] = await tx
    .insert(goOrders)
    .values({
      code,
      customerUserId: params.customerUserId,
      storeId: store.id,
      lines,
      currency: store.currency,
      subtotalMinor: subtotal,
      deliveryFeeMinor: store.deliveryFeeMinor,
      totalMinor: total,
      payingWithMinor: input.payingWith,
      dropoffLatitude: input.dropoffLatitude,
      dropoffLongitude: input.dropoffLongitude,
      dropoffDirections: input.dropoffDirections,
      customerWhatsappE164: input.whatsapp,
      note: input.note,
      placedAt: now,
      updatedAt: now,
    })
    .returning({ id: goOrders.id });
  const id = order!.id;
  await recordAudit(tx, { actorType: 'user', actorUserId: params.customerUserId, action: 'go.order_placed', subjectType: ORDER, subjectId: id, district: 'yavayago', ipHash: params.audit?.ipHash, userAgentHash: params.audit?.userAgentHash, metadata: { storeId: store.id, totalMinor: total, currency: store.currency } });
  await notify(tx, [{ userId: store.ownerUserId, category: 'yavayago', type: 'go.order_new', titleKey: 'notify.go.order_new', params: { code, name: customer.displayName.split(' ')[0] ?? '' }, href: '/yavayago/store', subjectId: id, dedupeKey: `go.order_new:${id}` }]);
  return { id, code };
}

type OrderRow = typeof goOrders.$inferSelect;

async function lockOrder(tx: Executor, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(goOrders).where(eq(goOrders.id, orderId)).limit(1).for('update');
  if (!order) throw errors.notFound(ORDER);
  return order;
}

async function transition(
  tx: Executor,
  params: { order: OrderRow; to: OrderRow['status']; actorUserId: string; set?: Partial<OrderRow>; reason?: string | null; now: Date },
): Promise<void> {
  const closing = params.to === 'delivered' || params.to === 'cancelled' || params.to === 'rejected';
  await tx
    .update(goOrders)
    .set({ status: params.to, updatedAt: params.now, ...(closing ? { closedAt: params.now, closedReason: params.reason ?? null } : {}), ...params.set })
    .where(eq(goOrders.id, params.order.id));
  if (closing) await tx.delete(goTracking).where(eq(goTracking.orderId, params.order.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.actorUserId, action: `go.order_${params.to}`, subjectType: ORDER, subjectId: params.order.id, district: 'yavayago', metadata: params.reason ? { reason: params.reason } : {} });
}

const customerLink = (orderId: string) => `/yavayago/orders/${orderId}`;

/** The store accepts or turns down a new order. */
export async function storeAnswer(tx: Executor, params: { userId: string; orderId: string; accept: boolean; reason?: string | null; now?: Date }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  const order = await lockOrder(tx, params.orderId);
  if (order.storeId !== store.id) throw errors.notFound(ORDER);
  if (order.status !== 'placed') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  if (params.accept) {
    await transition(tx, { order, to: 'accepted', actorUserId: params.userId, set: { acceptedAt: now }, now });
  } else {
    await transition(tx, { order, to: 'rejected', actorUserId: params.userId, reason: params.reason ?? 'store_declined', now });
  }
  await notify(tx, [{ userId: order.customerUserId, category: 'yavayago', type: params.accept ? 'go.order_accepted' : 'go.order_rejected', titleKey: params.accept ? 'notify.go.order_accepted' : 'notify.go.order_rejected', params: { code: order.code, store: store.name }, href: customerLink(order.id), subjectId: order.id }]);
  if (params.accept) await alertDrivers(tx, store, order);
}

/** Online drivers in the store's city hear about an order they could take. */
async function alertDrivers(tx: Executor, store: typeof goStores.$inferSelect, order: OrderRow): Promise<void> {
  const drivers = await tx
    .select({ userId: goDrivers.userId })
    .from(goDrivers)
    .where(and(eq(goDrivers.status, 'approved'), eq(goDrivers.online, true), eq(goDrivers.locationId, store.locationId), ne(goDrivers.userId, order.customerUserId)))
    .limit(50);
  await notify(
    tx,
    drivers.map((d) => ({ userId: d.userId, category: 'yavayago' as const, type: 'go.order_available', titleKey: 'notify.go.order_available', params: { store: store.name }, href: '/yavayago/driver', subjectId: order.id, dedupeKey: `go.order_available:${order.id}:${d.userId}` })),
  );
}

export async function storeMarkReady(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  const order = await lockOrder(tx, params.orderId);
  if (order.storeId !== store.id) throw errors.notFound(ORDER);
  if (order.status !== 'accepted') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  await transition(tx, { order, to: 'ready', actorUserId: params.userId, set: { readyAt: now }, now });
  if (order.driverUserId) await notify(tx, [{ userId: order.driverUserId, category: 'yavayago', type: 'go.order_ready', titleKey: 'notify.go.order_ready', params: { code: order.code, store: store.name }, href: '/yavayago/driver', subjectId: order.id }]);
}

/** The store cancels an order it accepted, before a driver has it. */
export async function storeCancel(tx: Executor, params: { userId: string; orderId: string; reason: string; now?: Date }): Promise<void> {
  const store = await ownStore(tx, params.userId);
  const order = await lockOrder(tx, params.orderId);
  if (order.storeId !== store.id) throw errors.notFound(ORDER);
  if (order.status !== 'accepted' && order.status !== 'ready') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  await transition(tx, { order, to: 'cancelled', actorUserId: params.userId, reason: params.reason || 'store_cancelled', now });
  await notify(tx, [
    { userId: order.customerUserId, category: 'yavayago', type: 'go.order_cancelled', titleKey: 'notify.go.order_cancelled', params: { code: order.code }, href: customerLink(order.id), subjectId: order.id },
    ...(order.driverUserId ? [{ userId: order.driverUserId, category: 'yavayago' as const, type: 'go.order_cancelled', titleKey: 'notify.go.order_cancelled', params: { code: order.code }, href: '/yavayago/driver', subjectId: order.id }] : []),
  ]);
}

/** The customer changes their mind — only before the store has started. */
export async function customerCancel(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  const order = await lockOrder(tx, params.orderId);
  if (order.customerUserId !== params.userId) throw errors.notFound(ORDER);
  if (order.status !== 'placed') throw errors.conflict('go.error.cancel_too_late');
  const now = params.now ?? new Date();
  await transition(tx, { order, to: 'cancelled', actorUserId: params.userId, reason: 'customer_cancelled', now });
  const [store] = await tx.select({ ownerUserId: goStores.ownerUserId }).from(goStores).where(eq(goStores.id, order.storeId)).limit(1);
  if (store) await notify(tx, [{ userId: store.ownerUserId, category: 'yavayago', type: 'go.order_cancelled', titleKey: 'notify.go.order_cancelled', params: { code: order.code }, href: '/yavayago/store', subjectId: order.id }]);
}

async function activeDriver(executor: Executor, userId: string) {
  const driver = await myDriver(executor, userId);
  if (!driver || driver.status !== 'approved') throw new DomainError('forbidden', 'go.error.driver_not_approved');
  return driver;
}

/** A driver takes an order. One at a time: the customer was promised this driver, not a queue. */
export async function claimOrder(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  const driver = await activeDriver(tx, params.userId);
  if (!driver.online) throw new DomainError('forbidden', 'go.error.driver_offline');
  const now = params.now ?? new Date();
  const [busy] = await tx.select({ id: goOrders.id }).from(goOrders).where(and(eq(goOrders.driverUserId, params.userId), inArray(goOrders.status, [...DRIVER_ACTIVE_STATUSES]))).limit(1);
  if (busy) throw errors.conflict('go.error.driver_busy');
  const order = await lockOrder(tx, params.orderId);
  if (order.driverUserId) throw errors.conflict('go.error.already_taken');
  if (order.status !== 'accepted' && order.status !== 'ready') throw errors.conflict('go.error.order_state');
  if (order.customerUserId === params.userId) throw errors.conflict('go.error.own_order');
  const [store] = await tx.select().from(goStores).where(eq(goStores.id, order.storeId)).limit(1);
  if (!store || store.locationId !== driver.locationId) throw errors.notFound(ORDER);
  if (store.ownerUserId === params.userId) throw errors.conflict('go.error.own_order');
  await tx.update(goOrders).set({ driverUserId: params.userId, assignedAt: now, updatedAt: now }).where(eq(goOrders.id, order.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.order_assigned', subjectType: ORDER, subjectId: order.id, district: 'yavayago' });
  const [me] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, params.userId)).limit(1);
  await notify(tx, [
    { userId: order.customerUserId, category: 'yavayago', type: 'go.driver_assigned', titleKey: 'notify.go.driver_assigned', params: { code: order.code, driver: me?.displayName ?? '' }, href: customerLink(order.id), subjectId: order.id },
    { userId: store.ownerUserId, category: 'yavayago', type: 'go.driver_assigned', titleKey: 'notify.go.driver_assigned_store', params: { code: order.code, driver: me?.displayName ?? '' }, href: '/yavayago/store', subjectId: order.id },
  ]);
}

/** The driver hands an order back before picking it up. */
export async function releaseOrder(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  const order = await lockOrder(tx, params.orderId);
  if (order.driverUserId !== params.userId) throw errors.notFound(ORDER);
  if (order.status !== 'accepted' && order.status !== 'ready') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  await tx.update(goOrders).set({ driverUserId: null, assignedAt: null, updatedAt: now }).where(eq(goOrders.id, order.id));
  await tx.delete(goTracking).where(eq(goTracking.orderId, order.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.order_released', subjectType: ORDER, subjectId: order.id, district: 'yavayago' });
  await notify(tx, [{ userId: order.customerUserId, category: 'yavayago', type: 'go.driver_released', titleKey: 'notify.go.driver_released', params: { code: order.code }, href: customerLink(order.id), subjectId: order.id }]);
  const [store] = await tx.select().from(goStores).where(eq(goStores.id, order.storeId)).limit(1);
  if (store) await alertDrivers(tx, store, order);
}

export async function markPickedUp(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  await activeDriver(tx, params.userId);
  const order = await lockOrder(tx, params.orderId);
  if (order.driverUserId !== params.userId) throw errors.notFound(ORDER);
  if (order.status !== 'ready' && order.status !== 'accepted') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  await transition(tx, { order, to: 'picked_up', actorUserId: params.userId, set: { pickedUpAt: now, ...(order.readyAt ? {} : { readyAt: now }) }, now });
  await notify(tx, [{ userId: order.customerUserId, category: 'yavayago', type: 'go.order_on_the_way', titleKey: 'notify.go.order_on_the_way', params: { code: order.code }, href: customerLink(order.id), subjectId: order.id }]);
}

export async function markDelivered(tx: Executor, params: { userId: string; orderId: string; now?: Date }): Promise<void> {
  const order = await lockOrder(tx, params.orderId);
  if (order.driverUserId !== params.userId) throw errors.notFound(ORDER);
  if (order.status !== 'picked_up') throw errors.conflict('go.error.order_state');
  const now = params.now ?? new Date();
  await transition(tx, { order, to: 'delivered', actorUserId: params.userId, set: { deliveredAt: now }, now });
  const [store] = await tx.select({ ownerUserId: goStores.ownerUserId }).from(goStores).where(eq(goStores.id, order.storeId)).limit(1);
  await notify(tx, [
    { userId: order.customerUserId, category: 'yavayago', type: 'go.order_delivered', titleKey: 'notify.go.order_delivered', params: { code: order.code }, href: customerLink(order.id), subjectId: order.id },
    ...(store ? [{ userId: store.ownerUserId, category: 'yavayago' as const, type: 'go.order_delivered', titleKey: 'notify.go.order_delivered', params: { code: order.code }, href: '/yavayago/store', subjectId: order.id }] : []),
  ]);
}

// --- What each side sees -----------------------------------------------------------------

export type DriverCard = { name: string; photoMediaId: string; vehicleType: string; vehicleDescription: string; plate: string | null; whatsappE164: string };

async function driverCard(executor: Executor, userId: string): Promise<DriverCard | null> {
  const [row] = await executor
    .select({ name: users.displayName, photoMediaId: goDrivers.photoMediaId, vehicleType: goDrivers.vehicleType, vehicleDescription: goDrivers.vehicleDescription, plate: goDrivers.plate, whatsappE164: goDrivers.whatsappE164 })
    .from(goDrivers)
    .innerJoin(users, eq(users.id, goDrivers.userId))
    .where(eq(goDrivers.userId, userId))
    .limit(1);
  return row ?? null;
}

/** The customer's view of their own order, with the driver's card once assigned. */
export async function orderForCustomer(executor: Executor, userId: string, orderId: string) {
  const [row] = await executor
    .select({ order: goOrders, store: goStores })
    .from(goOrders)
    .innerJoin(goStores, eq(goStores.id, goOrders.storeId))
    .where(eq(goOrders.id, orderId))
    .limit(1);
  if (!row || row.order.customerUserId !== userId) return null;
  const driver = row.order.driverUserId ? await driverCard(executor, row.order.driverUserId) : null;
  return { order: row.order, store: row.store, driver };
}

export async function customerOrders(executor: Executor, userId: string) {
  return executor
    .select({ order: goOrders, storeName: goStores.name })
    .from(goOrders)
    .innerJoin(goStores, eq(goStores.id, goOrders.storeId))
    .where(eq(goOrders.customerUserId, userId))
    .orderBy(desc(goOrders.placedAt))
    .limit(50);
}

/** A store's orders: open ones always, closed ones from the last day. The customer's address is not part of it. */
export async function storeOrders(executor: Executor, userId: string, now = new Date()) {
  const store = await myStore(executor, userId);
  if (!store) return [];
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await executor
    .select({
      id: goOrders.id,
      code: goOrders.code,
      status: goOrders.status,
      lines: goOrders.lines,
      currency: goOrders.currency,
      subtotalMinor: goOrders.subtotalMinor,
      deliveryFeeMinor: goOrders.deliveryFeeMinor,
      totalMinor: goOrders.totalMinor,
      note: goOrders.note,
      placedAt: goOrders.placedAt,
      customerName: users.displayName,
      driverUserId: goOrders.driverUserId,
    })
    .from(goOrders)
    .innerJoin(users, eq(users.id, goOrders.customerUserId))
    .where(and(eq(goOrders.storeId, store.id), or(inArray(goOrders.status, [...OPEN_STATUSES]), gt(goOrders.closedAt, since))))
    .orderBy(desc(goOrders.placedAt))
    .limit(100);
  const drivers = new Map<string, DriverCard | null>();
  for (const row of rows) if (row.driverUserId && !drivers.has(row.driverUserId)) drivers.set(row.driverUserId, await driverCard(executor, row.driverUserId));
  return rows.map(({ customerName, driverUserId, ...row }) => ({ ...row, customerFirstName: customerName.split(' ')[0] ?? '', driver: driverUserId ? drivers.get(driverUserId) ?? null : null }));
}

/**
 * Orders an online driver could take: in their city, accepted by the store,
 * not yet taken. The drop-off is shown only as a distance — the exact point
 * is for whoever takes it.
 */
export async function availableOrders(executor: Executor, userId: string) {
  const driver = await myDriver(executor, userId);
  if (!driver || driver.status !== 'approved') return [];
  const rows = await executor
    .select({ order: goOrders, store: goStores })
    .from(goOrders)
    .innerJoin(goStores, eq(goStores.id, goOrders.storeId))
    .where(and(isNull(goOrders.driverUserId), inArray(goOrders.status, ['accepted', 'ready']), eq(goStores.locationId, driver.locationId), ne(goOrders.customerUserId, userId), ne(goStores.ownerUserId, userId)))
    .orderBy(asc(goOrders.placedAt))
    .limit(30);
  return rows.map(({ order, store }) => ({
    id: order.id,
    code: order.code,
    status: order.status,
    storeName: store.name,
    storeAddress: store.address,
    storeLatitude: store.latitude,
    storeLongitude: store.longitude,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    currency: order.currency,
    totalMinor: order.totalMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    distanceKm: order.dropoffLatitude !== null && order.dropoffLongitude !== null ? Math.round(haversineKm(store.latitude, store.longitude, order.dropoffLatitude, order.dropoffLongitude) * 10) / 10 : null,
  }));
}

/** The driver's current order, with what only they need: the exact drop-off and the customer's WhatsApp. */
export async function driverCurrentOrder(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ order: goOrders, store: goStores, customerName: users.displayName })
    .from(goOrders)
    .innerJoin(goStores, eq(goStores.id, goOrders.storeId))
    .innerJoin(users, eq(users.id, goOrders.customerUserId))
    .where(and(eq(goOrders.driverUserId, userId), inArray(goOrders.status, [...DRIVER_ACTIVE_STATUSES])))
    .limit(1);
  return row ?? null;
}

// --- Live tracking ------------------------------------------------------------------------

export const positionSchema = z.object({
  orderId: z.string().uuid(),
  latitude,
  longitude,
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
});

/**
 * The driver's phone reports where it is. Accepted only from the driver who
 * holds the order, only while it is theirs and open, and at most every few
 * seconds. Only the latest point is kept.
 */
export async function recordPosition(tx: Executor, params: { userId: string; position: z.output<typeof positionSchema>; now?: Date }): Promise<{ accepted: boolean }> {
  const now = params.now ?? new Date();
  const [order] = await tx.select({ id: goOrders.id, driverUserId: goOrders.driverUserId, status: goOrders.status }).from(goOrders).where(eq(goOrders.id, params.position.orderId)).limit(1);
  if (!order || order.driverUserId !== params.userId || !(DRIVER_ACTIVE_STATUSES as readonly string[]).includes(order.status)) throw errors.notFound(ORDER);
  const [last] = await tx.select({ recordedAt: goTracking.recordedAt }).from(goTracking).where(eq(goTracking.orderId, order.id)).limit(1);
  if (last && now.getTime() - last.recordedAt.getTime() < R.trackingMinIntervalSeconds * 1000) return { accepted: false };
  const values = {
    latitude: params.position.latitude,
    longitude: params.position.longitude,
    accuracy: params.position.accuracy == null ? null : Math.round(params.position.accuracy),
    heading: params.position.heading == null ? null : Math.round(params.position.heading),
    recordedAt: now,
  };
  await tx.insert(goTracking).values({ orderId: order.id, ...values }).onConflictDoUpdate({ target: goTracking.orderId, set: values });
  await tx.update(goDrivers).set({ lastSeenAt: now }).where(eq(goDrivers.userId, params.userId));
  return { accepted: true };
}

export type TrackingView = {
  status: OrderRow['status'];
  store: { latitude: number; longitude: number; name: string };
  dropoff: { latitude: number; longitude: number } | null;
  driver: { latitude: number; longitude: number; accuracy: number | null; heading: number | null; ageSeconds: number; live: boolean } | null;
};

/** What the customer's map shows. The driver's point only while the order is theirs and on its way to them. */
export async function trackingForCustomer(executor: Executor, userId: string, orderId: string, now = new Date()): Promise<TrackingView | null> {
  const found = await orderForCustomer(executor, userId, orderId);
  if (!found) return null;
  const { order, store } = found;
  let driver: TrackingView['driver'] = null;
  if (order.driverUserId && (DRIVER_ACTIVE_STATUSES as readonly string[]).includes(order.status)) {
    const [point] = await executor.select().from(goTracking).where(eq(goTracking.orderId, order.id)).limit(1);
    if (point) {
      const ageSeconds = Math.max(0, Math.round((now.getTime() - point.recordedAt.getTime()) / 1000));
      driver = { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, heading: point.heading, ageSeconds, live: ageSeconds <= R.trackingStaleSeconds };
    }
  }
  return {
    status: order.status,
    store: { latitude: store.latitude, longitude: store.longitude, name: store.name },
    dropoff: order.dropoffLatitude !== null && order.dropoffLongitude !== null ? { latitude: order.dropoffLatitude, longitude: order.dropoffLongitude } : null,
    driver,
  };
}

// --- Scheduled upkeep -----------------------------------------------------------------------

/**
 * Orders a store never answered are cancelled, so a customer is not left
 * waiting for food that is not coming; idle drivers go offline; and exact
 * drop-off points and phone numbers are erased a day after an order ends.
 */
export async function goUpkeep(database: Database, now = new Date()): Promise<{ expired: number; offline: number; erased: number }> {
  const answerBy = new Date(now.getTime() - R.storeAnswerMinutes * 60_000);
  const expired = await database.transaction(async (tx) => {
    const rows = await tx
      .update(goOrders)
      .set({ status: 'cancelled', closedAt: now, closedReason: 'store_no_answer', updatedAt: now })
      .where(and(eq(goOrders.status, 'placed'), lt(goOrders.placedAt, answerBy)))
      .returning({ id: goOrders.id, customerUserId: goOrders.customerUserId, code: goOrders.code });
    if (rows.length > 0) {
      await notify(tx, rows.map((o) => ({ userId: o.customerUserId, category: 'yavayago' as const, type: 'go.order_no_answer', titleKey: 'notify.go.order_no_answer', params: { code: o.code }, href: customerLink(o.id), subjectId: o.id })));
      for (const o of rows) await recordAudit(tx, { actorType: 'system', action: 'go.order_cancelled', subjectType: ORDER, subjectId: o.id, district: 'yavayago', metadata: { reason: 'store_no_answer' } });
    }
    return rows.length;
  });

  const idleSince = new Date(now.getTime() - R.driverIdleMinutes * 60_000);
  const offline = await database
    .update(goDrivers)
    .set({ online: false, updatedAt: now })
    .where(and(eq(goDrivers.online, true), or(isNull(goDrivers.lastSeenAt), lt(goDrivers.lastSeenAt, idleSince))))
    .returning({ userId: goDrivers.userId });

  await database.delete(goTracking).where(sql`${goTracking.orderId} in (select id from go_orders where status in ('delivered', 'cancelled', 'rejected'))`);
  const eraseBefore = new Date(now.getTime() - 24 * 3_600_000);
  const erased = await database
    .update(goOrders)
    .set({ dropoffLatitude: null, dropoffLongitude: null, dropoffDirections: null, customerWhatsappE164: null })
    .where(and(lt(goOrders.closedAt, eraseBefore), or(sql`${goOrders.dropoffLatitude} is not null`, sql`${goOrders.customerWhatsappE164} is not null`)))
    .returning({ id: goOrders.id });

  return { expired, offline: offline.length, erased: erased.length };
}

/**
 * Where a map should open for this member: their own place if they set one,
 * otherwise the first city of the first market Yavaya serves. Read from the
 * rows, never a place written into the code.
 */
export async function mapStart(executor: Executor, userId: string | null): Promise<{ latitude: number; longitude: number }> {
  if (userId) {
    const [own] = await executor
      .select({ latitude: locations.latitude, longitude: locations.longitude })
      .from(userProfiles)
      .innerJoin(locations, eq(locations.id, userProfiles.locationId))
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (own?.latitude != null && own.longitude != null) return { latitude: own.latitude, longitude: own.longitude };
  }
  const [first] = await executor
    .select({ latitude: locations.latitude, longitude: locations.longitude })
    .from(locations)
    .where(and(eq(locations.level, 'city'), eq(locations.isActive, true), sql`${locations.latitude} is not null`, sql`exists (select 1 from locations c where c.is_supported_market and c.code = any(${locations.path}))`))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .limit(1);
  return { latitude: first?.latitude ?? 0, longitude: first?.longitude ?? 0 };
}

/** A city's own coordinates, to open a map where a store or driver says they are. */
export async function placePoint(executor: Executor, locationId: string): Promise<{ latitude: number; longitude: number } | null> {
  const [row] = await executor.select({ latitude: locations.latitude, longitude: locations.longitude }).from(locations).where(eq(locations.id, locationId)).limit(1);
  return row?.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : null;
}

/** Every city's coordinates, so a map can follow the city chosen in a form. */
export async function cityPoints(executor: Executor): Promise<Record<string, { latitude: number; longitude: number }>> {
  const rows = await executor
    .select({ id: locations.id, latitude: locations.latitude, longitude: locations.longitude })
    .from(locations)
    .where(and(eq(locations.isActive, true), sql`${locations.latitude} is not null`, sql`${locations.longitude} is not null`));
  return Object.fromEntries(rows.map((row) => [row.id, { latitude: row.latitude!, longitude: row.longitude! }]));
}
