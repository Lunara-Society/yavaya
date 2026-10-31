import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { goDrivers, goTracking, locations, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import {
  addMenuItem,
  applyDriver,
  claimOrder,
  markDelivered,
  markPickedUp,
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
} from '@/server/domains/go/service';
import { myActiveDeliveries, publicMapSummary } from '@/server/domains/go/live-map';
import { markAsDemo } from '@/server/domains/platform/demo';
import { GO_RULES, GO_TRIP_RULES } from '@/config/business-rules';
import { GO_DEMO, demoDurationSeconds, demoFrame, offsetPoint } from '@/config/go-demo';
import { resetTransactionalData } from '../helpers/database';

/**
 * The public live map: what it may show anyone, and what it must not.
 * The demonstration is tested here for being the same every time; that it
 * sends nothing to the server is checked in a browser (tests/e2e).
 */

const context = { networkHash: null, addressHash: 'live-map-test', deviceFingerprint: null, userAgent: 'vitest' };
let city: { id: string; latitude: number; longitude: number };

async function member(name = 'Persona') {
  const { userId } = await register(
    db(),
    { email: `map-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    { ...context, addressHash: `live-map-${crypto.randomUUID()}` },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function reviewer() {
  const userId = await member('Revisora');
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'district_reviewer', grantedBy: null }));
  return { userId, status: 'active' as const };
}

const image = () => {
  const id = crypto.randomUUID();
  return { id, storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 10, sourceSha256: id };
};

async function openStore(name = 'Comedor La Esquina') {
  const owner = await member('Dueña');
  const storeId = await db().transaction((tx) =>
    saveStore(tx, {
      userId: owner,
      input: storeInputSchema.parse({
        name,
        category: 'food',
        about: 'Comida casera, hecha al momento cada día.',
        locationId: city.id,
        address: 'Frente al parque, casa azul',
        latitude: city.latitude,
        longitude: city.longitude,
        whatsapp: '+50588881111',
        hours: 'Todos los días',
        deliveryFee: '40',
        minimumOrder: '1',
        prepMinutes: 20,
      }),
    }),
  );
  await db().transaction(async (tx) => reviewStore(tx, { actor: await reviewer(), storeId, decision: 'approve', note: null }));
  await db().transaction((tx) => setStoreOpen(tx, { userId: owner, open: true }));
  const item = await db().transaction((tx) => addMenuItem(tx, { userId: owner, input: { section: 'Platos', name: 'Plato del día', description: '', price: 150 } }));
  return { owner, storeId, item };
}

async function approvedDriver() {
  const userId = await member('Repartidor');
  await db().transaction((tx) =>
    applyDriver(tx, {
      userId,
      input: { vehicleType: 'motorcycle', vehicleDescription: 'Moto azul', plate: 'M 777777', locationId: city.id, whatsapp: '+50588882222' },
      photo: image(),
      document: image(),
    }),
  );
  await db().transaction(async (tx) => reviewDriver(tx, { actor: await reviewer(), driverUserId: userId, decision: 'approve', note: 'Llamé al número y el documento coincide.', phoneConfirmed: true }));
  await db().transaction((tx) => setDriverOnline(tx, { userId, online: true }));
  return userId;
}

/** An order a driver is carrying, with a position reported. */
async function carriedOrder() {
  const { owner, storeId, item } = await openStore();
  const customer = await member('Clienta');
  const driver = await approvedDriver();
  const dropoff = { latitude: city.latitude + 0.012, longitude: city.longitude - 0.008 };
  const { id } = await db().transaction((tx) =>
    placeOrder(tx, {
      customerUserId: customer,
      input: orderInputSchema.parse({
        storeId,
        lines: [{ itemId: item, quantity: 1 }],
        dropoffLatitude: dropoff.latitude,
        dropoffLongitude: dropoff.longitude,
        dropoffDirections: 'Portón verde junto a la farmacia',
        whatsapp: '+50588883333',
        payingWith: '',
        note: '',
      }),
    }),
  );
  await db().transaction((tx) => storeAnswer(tx, { userId: owner, orderId: id, accept: true }));
  await db().transaction((tx) => claimOrder(tx, { userId: driver, orderId: id }));
  const position = { orderId: id, latitude: city.latitude + 0.004, longitude: city.longitude + 0.003, accuracy: 10, heading: 45 };
  await db().transaction((tx) => recordPosition(tx, { userId: driver, position }));
  return { owner, storeId, customer, driver, orderId: id, dropoff, position };
}

describe('the public live map', () => {
  beforeAll(async () => {
    const [launch] = await db().select().from(locations).where(eq(locations.code, GO_TRIP_RULES.launchPlaceCode)).limit(1);
    const fallback = (await db().select().from(locations).where(eq(locations.level, 'city'))).find((c) => c.latitude !== null)!;
    const row = launch?.latitude != null ? launch : fallback;
    city = { id: row.id, latitude: row.latitude!, longitude: row.longitude! };
  });
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('works with nothing at all: no stores, no drivers, no deliveries', async () => {
    const summary = await publicMapSummary(db());
    expect(summary.stores).toEqual([]);
    expect(summary.activeDeliveries).toBe(0);
    expect(summary.driversOnline).toEqual({ fewerThan: GO_RULES.publicMapMinCount });
  });

  it('counts deliveries and shows stores, but never where a driver or a customer is', async () => {
    const { storeId, dropoff, position } = await carriedOrder();
    const summary = await publicMapSummary(db());
    expect(summary.activeDeliveries).toBe(1);
    expect(summary.stores.map((s) => s.id)).toEqual([storeId]);
    const text = JSON.stringify(summary);
    for (const value of [position.latitude, position.longitude, dropoff.latitude, dropoff.longitude]) expect(text).not.toContain(String(value));
    expect(text).not.toContain('Portón');
    expect(text).not.toContain('+505');
  });

  it('withholds the number of drivers below the floor, and gives it from there', async () => {
    await approvedDriver();
    await approvedDriver();
    expect((await publicMapSummary(db())).driversOnline).toEqual({ fewerThan: GO_RULES.publicMapMinCount });
    for (let n = 2; n < GO_RULES.publicMapMinCount; n += 1) await approvedDriver();
    expect((await publicMapSummary(db())).driversOnline).toEqual({ count: GO_RULES.publicMapMinCount });
    // A driver whose phone went quiet is not counted as online, whatever the flag says.
    await db().update(goDrivers).set({ lastSeenAt: new Date(Date.now() - (GO_RULES.driverIdleMinutes + 1) * 60_000) });
    expect((await publicMapSummary(db())).driversOnline).toEqual({ fewerThan: GO_RULES.publicMapMinCount });
  });

  it('leaves registered demo stores and orders out of every figure', async () => {
    const { storeId, orderId } = await carriedOrder();
    await db().transaction(async (tx) => {
      await markAsDemo(tx, { subjectType: 'go_store', subjectId: storeId, district: 'yavayago', lifetimeDays: 7 });
      await markAsDemo(tx, { subjectType: 'go_order', subjectId: orderId, district: 'yavayago', lifetimeDays: 7 });
    });
    const summary = await publicMapSummary(db());
    expect(summary.stores).toEqual([]);
    expect(summary.activeDeliveries).toBe(0);
  });

  it('shows a member their own open deliveries, with the authorised tracking address, and nobody else’s', async () => {
    const { customer, owner, driver, orderId } = await carriedOrder();
    const mine = await myActiveDeliveries(db(), customer);
    expect(mine).toEqual([
      expect.objectContaining({ kind: 'order', id: orderId, carried: true, href: `/yavayago/orders/${orderId}`, trackingUrl: `/api/go/orders/${orderId}/tracking` }),
    ]);
    // The store and the driver are not its customer; a stranger even less.
    expect(await myActiveDeliveries(db(), owner)).toEqual([]);
    expect(await myActiveDeliveries(db(), driver)).toEqual([]);
    expect(await myActiveDeliveries(db(), await member('Otra'))).toEqual([]);
  });

  it('stops counting a delivery once it is delivered, and forgets its last point', async () => {
    const { owner, customer, driver, orderId } = await carriedOrder();
    await db().transaction((tx) => storeMarkReady(tx, { userId: owner, orderId }));
    await db().transaction((tx) => markPickedUp(tx, { userId: driver, orderId }));
    await db().transaction((tx) => markDelivered(tx, { userId: driver, orderId }));
    expect((await publicMapSummary(db())).activeDeliveries).toBe(0);
    expect(await myActiveDeliveries(db(), customer)).toEqual([]);
    expect(await db().select().from(goTracking).where(eq(goTracking.orderId, orderId))).toHaveLength(0);
  });
});

describe('the map demonstration', () => {
  it('is the same every time and runs from the driver to the store to the drop-off', () => {
    expect(demoFrame(0)).toEqual(demoFrame(0));
    expect(demoFrame(0)).toMatchObject({ phase: 'to_pickup', covered: 0, at: GO_DEMO.route[0] });
    const end = demoDurationSeconds();
    // At the store it waits, then goes on.
    const legs = GO_DEMO.route.slice(1, GO_DEMO.pickupIndex + 1).reduce((sum, step, i) => sum + Math.hypot(step.east - GO_DEMO.route[i]!.east, step.north - GO_DEMO.route[i]!.north), 0);
    const atStore = legs / GO_DEMO.playbackMetresPerSecond;
    expect(demoFrame(atStore + 0.5)).toMatchObject({ phase: 'at_pickup', at: GO_DEMO.route[GO_DEMO.pickupIndex] });
    expect(demoFrame(atStore + GO_DEMO.pickupPauseSeconds + 1).phase).toBe('to_dropoff');
    expect(demoFrame(end + 1)).toMatchObject({ phase: 'delivered', etaMinutes: 0, at: GO_DEMO.route[GO_DEMO.route.length - 1] });
  });

  it('counts its simulated arrival down, never up', () => {
    let last = Infinity;
    for (let t = 0; t <= demoDurationSeconds(); t += 2) {
      const { etaMinutes } = demoFrame(t);
      expect(etaMinutes).toBeLessThanOrEqual(last);
      last = etaMinutes;
    }
  });

  it('draws its route around whatever city it is given, a few kilometres across', () => {
    const center = { latitude: 12.13282, longitude: -86.2504 };
    const points = GO_DEMO.route.map((step) => offsetPoint(center, step));
    for (const p of points) {
      expect(Math.abs(p.latitude - center.latitude)).toBeLessThan(0.02);
      expect(Math.abs(p.longitude - center.longitude)).toBeLessThan(0.02);
    }
  });
});
