import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { locations, rateLimitCounters, users } from '@/server/db/schema';
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
  reviewDriver,
  reviewStore,
  saveStore,
  setDriverOnline,
  setStoreOpen,
  storeAnswer,
  storeInputSchema,
  storeMarkReady,
} from '@/server/domains/go/service';
import { GO_TRIP_RULES } from '@/config/business-rules';

/**
 * Sets up one real order for the browser test of live tracking
 * (tests/e2e/live-tracking.cjs), in a LOCAL database only: a store, an
 * approved driver who has taken the order, its customer, and a stranger.
 * Prints what the browser test needs as JSON.
 *
 *   npx tsx --conditions=react-server tests/e2e/tracking-setup.ts          set up
 *   npx tsx --conditions=react-server tests/e2e/tracking-setup.ts finish <orderId> <driverUserId> <ownerUserId>
 *
 * Refuses to run against anything but a local database: it creates accounts.
 */

const PASSWORD = 'a-sufficiently-long-passphrase';

function assertLocal() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('tracking-setup only runs against a local database.');
}

async function account(label: string) {
  const email = `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { userId } = await register(
    db(),
    { email, password: PASSWORD, displayName: `E2E ${label}`, locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `e2e-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'e2e' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return { userId, email, password: PASSWORD };
}

const image = () => {
  const id = crypto.randomUUID();
  return { id, storageKey: `e2e/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 10, sourceSha256: id };
};

async function setUp() {
  // Each run signs in three of these accounts from this one address, and the
  // sign-in limit (RATE_LIMITS.login) allows eight per quarter of an hour: a
  // third run in a row would be refused at the login page. The limit is tested
  // on its own; here, on a local database only, its counters start afresh.
  await db().delete(rateLimitCounters).where(like(rateLimitCounters.key, 'login:%'));
  const [city] = await db().select().from(locations).where(eq(locations.code, GO_TRIP_RULES.launchPlaceCode)).limit(1);
  if (!city || city.latitude === null || city.longitude === null) throw new Error('The launch city has no coordinates.');
  const reviewerAccount = await account('reviewer');
  await db().transaction((tx) => grantRole(tx, { userId: reviewerAccount.userId, roleKey: 'district_reviewer', grantedBy: null }));
  const reviewer = { userId: reviewerAccount.userId, status: 'active' as const };

  const owner = await account('owner');
  const store = { latitude: city.latitude - 0.002, longitude: city.longitude - 0.004 };
  const storeId = await db().transaction((tx) =>
    saveStore(tx, {
      userId: owner.userId,
      input: storeInputSchema.parse({
        name: 'E2E Comedor de prueba',
        category: 'food',
        about: 'Tienda creada por la prueba automática de seguimiento.',
        locationId: city.id,
        address: 'Dirección de prueba',
        ...store,
        whatsapp: '+50588880001',
        hours: 'Siempre',
        deliveryFee: '1',
        minimumOrder: '1',
        prepMinutes: 10,
      }),
    }),
  );
  await db().transaction((tx) => reviewStore(tx, { actor: reviewer, storeId, decision: 'approve', note: null }));
  await db().transaction((tx) => setStoreOpen(tx, { userId: owner.userId, open: true }));
  const item = await db().transaction((tx) => addMenuItem(tx, { userId: owner.userId, input: { section: 'Platos', name: 'Plato de prueba', description: '', price: 300 } }));

  const driver = await account('driver');
  await db().transaction((tx) =>
    applyDriver(tx, {
      userId: driver.userId,
      input: { vehicleType: 'motorcycle', vehicleDescription: 'Moto de prueba', plate: 'M 000001', locationId: city.id, whatsapp: '+50588880002' },
      photo: image(),
      document: image(),
    }),
  );
  await db().transaction((tx) => reviewDriver(tx, { actor: reviewer, driverUserId: driver.userId, decision: 'approve', note: 'Cuenta de la prueba automática.', phoneConfirmed: true }));
  await db().transaction((tx) => setDriverOnline(tx, { userId: driver.userId, online: true }));

  const customer = await account('customer');
  const stranger = await account('stranger');
  const dropoff = { latitude: city.latitude - 0.012, longitude: city.longitude + 0.006 };
  const { id: orderId, code } = await db().transaction((tx) =>
    placeOrder(tx, {
      customerUserId: customer.userId,
      input: orderInputSchema.parse({ storeId, lines: [{ itemId: item, quantity: 1 }], dropoffLatitude: dropoff.latitude, dropoffLongitude: dropoff.longitude, dropoffDirections: 'Portón de prueba', whatsapp: '+50588880003', payingWith: '', note: '' }),
    }),
  );
  await db().transaction((tx) => storeAnswer(tx, { userId: owner.userId, orderId, accept: true }));
  await db().transaction((tx) => claimOrder(tx, { userId: driver.userId, orderId }));
  return { orderId, code, store, dropoff, city: { latitude: city.latitude, longitude: city.longitude }, owner, driver, customer, stranger };
}

async function finish(orderId: string, driverUserId: string, ownerUserId: string) {
  await db().transaction((tx) => storeMarkReady(tx, { userId: ownerUserId, orderId }));
  await db().transaction((tx) => markPickedUp(tx, { userId: driverUserId, orderId }));
  await db().transaction((tx) => markDelivered(tx, { userId: driverUserId, orderId }));
  return { finished: orderId };
}

(async () => {
  assertLocal();
  const [command, ...args] = process.argv.slice(2);
  const result = command === 'finish' ? await finish(args[0]!, args[1]!, args[2]!) : await setUp();
  console.log(JSON.stringify(result));
  await closeDb();
})().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
