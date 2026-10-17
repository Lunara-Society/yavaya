import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { goOrders, goStores, goTrips, locations, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { addMenuItem, applyDriver, markDelivered, markPickedUp, claimOrder, orderInputSchema, placeOrder, reviewDriver, reviewStore, saveStore, setDriverOnline, setStoreOpen, storeAnswer, storeInputSchema, driverCurrentOrder } from '@/server/domains/go/service';
import {
  availableTrips,
  chooseOffer,
  completeTrip,
  customerCancelTrip,
  driverArrived,
  driverCurrentTrip,
  driverDropTrip,
  offerOnTrip,
  recordTripPosition,
  requestTrip,
  sharedTrip,
  startTrip,
  trackingForShare,
  trackingForTripCustomer,
  tripForCustomer,
  tripInputSchema,
  tripsUpkeep,
  vehicleFits,
} from '@/server/domains/go/trips';
import { foundingUntilFor, planStatus } from '@/server/domains/go/plan';
import { GO_PLAN_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'go-trips-test', deviceFingerprint: null, userAgent: 'vitest' };
let city: { id: string; latitude: number; longitude: number };

async function member(name = 'Persona') {
  const { userId } = await register(
    db(),
    { email: `gt-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    { ...context, addressHash: `go-trips-${crypto.randomUUID()}` },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function reviewer() {
  const userId = await member('Revisora');
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'district_reviewer', grantedBy: null }));
  return { userId, status: 'active' as const };
}

function image() {
  const id = crypto.randomUUID();
  return { id, storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 10, sourceSha256: id };
}

async function driver(vehicleType: 'motorcycle' | 'car' | 'bicycle' = 'motorcycle', name = 'Carlos Pérez') {
  const userId = await member(name);
  await db().transaction((tx) =>
    applyDriver(tx, {
      userId,
      input: { vehicleType, vehicleDescription: 'Vehículo de prueba', plate: vehicleType === 'bicycle' ? null : 'M 123456', locationId: city.id, whatsapp: '+50588882222' },
      photo: image(),
      document: image(),
    }),
  );
  const rev = await reviewer();
  await db().transaction((tx) => reviewDriver(tx, { actor: rev, driverUserId: userId, decision: 'approve', note: 'Llamé y el documento coincide.', phoneConfirmed: true }));
  await db().transaction((tx) => setDriverOnline(tx, { userId, online: true }));
  return userId;
}

function ride(overrides: Record<string, unknown> = {}) {
  return tripInputSchema.parse({
    kind: 'ride',
    locationId: city.id,
    vehicleWanted: 'any',
    passengers: 1,
    description: '',
    pickupLatitude: city.latitude,
    pickupLongitude: city.longitude,
    pickupDirections: 'Frente a la iglesia, casa azul',
    dropoffLatitude: city.latitude + 0.02,
    dropoffLongitude: city.longitude + 0.02,
    dropoffDirections: 'Entrada principal del hospital',
    offeredFare: '80',
    purchaseBudget: '',
    whatsapp: '+50588883333',
    ...overrides,
  });
}

describe('Viajes y mandados', () => {
  beforeAll(async () => {
    const cities = await db().select().from(locations).where(eq(locations.level, 'city'));
    const one = cities.find((c) => c.latitude !== null && c.longitude !== null)!;
    city = { id: one.id, latitude: one.latitude!, longitude: one.longitude! };
  });
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('asks only what each kind needs, and refuses what makes no sense', () => {
    expect(tripInputSchema.safeParse({ ...ride(), kind: 'parcel', description: '' }).success).toBe(false);
    expect(() => ride({ kind: 'assist', description: 'Hacer la fila del banco', dropoffLatitude: null, dropoffLongitude: null, dropoffDirections: '' })).not.toThrow();
    expect(() => ride({ kind: 'ride', vehicleWanted: 'bicycle' })).toThrow();
    expect(() => ride({ kind: 'ride', vehicleWanted: 'motorcycle', passengers: 2 })).toThrow();
    expect(() => ride({ kind: 'parcel', description: 'Un sobre', purchaseBudget: '100' })).toThrow();
    expect(vehicleFits({ kind: 'ride', vehicleWanted: 'any' }, 'bicycle')).toBe(false);
    expect(vehicleFits({ kind: 'errand', vehicleWanted: 'any' }, 'bicycle')).toBe(true);
  });

  it('runs a ride end to end: offers, a counter-offer, the choice, live map, share link, done', async () => {
    const customer = await member('Ana López');
    const moto = await driver('motorcycle', 'Carlos Moto');
    const car = await driver('car', 'Luis Carro');
    const { id } = await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));

    // Both drivers see it, but only roughly where it starts.
    const seen = await availableTrips(db(), moto);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.area).not.toEqual({ latitude: city.latitude, longitude: city.longitude });
    expect(JSON.stringify(seen[0])).not.toContain('+50588883333');

    await db().transaction((tx) => offerOnTrip(tx, { userId: moto, tripId: id, fareMinor: 8000, etaMinutes: 5 }));
    await db().transaction((tx) => offerOnTrip(tx, { userId: car, tripId: id, fareMinor: 12000, etaMinutes: 8 }));
    // An absurd counter-offer is refused.
    await expect(db().transaction((tx) => offerOnTrip(tx, { userId: car, tripId: id, fareMinor: 8000 * 50, etaMinutes: 8 }))).rejects.toMatchObject({ messageKey: 'go.trip.error.fare' });

    const view = await tripForCustomer(db(), customer, id);
    expect(view!.offers.map((o) => o.fareMinor)).toEqual([8000, 12000]);
    const carOffer = view!.offers.find((o) => o.driver.userId === car)!;
    await db().transaction((tx) => chooseOffer(tx, { userId: customer, tripId: id, offerId: carOffer.id }));

    const after = await tripForCustomer(db(), customer, id);
    expect(after!.trip).toMatchObject({ status: 'accepted', agreedFareMinor: 12000, driverUserId: car });
    // The chosen driver now sees the exact point and the WhatsApp; the other does not hold it.
    const current = await driverCurrentTrip(db(), car);
    expect(current!.trip.pickupLatitude).toBe(city.latitude);
    expect(current!.trip.customerWhatsappE164).toBe('+50588883333');
    expect(await driverCurrentTrip(db(), moto)).toBeNull();
    await expect(db().transaction((tx) => recordTripPosition(tx, { userId: moto, position: { tripId: id, latitude: 1, longitude: 1 } }))).rejects.toMatchObject({ code: 'not_found' });

    await db().transaction((tx) => driverArrived(tx, { userId: car, tripId: id }));
    await db().transaction((tx) => startTrip(tx, { userId: car, tripId: id }));
    await db().transaction((tx) => recordTripPosition(tx, { userId: car, position: { tripId: id, latitude: city.latitude + 0.01, longitude: city.longitude + 0.01 } }));
    expect((await trackingForTripCustomer(db(), customer, id))!.driver).toMatchObject({ latitude: city.latitude + 0.01 });
    expect(await trackingForTripCustomer(db(), moto, id)).toBeNull();

    const [{ shareToken }] = (await db().select({ shareToken: goTrips.shareToken }).from(goTrips).where(eq(goTrips.id, id))) as [{ shareToken: string }];
    expect((await sharedTrip(db(), shareToken))!.active).toBe(true);
    expect((await trackingForShare(db(), shareToken))!.driver).not.toBeNull();
    await expect(db().transaction((tx) => customerCancelTrip(tx, { userId: customer, tripId: id }))).rejects.toMatchObject({ messageKey: 'go.trip.error.cancel_too_late' });

    await db().transaction((tx) => completeTrip(tx, { userId: car, tripId: id }));
    expect((await tripForCustomer(db(), customer, id))!.trip.status).toBe('completed');
    // The share link goes dark with the trip.
    expect(await trackingForShare(db(), shareToken)).toBeNull();
    expect((await sharedTrip(db(), shareToken))!.driver).toBeNull();
  });

  it('only shows a ride to drivers with a vehicle that can carry people', async () => {
    const customer = await member();
    const bike = await driver('bicycle', 'Bici');
    await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));
    expect(await availableTrips(db(), bike)).toHaveLength(0);
    const other = await member('Otra');
    await db().transaction((tx) => requestTrip(tx, { customerUserId: other, input: ride({ kind: 'errand', description: 'Pan y leche de la pulpería', purchaseBudget: '150' }) }));
    expect((await availableTrips(db(), bike)).map((t) => t.kind)).toEqual(['errand']);
  });

  it('keeps a driver to one job at a time, across orders and trips', async () => {
    const customer = await member('Cliente');
    const moto = await driver();
    const { id } = await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));
    await db().transaction((tx) => offerOnTrip(tx, { userId: moto, tripId: id, fareMinor: 8000, etaMinutes: 5 }));
    const offerId = (await tripForCustomer(db(), customer, id))!.offers[0]!.id;
    await db().transaction((tx) => chooseOffer(tx, { userId: customer, tripId: id, offerId }));

    // A food order cannot be claimed while the trip is going.
    const owner = await member('Dueña');
    const storeId = await db().transaction((tx) =>
      saveStore(tx, {
        userId: owner,
        input: storeInputSchema.parse({ name: 'Fritanga', category: 'food', about: 'Comida típica del barrio.', locationId: city.id, address: 'Frente al parque', latitude: city.latitude, longitude: city.longitude, whatsapp: '+50588881111', hours: 'Todos los días', deliveryFee: '30', minimumOrder: '0', prepMinutes: 20 }),
      }),
    );
    await db().transaction(async (tx) => reviewStore(tx, { actor: await reviewer(), storeId, decision: 'approve', note: null }));
    await db().transaction((tx) => setStoreOpen(tx, { userId: owner, open: true }));
    const item = await db().transaction((tx) => addMenuItem(tx, { userId: owner, input: { section: 'Platos', name: 'Gallo pinto', description: '', price: 12000 } }));
    const order = await db().transaction(async (tx) =>
      placeOrder(tx, { customerUserId: await member('Comprador'), input: orderInputSchema.parse({ storeId, lines: [{ itemId: item, quantity: 1 }], dropoffLatitude: city.latitude, dropoffLongitude: city.longitude, dropoffDirections: 'Casa esquinera', whatsapp: '+50588884444', payingWith: '', note: '' }) }),
    );
    await db().transaction((tx) => storeAnswer(tx, { userId: owner, orderId: order.id, accept: true }));
    await expect(db().transaction((tx) => claimOrder(tx, { userId: moto, orderId: order.id }))).rejects.toMatchObject({ messageKey: 'go.error.driver_busy' });

    // The driver drops the trip: it goes back to drivers, and the driver is free again.
    await db().transaction((tx) => driverDropTrip(tx, { userId: moto, tripId: id }));
    expect((await tripForCustomer(db(), customer, id))!.trip).toMatchObject({ status: 'open', driverUserId: null });
    await db().transaction((tx) => claimOrder(tx, { userId: moto, orderId: order.id }));
    expect((await driverCurrentOrder(db(), moto))!.order.id).toBe(order.id);
    await db().transaction((tx) => markPickedUp(tx, { userId: moto, orderId: order.id }));
    await db().transaction((tx) => markDelivered(tx, { userId: moto, orderId: order.id }));

    // The restaurant plan counts it.
    const [store] = await db().select().from(goStores).where(eq(goStores.id, storeId));
    const plan = await planStatus(db(), store!);
    expect(plan.deliveredThisMonth).toBe(1);
    expect(plan.founding).toBe(store!.foundingUntil !== null);
  });

  it('closes requests nobody chose, and erases the exact points a day after', async () => {
    const customer = await member();
    const { id } = await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));
    const later = new Date(Date.now() + 60 * 60_000);
    expect((await tripsUpkeep(db(), later)).expired).toBe(1);
    expect((await tripForCustomer(db(), customer, id))!.trip.status).toBe('expired');
    const dayAfter = new Date(later.getTime() + 25 * 3_600_000);
    expect((await tripsUpkeep(db(), dayAfter)).erased).toBe(1);
    const [row] = await db().select().from(goTrips).where(eq(goTrips.id, id));
    expect(row).toMatchObject({ pickupLatitude: null, customerWhatsappE164: null });
    expect(row!.distanceKm).not.toBeNull();
  });

  it('lets a customer have one request at a time, and cancel it before it starts', async () => {
    const customer = await member();
    const { id } = await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));
    await expect(db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }))).rejects.toMatchObject({ messageKey: 'go.trip.error.already_active' });
    await db().transaction((tx) => customerCancelTrip(tx, { userId: customer, tripId: id }));
    await db().transaction((tx) => requestTrip(tx, { customerUserId: customer, input: ride() }));
  });
});

describe('Restaurant plan and gift orders', () => {
  beforeAll(async () => {
    const cities = await db().select().from(locations).where(eq(locations.level, 'city'));
    const one = cities.find((c) => c.latitude !== null && c.longitude !== null)!;
    city = { id: one.id, latitude: one.latitude!, longitude: one.longitude! };
  });
  beforeEach(async () => {
    await resetTransactionalData();
  });

  it('gives founding stores a free year, and none after the cut-off', () => {
    const early = new Date('2026-11-01T12:00:00Z');
    expect(foundingUntilFor(early)!.toISOString()).toBe(`${2026 + Math.floor((10 + GO_PLAN_RULES.foundingMonths) / 12)}-${String(((10 + GO_PLAN_RULES.foundingMonths) % 12) + 1).padStart(2, '0')}-01T12:00:00.000Z`);
    expect(foundingUntilFor(new Date(`${GO_PLAN_RULES.foundingCutoff}T12:00:00Z`))).not.toBeNull();
    const afterCutoff = new Date(`${GO_PLAN_RULES.foundingCutoff}T12:00:00Z`);
    afterCutoff.setUTCDate(afterCutoff.getUTCDate() + 1);
    expect(foundingUntilFor(afterCutoff)).toBeNull();
  });

  it('dates a store as founding at approval, and keeps the gift recipient for the driver only while needed', async () => {
    const owner = await member('Dueño');
    const storeId = await db().transaction((tx) =>
      saveStore(tx, {
        userId: owner,
        input: storeInputSchema.parse({ name: 'Asados', category: 'food', about: 'Carne asada los fines de semana.', locationId: city.id, address: 'Del parque, una cuadra', latitude: city.latitude, longitude: city.longitude, whatsapp: '+50588881111', hours: 'Sábados', deliveryFee: '30', minimumOrder: '0', prepMinutes: 20 }),
      }),
    );
    const approvedAt = new Date('2026-12-01T10:00:00Z');
    await db().transaction(async (tx) => reviewStore(tx, { actor: await reviewer(), storeId, decision: 'approve', note: null, now: approvedAt }));
    const [store] = await db().select().from(goStores).where(eq(goStores.id, storeId));
    expect(store!.foundingUntil).toEqual(foundingUntilFor(approvedAt));
    const status = await planStatus(db(), store!, new Date('2027-01-15T00:00:00Z'));
    expect(status).toMatchObject({ founding: true, deliveredThisMonth: 0, planWouldApply: false });

    await db().transaction((tx) => setStoreOpen(tx, { userId: owner, open: true }));
    const item = await db().transaction((tx) => addMenuItem(tx, { userId: owner, input: { section: 'Platos', name: 'Asado', description: '', price: 15000 } }));
    const abroad = await member('Hija en Miami');
    const { id } = await db().transaction((tx) =>
      placeOrder(tx, {
        customerUserId: abroad,
        input: orderInputSchema.parse({ storeId, lines: [{ itemId: item, quantity: 1 }], dropoffLatitude: city.latitude, dropoffLongitude: city.longitude, dropoffDirections: 'Casa de mi mamá, portón verde', whatsapp: '+50588885555', payingWith: '', note: '', recipientName: 'Doña Rosa' }),
      }),
    );
    const [row] = await db().select().from(goOrders).where(eq(goOrders.id, id));
    expect(row).toMatchObject({ recipientName: 'Doña Rosa', customerWhatsappE164: '+50588885555' });
  });
});
