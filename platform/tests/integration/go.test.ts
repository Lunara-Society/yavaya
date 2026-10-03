import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { goDrivers, goOrders, goStores, goTracking, locations, media, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { readActiveImage } from '@/server/domains/media/service';
import {
  addMenuItem,
  applyDriver,
  availableOrders,
  canSeeDriverDocument,
  claimOrder,
  customerCancel,
  driverCurrentOrder,
  goUpkeep,
  markDelivered,
  markPickedUp,
  orderForCustomer,
  orderInputSchema,
  placeOrder,
  recordPosition,
  reviewDriver,
  reviewStore,
  saveStore,
  setDriverOnline,
  setStoreOpen,
  storeAnswer,
  storeInputSchema,
  storeMarkReady,
  storeOrders,
  trackingForCustomer,
  parseMoney,
} from '@/server/domains/go/service';
import { GO_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'go-test', deviceFingerprint: null, userAgent: 'vitest' };
let city: { id: string; latitude: number; longitude: number };
let otherCity: { id: string };

async function member(name = 'Persona') {
  const { userId } = await register(
    db(),
    { email: `go-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    // A different address each: these tests sign up more people than one address may.
    { ...context, addressHash: `go-test-${crypto.randomUUID()}` },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function reviewer() {
  const userId = await member('Revisora');
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'district_reviewer', grantedBy: null }));
  return { userId, status: 'active' as const };
}

/** A media row standing in for an uploaded image; storage is not under test here. */
function image() {
  const id = crypto.randomUUID();
  return { id, storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 10, sourceSha256: id };
}

function storeInput(overrides: Record<string, unknown> = {}) {
  return storeInputSchema.parse({
    name: 'Pupusería La Ceiba',
    category: 'food',
    about: 'Pupusas de queso y revueltas, hechas al momento.',
    locationId: city.id,
    address: 'Frente al parque central, casa verde',
    latitude: city.latitude,
    longitude: city.longitude,
    whatsapp: '+50370001111',
    hours: 'Lunes a sábado, 5 a 10 pm',
    deliveryFee: '1.50',
    minimumOrder: '3',
    prepMinutes: 20,
    ...overrides,
  });
}

async function openStore() {
  const owner = await member('Doña Marta');
  const storeId = await db().transaction((tx) => saveStore(tx, { userId: owner, input: storeInput() }));
  const rev = await reviewer();
  await db().transaction((tx) => reviewStore(tx, { actor: rev, storeId, decision: 'approve', note: null }));
  await db().transaction((tx) => setStoreOpen(tx, { userId: owner, open: true }));
  const pupusa = await db().transaction((tx) => addMenuItem(tx, { userId: owner, input: { section: 'Pupusas', name: 'Pupusa revuelta', description: '', price: 75 } }));
  return { owner, storeId, pupusa, rev };
}

async function approvedDriver(locationId = city.id) {
  const userId = await member('Carlos Pérez');
  await db().transaction((tx) =>
    applyDriver(tx, {
      userId,
      input: { vehicleType: 'motorcycle', vehicleDescription: 'Honda roja', plate: 'M 123456', locationId, whatsapp: '+50370002222' },
      photo: image(),
      document: image(),
    }),
  );
  const rev = await reviewer();
  await db().transaction((tx) => reviewDriver(tx, { actor: rev, driverUserId: userId, decision: 'approve', note: 'Llamé al número, documento coincide con la foto.', phoneConfirmed: true }));
  await db().transaction((tx) => setDriverOnline(tx, { userId, online: true }));
  return userId;
}

function order(storeId: string, itemId: string, overrides: Record<string, unknown> = {}) {
  return orderInputSchema.parse({
    storeId,
    lines: [{ itemId, quantity: 4 }],
    dropoffLatitude: city.latitude + 0.01,
    dropoffLongitude: city.longitude + 0.01,
    dropoffDirections: 'Portón negro, segunda casa después de la tienda',
    whatsapp: '+50370003333',
    payingWith: '10',
    note: '',
    ...overrides,
  });
}

describe('YavayaGo', () => {
  beforeAll(async () => {
    const [sv] = await db().select().from(locations).where(eq(locations.code, 'ca.sv')).limit(1);
    const cities = await db().select().from(locations).where(eq(locations.level, 'city'));
    const inSv = cities.filter((c) => c.path.includes(sv!.code) && c.latitude !== null);
    city = { id: inSv[0]!.id, latitude: inSv[0]!.latitude!, longitude: inSv[0]!.longitude! };
    otherCity = { id: inSv[1]?.id ?? cities.find((c) => c.id !== city.id)!.id };
  });
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('reads prices as people write them', () => {
    expect(parseMoney('45')).toBe(4500);
    expect(parseMoney('1,250.5')).toBe(125050);
    expect(parseMoney('0.75')).toBe(75);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });

  it('opens a store only after a reviewer approves it, priced in its country currency', async () => {
    const owner = await member();
    const storeId = await db().transaction((tx) => saveStore(tx, { userId: owner, input: storeInput() }));
    await expect(db().transaction((tx) => setStoreOpen(tx, { userId: owner, open: true }))).rejects.toMatchObject({ messageKey: 'go.error.store_not_approved' });
    const [store] = await db().select().from(goStores).where(eq(goStores.id, storeId));
    expect(store).toMatchObject({ status: 'pending', currency: 'USD', deliveryFeeMinor: 150, minimumOrderMinor: 300 });
    // The owner cannot approve their own store, even as a reviewer.
    await db().transaction((tx) => grantRole(tx, { userId: owner, roleKey: 'district_reviewer', grantedBy: null }));
    await expect(db().transaction((tx) => reviewStore(tx, { actor: { userId: owner, status: 'active' }, storeId, decision: 'approve', note: null }))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('computes the order from the store menu, never from the cart, and enforces the store limits', async () => {
    const { owner, storeId, pupusa } = await openStore();
    const customer = await member('Ana López');
    const placed = await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    const [row] = await db().select().from(goOrders).where(eq(goOrders.id, placed.id));
    expect(row).toMatchObject({ subtotalMinor: 300, deliveryFeeMinor: 150, totalMinor: 450, currency: 'USD', status: 'placed', paymentMethod: 'cash' });
    expect(placed.code).toMatch(/^[A-Z0-9]{6}$/);

    // Below the minimum, too far, the owner's own store, paying with less than the total.
    await expect(db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa, { lines: [{ itemId: pupusa, quantity: 1 }] }) }))).rejects.toMatchObject({ messageKey: 'go.error.below_minimum' });
    await expect(db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa, { dropoffLatitude: city.latitude + 1 }) }))).rejects.toMatchObject({ messageKey: 'go.error.too_far' });
    await expect(db().transaction((tx) => placeOrder(tx, { customerUserId: owner, input: order(storeId, pupusa) }))).rejects.toMatchObject({ messageKey: 'go.error.own_store' });
    await expect(db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa, { payingWith: '2' }) }))).rejects.toMatchObject({ messageKey: 'go.error.paying_with' });

    // A cap on open cash orders, against pranks.
    for (let i = 1; i < GO_RULES.maxOpenOrdersPerCustomer; i += 1) await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    await expect(db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }))).rejects.toMatchObject({ messageKey: 'go.error.too_many_open' });
  });

  it('does not let a store see where the customer lives', async () => {
    const { owner, storeId, pupusa } = await openStore();
    const customer = await member('Ana López');
    await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    const [seen] = await storeOrders(db(), owner);
    expect(seen).toMatchObject({ customerFirstName: 'Ana', totalMinor: 450 });
    expect(JSON.stringify(seen)).not.toContain('Portón');
    expect(JSON.stringify(seen)).not.toContain('+50370003333');
  });

  it('approves a driver only once someone confirmed their phone and wrote what they checked', async () => {
    const userId = await member();
    await db().transaction((tx) => applyDriver(tx, { userId, input: { vehicleType: 'motorcycle', vehicleDescription: 'Honda roja', plate: 'M 123', locationId: city.id, whatsapp: '+50370002222' }, photo: image(), document: image() }));
    const rev = await reviewer();
    await expect(db().transaction((tx) => reviewDriver(tx, { actor: rev, driverUserId: userId, decision: 'approve', note: null, phoneConfirmed: true }))).rejects.toMatchObject({ messageKey: 'go.error.review_note' });
    await expect(db().transaction((tx) => reviewDriver(tx, { actor: rev, driverUserId: userId, decision: 'approve', note: 'Documento revisado.' }))).rejects.toMatchObject({ messageKey: 'go.error.phone_unconfirmed' });
    await db().transaction((tx) => reviewDriver(tx, { actor: rev, driverUserId: userId, decision: 'approve', note: 'Documento revisado, llamé al número.', phoneConfirmed: true }));
    const [driver] = await db().select().from(goDrivers).where(eq(goDrivers.userId, userId));
    expect(driver?.status).toBe('approved');
  });

  it('never serves a driver document publicly; only a reviewer may see it', async () => {
    const userId = await member();
    const doc = image();
    await db().transaction((tx) => applyDriver(tx, { userId, input: { vehicleType: 'bicycle', vehicleDescription: 'Bicicleta azul', plate: '', locationId: city.id, whatsapp: '+50370002222' }, photo: image(), document: doc }));
    expect(await readActiveImage(db(), doc.id)).toBeNull();
    const [row] = await db().select({ purpose: media.purpose }).from(media).where(eq(media.id, doc.id));
    expect(row?.purpose).toBe('go_driver_document');
    expect(await canSeeDriverDocument(db(), { userId, status: 'active' }, doc.id)).toBe(false);
    expect(await canSeeDriverDocument(db(), await reviewer(), doc.id)).toBe(true);
  });

  it('requires a plate for a motorcycle or a car', async () => {
    const { driverInputSchema } = await import('@/server/domains/go/service');
    const parsed = driverInputSchema.safeParse({ vehicleType: 'car', vehicleDescription: 'Toyota gris', plate: '', locationId: city.id, whatsapp: '+50370002222' });
    expect(parsed.success).toBe(false);
  });

  it('runs an order end to end: the driver is shown to the customer, tracked live, and forgotten after delivery', async () => {
    const { owner, storeId, pupusa } = await openStore();
    const customer = await member('Ana López');
    const driver = await approvedDriver();
    const { id } = await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));

    // Nothing for drivers until the store accepts.
    expect(await availableOrders(db(), driver)).toHaveLength(0);
    await db().transaction((tx) => storeAnswer(tx, { userId: owner, orderId: id, accept: true }));
    const offered = await availableOrders(db(), driver);
    expect(offered).toHaveLength(1);
    // Before taking it, the driver sees a distance, not the address.
    expect(JSON.stringify(offered[0])).not.toContain('Portón');
    expect(offered[0]!.distanceKm).toBeGreaterThan(0);

    // A driver in another city does not see it, and cannot take it.
    const elsewhere = await approvedDriver(otherCity.id);
    expect(await availableOrders(db(), elsewhere)).toHaveLength(0);
    await expect(db().transaction((tx) => claimOrder(tx, { userId: elsewhere, orderId: id }))).rejects.toMatchObject({ code: 'not_found' });

    await db().transaction((tx) => claimOrder(tx, { userId: driver, orderId: id }));
    const current = await driverCurrentOrder(db(), driver);
    expect(current?.order.dropoffDirections).toContain('Portón');
    expect(current?.order.customerWhatsappE164).toBe('+50370003333');

    const view = await orderForCustomer(db(), customer, id);
    expect(view?.driver).toMatchObject({ name: 'Carlos Pérez', vehicleDescription: 'Honda roja', plate: 'M 123456' });

    // Only the assigned driver can report a position; too-frequent reports are ignored.
    const t0 = new Date();
    const position = { orderId: id, latitude: city.latitude + 0.002, longitude: city.longitude + 0.002, accuracy: 12, heading: 90 };
    await expect(db().transaction((tx) => recordPosition(tx, { userId: elsewhere, position, now: t0 }))).rejects.toMatchObject({ code: 'not_found' });
    expect((await db().transaction((tx) => recordPosition(tx, { userId: driver, position, now: t0 }))).accepted).toBe(true);
    expect((await db().transaction((tx) => recordPosition(tx, { userId: driver, position: { ...position, latitude: 0 }, now: new Date(t0.getTime() + 1000) }))).accepted).toBe(false);

    const tracked = await trackingForCustomer(db(), customer, id, new Date(t0.getTime() + 2000));
    expect(tracked?.driver).toMatchObject({ latitude: position.latitude, live: true });
    // Nobody else can track it.
    expect(await trackingForCustomer(db(), owner, id)).toBeNull();
    expect(await trackingForCustomer(db(), elsewhere, id)).toBeNull();
    // A stale point is shown as stale.
    expect((await trackingForCustomer(db(), customer, id, new Date(t0.getTime() + (GO_RULES.trackingStaleSeconds + 5) * 1000)))?.driver?.live).toBe(false);

    await db().transaction((tx) => storeMarkReady(tx, { userId: owner, orderId: id }));
    await db().transaction((tx) => markPickedUp(tx, { userId: driver, orderId: id }));
    await db().transaction((tx) => markDelivered(tx, { userId: driver, orderId: id }));
    expect(await db().select().from(goTracking).where(eq(goTracking.orderId, id))).toHaveLength(0);

    // A day later the exact drop-off and phone are erased.
    await goUpkeep(db(), new Date(Date.now() + 25 * 3_600_000));
    const [after] = await db().select().from(goOrders).where(eq(goOrders.id, id));
    expect(after).toMatchObject({ status: 'delivered', dropoffLatitude: null, dropoffDirections: null, customerWhatsappE164: null });
  });

  it('gives a driver one order at a time', async () => {
    const { owner, storeId, pupusa } = await openStore();
    const driver = await approvedDriver();
    const [c1, c2] = [await member(), await member()];
    const a = await db().transaction((tx) => placeOrder(tx, { customerUserId: c1, input: order(storeId, pupusa) }));
    const b = await db().transaction((tx) => placeOrder(tx, { customerUserId: c2, input: order(storeId, pupusa) }));
    for (const o of [a, b]) await db().transaction((tx) => storeAnswer(tx, { userId: owner, orderId: o.id, accept: true }));
    await db().transaction((tx) => claimOrder(tx, { userId: driver, orderId: a.id }));
    await expect(db().transaction((tx) => claimOrder(tx, { userId: driver, orderId: b.id }))).rejects.toMatchObject({ messageKey: 'go.error.driver_busy' });
  });

  it('lets a customer cancel only before the store starts, and cancels what a store never answers', async () => {
    const { owner, storeId, pupusa } = await openStore();
    const customer = await member();
    const first = await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    await db().transaction((tx) => storeAnswer(tx, { userId: owner, orderId: first.id, accept: true }));
    await expect(db().transaction((tx) => customerCancel(tx, { userId: customer, orderId: first.id }))).rejects.toMatchObject({ messageKey: 'go.error.cancel_too_late' });

    const second = await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    const result = await goUpkeep(db(), new Date(Date.now() + (GO_RULES.storeAnswerMinutes + 1) * 60_000));
    expect(result.expired).toBe(1);
    const [row] = await db().select().from(goOrders).where(eq(goOrders.id, second.id));
    expect(row).toMatchObject({ status: 'cancelled', closedReason: 'store_no_answer' });
  });

  it('cancels open orders and closes the store when a reviewer suspends it', async () => {
    const { storeId, pupusa, rev } = await openStore();
    const customer = await member();
    const { id } = await db().transaction((tx) => placeOrder(tx, { customerUserId: customer, input: order(storeId, pupusa) }));
    await db().transaction((tx) => reviewStore(tx, { actor: rev, storeId, decision: 'suspend', note: 'Reportes de cobros falsos.' }));
    const [store] = await db().select().from(goStores).where(eq(goStores.id, storeId));
    expect(store).toMatchObject({ status: 'suspended', isOpen: false });
    const [row] = await db().select().from(goOrders).where(eq(goOrders.id, id));
    expect(row?.status).toBe('cancelled');
  });
});
