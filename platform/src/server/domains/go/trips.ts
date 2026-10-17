import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import { goDrivers, goTripOffers, goTrips, goTripTracking, locations, userProfiles, users } from '@/server/db/schema';
import { GO_RULES, GO_TRIP_RULES as R } from '@/config/business-rules';
import { GO_VEHICLES, type GoVehicle } from '@/config/go';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { haversineKm } from '@/server/domains/geography/service';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { notify } from '@/server/domains/notifications/service';
import { getSetting } from '@/server/domains/platform/settings';
import { activeMember, cityExists, currencyOf, DRIVER_ACTIVE_TRIP_STATUSES, driverCard, driverIsBusy, type DriverCard } from './shared';
import { parseMoney } from './service';

/**
 * Viajes y mandados: a checked driver for anything — a ride, a parcel, an
 * errand, a hand with something.
 *
 * Pricing is the way people here already agree a fare: the customer says
 * what they will pay, drivers accept that or offer their own price, and the
 * customer chooses among them. Yavaya sets no price and takes no cut; the
 * fare is paid in cash to the driver.
 *
 * Who sees what:
 * - before a driver is chosen, drivers see the kind of job, its description,
 *   the distance, the price and a rough area (about a kilometre) — enough to
 *   decide, not enough to find someone's door;
 * - the chosen driver sees the exact points and the customer's WhatsApp,
 *   until the trip ends; they are erased a day later;
 * - the customer sees each offering driver's face, vehicle and plate, and the
 *   chosen driver's position while the trip is under way;
 * - someone the customer sends the share link to sees the same live view,
 *   read-only, and only while the trip is under way.
 */

type AuditContext = { ipHash?: string | null; userAgentHash?: string | null };
const TRIP = 'go_trip';

export const TRIP_KINDS = ['ride', 'parcel', 'errand', 'assist'] as const;
export type TripKind = (typeof TRIP_KINDS)[number];
/** What a ride may be asked for in: people ride on a motorcycle or in a car, not on a bicycle. */
export const RIDE_VEHICLES: readonly GoVehicle[] = ['motorcycle', 'car'];
const OPEN_FOR_CUSTOMER = ['open', 'accepted', 'arrived', 'in_progress'] as const;
const CLOSED = ['completed', 'cancelled', 'expired'] as const;

const clean = (value: string) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const optionalText = (max: number, key: string) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().max(max, { message: key }))
    .transform((value) => value || null);
/** A point from a map form: null when the map was left untouched (the action turns an empty field into null). */
const coordinate = (min: number, max: number) => z.number({ message: 'go.error.map_point' }).min(min, { message: 'go.error.map_point' }).max(max, { message: 'go.error.map_point' }).nullable();

export const tripInputSchema = z
  .object({
    kind: z.enum(TRIP_KINDS, { message: 'go.trip.error.kind' }),
    locationId: z.string().uuid({ message: 'go.error.location' }),
    vehicleWanted: z.enum(['any', ...GO_VEHICLES], { message: 'go.error.vehicle' }),
    passengers: z.number().int().min(1, { message: 'go.trip.error.passengers' }).max(R.maxPassengers, { message: 'go.trip.error.passengers' }),
    description: optionalText(R.descriptionMaxLength, 'go.trip.error.description'),
    pickupLatitude: coordinate(-90, 90),
    pickupLongitude: coordinate(-180, 180),
    pickupDirections: optionalText(300, 'go.error.directions'),
    dropoffLatitude: coordinate(-90, 90),
    dropoffLongitude: coordinate(-180, 180),
    dropoffDirections: optionalText(300, 'go.error.directions'),
    offeredFare: z.string().transform((value, ctx) => {
      const minor = parseMoney(value);
      if (minor === null || minor <= 0) ctx.addIssue({ code: 'custom', message: 'go.trip.error.fare' });
      return minor ?? 0;
    }),
    purchaseBudget: z.string().transform((value, ctx) => {
      if (!value.trim()) return null;
      const minor = parseMoney(value);
      if (minor === null) ctx.addIssue({ code: 'custom', message: 'go.trip.error.budget' });
      return minor;
    }),
    whatsapp: z.string().transform((value, ctx) => {
      const normalized = normalizeWhatsapp(value);
      if (!normalized) ctx.addIssue({ code: 'custom', message: 'go.error.whatsapp' });
      return normalized ?? '';
    }),
  })
  .superRefine((value, ctx) => {
    if (value.pickupLatitude === null || value.pickupLongitude === null) ctx.addIssue({ code: 'custom', message: 'go.trip.error.pickup' });
    if (!value.pickupDirections || value.pickupDirections.length < 5) ctx.addIssue({ code: 'custom', message: 'go.error.directions' });
    // Help given in one place needs no destination; everything else goes somewhere.
    const needsDropoff = value.kind !== 'assist';
    if (needsDropoff && (value.dropoffLatitude === null || value.dropoffLongitude === null)) ctx.addIssue({ code: 'custom', message: 'go.trip.error.dropoff' });
    if (needsDropoff && (!value.dropoffDirections || value.dropoffDirections.length < 5)) ctx.addIssue({ code: 'custom', message: 'go.error.directions' });
    if (value.kind !== 'ride' && (!value.description || value.description.length < 5)) ctx.addIssue({ code: 'custom', message: 'go.trip.error.description' });
    if (value.kind === 'ride' && value.vehicleWanted !== 'any' && !RIDE_VEHICLES.includes(value.vehicleWanted)) ctx.addIssue({ code: 'custom', message: 'go.trip.error.ride_vehicle' });
    if (value.kind === 'ride' && value.vehicleWanted === 'motorcycle' && value.passengers > 1) ctx.addIssue({ code: 'custom', message: 'go.trip.error.moto_passengers' });
    if (value.kind !== 'errand' && value.purchaseBudget !== null) ctx.addIssue({ code: 'custom', message: 'go.trip.error.budget' });
  });
export type TripInput = z.output<typeof tripInputSchema>;

/** Whether a driver's vehicle suits what the customer asked for. */
export function vehicleFits(trip: { kind: TripKind; vehicleWanted: string }, vehicle: string): boolean {
  if (trip.vehicleWanted !== 'any') return trip.vehicleWanted === vehicle;
  return trip.kind === 'ride' ? RIDE_VEHICLES.includes(vehicle as GoVehicle) : true;
}

/** About a kilometre: enough to judge the distance, not enough to find a door. */
export function roughPoint(latitude: number, longitude: number): { latitude: number; longitude: number } {
  const f = 10 ** R.roughAreaDecimals;
  return { latitude: Math.round(latitude * f) / f, longitude: Math.round(longitude * f) / f };
}

const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

async function freshTripCode(executor: Executor): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = 'V' + Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join('');
    const [taken] = await executor.select({ id: goTrips.id }).from(goTrips).where(eq(goTrips.code, code)).limit(1);
    if (!taken) return code;
  }
  throw errors.internal('no free trip code');
}

type TripRow = typeof goTrips.$inferSelect;

async function lockTrip(tx: Executor, tripId: string): Promise<TripRow> {
  const [trip] = await tx.select().from(goTrips).where(eq(goTrips.id, tripId)).limit(1).for('update');
  if (!trip) throw errors.notFound(TRIP);
  return trip;
}

const customerLink = (tripId: string) => `/yavayago/viajes/${tripId}`;

export type TripCity = { id: string; name: string; latitude: number; longitude: number; currency: string };

/** The city YavayaGo starts in: a location row named by its code in settings, never by its name. */
export async function launchCity(executor: Executor): Promise<TripCity | null> {
  const code = await getSetting(executor, 'go.launch_place', R.launchPlaceCode);
  const [row] = await executor.select({ id: locations.id, name: locations.name, latitude: locations.latitude, longitude: locations.longitude }).from(locations).where(eq(locations.code, code)).limit(1);
  if (!row || row.latitude === null || row.longitude === null) return null;
  return { id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude, currency: await currencyOf(executor, row.id).catch(() => '') };
}

/** Where a request form starts: the member's own place if it has a point, otherwise the launch city. */
export async function tripStartCity(executor: Executor, userId: string | null): Promise<TripCity | null> {
  if (userId) {
    const [own] = await executor
      .select({ id: locations.id, name: locations.name, latitude: locations.latitude, longitude: locations.longitude })
      .from(userProfiles)
      .innerJoin(locations, eq(locations.id, userProfiles.locationId))
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (own?.latitude != null && own.longitude != null) return { id: own.id, name: own.name, latitude: own.latitude, longitude: own.longitude, currency: await currencyOf(executor, own.id).catch(() => '') };
  }
  return launchCity(executor);
}
const DRIVER_LINK = '/yavayago/driver';

export async function tripOfferWindowMinutes(executor: Executor): Promise<number> {
  return getSetting(executor, 'go.trip_offer_window_minutes', R.offerWindowMinutes);
}

/** A customer asks for a driver, saying what they will pay. */
export async function requestTrip(tx: Executor, params: { customerUserId: string; input: TripInput; audit?: AuditContext; now?: Date }): Promise<{ id: string; code: string }> {
  await activeMember(tx, params.customerUserId);
  const input = params.input;
  await cityExists(tx, input.locationId);
  const now = params.now ?? new Date();
  const [{ active }] = (await tx
    .select({ active: sql<number>`count(*)::int` })
    .from(goTrips)
    .where(and(eq(goTrips.customerUserId, params.customerUserId), inArray(goTrips.status, [...OPEN_FOR_CUSTOMER])))) as [{ active: number }];
  if (active >= R.maxActivePerCustomer) throw errors.conflict('go.trip.error.already_active');

  const distanceKm =
    input.dropoffLatitude !== null && input.dropoffLongitude !== null ? Math.round(haversineKm(input.pickupLatitude!, input.pickupLongitude!, input.dropoffLatitude, input.dropoffLongitude) * 10) / 10 : null;
  if (distanceKm !== null && distanceKm > R.maxDistanceKm) throw errors.validation('go.trip.error.too_far', { maxKm: R.maxDistanceKm });

  const currency = await currencyOf(tx, input.locationId);
  const code = await freshTripCode(tx);
  const window = await tripOfferWindowMinutes(tx);
  const [trip] = await tx
    .insert(goTrips)
    .values({
      code,
      kind: input.kind,
      customerUserId: params.customerUserId,
      locationId: input.locationId,
      vehicleWanted: input.vehicleWanted,
      passengers: input.kind === 'ride' ? input.passengers : 1,
      description: input.description,
      pickupLatitude: input.pickupLatitude,
      pickupLongitude: input.pickupLongitude,
      pickupDirections: input.pickupDirections,
      dropoffLatitude: input.dropoffLatitude,
      dropoffLongitude: input.dropoffLongitude,
      dropoffDirections: input.dropoffDirections,
      distanceKm,
      currency,
      offeredFareMinor: input.offeredFare,
      purchaseBudgetMinor: input.kind === 'errand' ? input.purchaseBudget : null,
      customerWhatsappE164: input.whatsapp,
      shareToken: randomBytes(18).toString('base64url'),
      expiresAt: new Date(now.getTime() + window * 60_000),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: goTrips.id });
  const id = trip!.id;
  await recordAudit(tx, {
    actorType: 'user',
    actorUserId: params.customerUserId,
    action: 'go.trip_requested',
    subjectType: TRIP,
    subjectId: id,
    district: 'yavayago',
    ipHash: params.audit?.ipHash,
    userAgentHash: params.audit?.userAgentHash,
    metadata: { kind: input.kind, offeredFareMinor: input.offeredFare, currency },
  });
  await alertDrivers(tx, { id, kind: input.kind, vehicleWanted: input.vehicleWanted, locationId: input.locationId, customerUserId: params.customerUserId, code });
  return { id, code };
}

/** Online drivers in the city whose vehicle fits hear of a new request. */
async function alertDrivers(tx: Executor, trip: { id: string; kind: TripKind; vehicleWanted: string; locationId: string; customerUserId: string; code: string }): Promise<void> {
  const drivers = await tx
    .select({ userId: goDrivers.userId, vehicleType: goDrivers.vehicleType })
    .from(goDrivers)
    .where(and(eq(goDrivers.status, 'approved'), eq(goDrivers.online, true), eq(goDrivers.locationId, trip.locationId), ne(goDrivers.userId, trip.customerUserId)))
    .limit(R.alertDrivers * 2);
  const fitting = drivers.filter((d) => vehicleFits(trip, d.vehicleType)).slice(0, R.alertDrivers);
  await notify(
    tx,
    fitting.map((d) => ({
      userId: d.userId,
      category: 'yavayago' as const,
      type: 'go.trip_available',
      titleKey: `notify.go.trip_available.${trip.kind}`,
      params: { code: trip.code },
      href: DRIVER_LINK,
      subjectId: trip.id,
      dedupeKey: `go.trip_available:${trip.id}:${d.userId}`,
    })),
  );
}

async function approvedDriver(executor: Executor, userId: string) {
  const [driver] = await executor.select().from(goDrivers).where(eq(goDrivers.userId, userId)).limit(1);
  if (!driver || driver.status !== 'approved') throw new DomainError('forbidden', 'go.error.driver_not_approved');
  return driver;
}

/**
 * A driver answers an open request: at the customer's price, or their own.
 * Offering again replaces their earlier offer.
 */
export async function offerOnTrip(tx: Executor, params: { userId: string; tripId: string; fareMinor: number; etaMinutes: number; now?: Date }): Promise<void> {
  const driver = await approvedDriver(tx, params.userId);
  if (!driver.online) throw new DomainError('forbidden', 'go.error.driver_offline');
  if (await driverIsBusy(tx, params.userId)) throw errors.conflict('go.error.driver_busy');
  const now = params.now ?? new Date();
  const trip = await lockTrip(tx, params.tripId);
  if (trip.status !== 'open' || trip.expiresAt.getTime() <= now.getTime()) throw errors.conflict('go.trip.error.not_open');
  if (trip.customerUserId === params.userId) throw errors.conflict('go.error.own_order');
  if (trip.locationId !== driver.locationId || !vehicleFits(trip, driver.vehicleType)) throw errors.notFound(TRIP);
  if (!Number.isInteger(params.fareMinor) || params.fareMinor <= 0 || params.fareMinor > trip.offeredFareMinor * R.maxCounterMultiple) throw errors.validation('go.trip.error.fare');
  if (!Number.isInteger(params.etaMinutes) || params.etaMinutes < 1 || params.etaMinutes > R.maxEtaMinutes) throw errors.validation('go.trip.error.eta');
  await tx
    .insert(goTripOffers)
    .values({ tripId: trip.id, driverUserId: params.userId, fareMinor: params.fareMinor, etaMinutes: params.etaMinutes, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [goTripOffers.tripId, goTripOffers.driverUserId], set: { fareMinor: params.fareMinor, etaMinutes: params.etaMinutes, status: 'pending', updatedAt: now } });
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.trip_offered', subjectType: TRIP, subjectId: trip.id, district: 'yavayago', metadata: { fareMinor: params.fareMinor, etaMinutes: params.etaMinutes } });
  const [me] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, params.userId)).limit(1);
  await notify(tx, [
    {
      userId: trip.customerUserId,
      category: 'yavayago',
      type: 'go.trip_offer',
      titleKey: 'notify.go.trip_offer',
      params: { code: trip.code, driver: me?.displayName.split(' ')[0] ?? '' },
      href: customerLink(trip.id),
      subjectId: trip.id,
      dedupeKey: `go.trip_offer:${trip.id}:${params.userId}`,
    },
  ]);
}

export async function withdrawOffer(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  await tx
    .update(goTripOffers)
    .set({ status: 'withdrawn', updatedAt: now })
    .where(and(eq(goTripOffers.tripId, params.tripId), eq(goTripOffers.driverUserId, params.userId), eq(goTripOffers.status, 'pending')));
}

/** The customer chooses a driver. The others are told no, quietly — their offers just close. */
export async function chooseOffer(tx: Executor, params: { userId: string; tripId: string; offerId: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const trip = await lockTrip(tx, params.tripId);
  if (trip.customerUserId !== params.userId) throw errors.notFound(TRIP);
  if (trip.status !== 'open' || trip.expiresAt.getTime() <= now.getTime()) throw errors.conflict('go.trip.error.not_open');
  const [offer] = await tx.select().from(goTripOffers).where(and(eq(goTripOffers.id, params.offerId), eq(goTripOffers.tripId, trip.id))).limit(1).for('update');
  if (!offer || offer.status !== 'pending') throw errors.conflict('go.trip.error.offer_gone');
  const driver = await approvedDriver(tx, offer.driverUserId).catch(() => null);
  if (!driver) throw errors.conflict('go.trip.error.offer_gone');
  if (await driverIsBusy(tx, offer.driverUserId)) throw errors.conflict('go.trip.error.driver_taken');

  await tx.update(goTrips).set({ status: 'accepted', driverUserId: offer.driverUserId, agreedFareMinor: offer.fareMinor, acceptedAt: now, updatedAt: now }).where(eq(goTrips.id, trip.id));
  await tx.update(goTripOffers).set({ status: 'accepted', updatedAt: now }).where(eq(goTripOffers.id, offer.id));
  await tx.update(goTripOffers).set({ status: 'declined', updatedAt: now }).where(and(eq(goTripOffers.tripId, trip.id), ne(goTripOffers.id, offer.id), eq(goTripOffers.status, 'pending')));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.trip_accepted', subjectType: TRIP, subjectId: trip.id, district: 'yavayago', metadata: { driverUserId: offer.driverUserId, fareMinor: offer.fareMinor } });
  await notify(tx, [{ userId: offer.driverUserId, category: 'yavayago', type: 'go.trip_chosen', titleKey: 'notify.go.trip_chosen', params: { code: trip.code }, href: DRIVER_LINK, subjectId: trip.id }]);
}

async function driversTrip(tx: Executor, userId: string, tripId: string): Promise<TripRow> {
  const trip = await lockTrip(tx, tripId);
  if (trip.driverUserId !== userId) throw errors.notFound(TRIP);
  return trip;
}

async function close(tx: Executor, trip: TripRow, status: (typeof CLOSED)[number], params: { actorUserId: string | null; reason: string | null; now: Date }): Promise<void> {
  await tx
    .update(goTrips)
    .set({ status, closedAt: params.now, closedReason: params.reason, updatedAt: params.now, ...(status === 'completed' ? { completedAt: params.now } : {}) })
    .where(eq(goTrips.id, trip.id));
  await tx.delete(goTripTracking).where(eq(goTripTracking.tripId, trip.id));
  await tx.update(goTripOffers).set({ status: 'declined', updatedAt: params.now }).where(and(eq(goTripOffers.tripId, trip.id), eq(goTripOffers.status, 'pending')));
  await recordAudit(tx, {
    actorType: params.actorUserId ? 'user' : 'system',
    actorUserId: params.actorUserId,
    action: `go.trip_${status}`,
    subjectType: TRIP,
    subjectId: trip.id,
    district: 'yavayago',
    metadata: params.reason ? { reason: params.reason } : {},
  });
}

export async function driverArrived(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const trip = await driversTrip(tx, params.userId, params.tripId);
  if (trip.status !== 'accepted') throw errors.conflict('go.trip.error.state');
  const now = params.now ?? new Date();
  await tx.update(goTrips).set({ status: 'arrived', arrivedAt: now, updatedAt: now }).where(eq(goTrips.id, trip.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.trip_arrived', subjectType: TRIP, subjectId: trip.id, district: 'yavayago' });
  await notify(tx, [{ userId: trip.customerUserId, category: 'yavayago', type: 'go.trip_arrived', titleKey: 'notify.go.trip_arrived', params: { code: trip.code }, href: customerLink(trip.id), subjectId: trip.id }]);
}

export async function startTrip(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const trip = await driversTrip(tx, params.userId, params.tripId);
  if (trip.status !== 'arrived' && trip.status !== 'accepted') throw errors.conflict('go.trip.error.state');
  const now = params.now ?? new Date();
  await tx.update(goTrips).set({ status: 'in_progress', startedAt: now, arrivedAt: trip.arrivedAt ?? now, updatedAt: now }).where(eq(goTrips.id, trip.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.trip_started', subjectType: TRIP, subjectId: trip.id, district: 'yavayago' });
  await notify(tx, [{ userId: trip.customerUserId, category: 'yavayago', type: 'go.trip_started', titleKey: 'notify.go.trip_started', params: { code: trip.code }, href: customerLink(trip.id), subjectId: trip.id }]);
}

export async function completeTrip(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const trip = await driversTrip(tx, params.userId, params.tripId);
  if (trip.status !== 'in_progress') throw errors.conflict('go.trip.error.state');
  const now = params.now ?? new Date();
  await close(tx, trip, 'completed', { actorUserId: params.userId, reason: null, now });
  await notify(tx, [{ userId: trip.customerUserId, category: 'yavayago', type: 'go.trip_completed', titleKey: 'notify.go.trip_completed', params: { code: trip.code }, href: customerLink(trip.id), subjectId: trip.id }]);
}

/** The customer calls it off — any time before it is under way. */
export async function customerCancelTrip(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const trip = await lockTrip(tx, params.tripId);
  if (trip.customerUserId !== params.userId) throw errors.notFound(TRIP);
  if (trip.status !== 'open' && trip.status !== 'accepted' && trip.status !== 'arrived') throw errors.conflict('go.trip.error.cancel_too_late');
  const now = params.now ?? new Date();
  await close(tx, trip, 'cancelled', { actorUserId: params.userId, reason: 'customer_cancelled', now });
  if (trip.driverUserId) {
    await notify(tx, [{ userId: trip.driverUserId, category: 'yavayago', type: 'go.trip_cancelled', titleKey: 'notify.go.trip_cancelled', params: { code: trip.code }, href: DRIVER_LINK, subjectId: trip.id }]);
  }
}

/**
 * The driver cannot make it after all. The request goes back to drivers —
 * with a fresh window — rather than leaving the customer to start over.
 */
export async function driverDropTrip(tx: Executor, params: { userId: string; tripId: string; now?: Date }): Promise<void> {
  const trip = await driversTrip(tx, params.userId, params.tripId);
  if (trip.status !== 'accepted' && trip.status !== 'arrived') throw errors.conflict('go.trip.error.state');
  const now = params.now ?? new Date();
  const window = await tripOfferWindowMinutes(tx);
  await tx
    .update(goTrips)
    .set({ status: 'open', driverUserId: null, agreedFareMinor: null, acceptedAt: null, arrivedAt: null, expiresAt: new Date(now.getTime() + window * 60_000), updatedAt: now })
    .where(eq(goTrips.id, trip.id));
  await tx.update(goTripOffers).set({ status: 'withdrawn', updatedAt: now }).where(and(eq(goTripOffers.tripId, trip.id), eq(goTripOffers.driverUserId, params.userId)));
  await tx.delete(goTripTracking).where(eq(goTripTracking.tripId, trip.id));
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'go.trip_dropped', subjectType: TRIP, subjectId: trip.id, district: 'yavayago' });
  await notify(tx, [{ userId: trip.customerUserId, category: 'yavayago', type: 'go.trip_dropped', titleKey: 'notify.go.trip_dropped', params: { code: trip.code }, href: customerLink(trip.id), subjectId: trip.id }]);
  await alertDrivers(tx, { id: trip.id, kind: trip.kind, vehicleWanted: trip.vehicleWanted, locationId: trip.locationId, customerUserId: trip.customerUserId, code: trip.code });
}

// --- What each side sees -----------------------------------------------------------------

export type TripOfferView = { id: string; fareMinor: number; etaMinutes: number; status: string; driver: DriverCard };

/** The customer's view of their own trip: the offers while open, the chosen driver after. */
export async function tripForCustomer(executor: Executor, userId: string, tripId: string) {
  const [trip] = await executor.select().from(goTrips).where(eq(goTrips.id, tripId)).limit(1);
  if (!trip || trip.customerUserId !== userId) return null;
  const offers: TripOfferView[] = [];
  if (trip.status === 'open') {
    const rows = await executor.select().from(goTripOffers).where(and(eq(goTripOffers.tripId, trip.id), eq(goTripOffers.status, 'pending'))).orderBy(asc(goTripOffers.fareMinor), asc(goTripOffers.etaMinutes)).limit(20);
    for (const row of rows) {
      const card = await driverCard(executor, row.driverUserId);
      if (card) offers.push({ id: row.id, fareMinor: row.fareMinor, etaMinutes: row.etaMinutes, status: row.status, driver: card });
    }
  }
  const driver = trip.driverUserId ? await driverCard(executor, trip.driverUserId) : null;
  return { trip, offers, driver };
}

export async function customerTrips(executor: Executor, userId: string) {
  return executor.select().from(goTrips).where(eq(goTrips.customerUserId, userId)).orderBy(desc(goTrips.createdAt)).limit(30);
}

/** The customer's trip that is still going, if any. */
export async function activeTripFor(executor: Executor, userId: string) {
  const [trip] = await executor
    .select({ id: goTrips.id, code: goTrips.code, kind: goTrips.kind, status: goTrips.status })
    .from(goTrips)
    .where(and(eq(goTrips.customerUserId, userId), inArray(goTrips.status, [...OPEN_FOR_CUSTOMER])))
    .limit(1);
  return trip ?? null;
}

/** Open requests an online driver could answer: their city, their vehicle, not their own. */
export async function availableTrips(executor: Executor, userId: string, now = new Date()) {
  const [driver] = await executor.select().from(goDrivers).where(eq(goDrivers.userId, userId)).limit(1);
  if (!driver || driver.status !== 'approved' || !driver.online) return [];
  const rows = await executor
    .select()
    .from(goTrips)
    .where(and(eq(goTrips.status, 'open'), gt(goTrips.expiresAt, now), eq(goTrips.locationId, driver.locationId), ne(goTrips.customerUserId, userId)))
    .orderBy(asc(goTrips.createdAt))
    .limit(40);
  const mine = rows.length
    ? await executor.select().from(goTripOffers).where(and(eq(goTripOffers.driverUserId, userId), inArray(goTripOffers.tripId, rows.map((r) => r.id))))
    : [];
  const myOffer = new Map(mine.map((offer) => [offer.tripId, offer]));
  return rows
    .filter((trip) => vehicleFits(trip, driver.vehicleType))
    .map((trip) => ({
      id: trip.id,
      code: trip.code,
      kind: trip.kind,
      description: trip.description,
      passengers: trip.passengers,
      distanceKm: trip.distanceKm,
      currency: trip.currency,
      offeredFareMinor: trip.offeredFareMinor,
      purchaseBudgetMinor: trip.purchaseBudgetMinor,
      area: trip.pickupLatitude !== null && trip.pickupLongitude !== null ? roughPoint(trip.pickupLatitude, trip.pickupLongitude) : null,
      expiresAt: trip.expiresAt,
      myOffer: myOffer.get(trip.id) ?? null,
    }));
}

/** The driver's current trip, with what only they need: exact points and the customer's WhatsApp. */
export async function driverCurrentTrip(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ trip: goTrips, customerName: users.displayName })
    .from(goTrips)
    .innerJoin(users, eq(users.id, goTrips.customerUserId))
    .where(and(eq(goTrips.driverUserId, userId), inArray(goTrips.status, [...DRIVER_ACTIVE_TRIP_STATUSES])))
    .limit(1);
  return row ?? null;
}

// --- Live tracking -------------------------------------------------------------------------

export const tripPositionSchema = z.object({
  tripId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
});

/** The chosen driver's phone reports where it is: only theirs, only while the trip is active, at most every few seconds. */
export async function recordTripPosition(tx: Executor, params: { userId: string; position: z.output<typeof tripPositionSchema>; now?: Date }): Promise<{ accepted: boolean }> {
  const now = params.now ?? new Date();
  const [trip] = await tx.select({ id: goTrips.id, driverUserId: goTrips.driverUserId, status: goTrips.status }).from(goTrips).where(eq(goTrips.id, params.position.tripId)).limit(1);
  if (!trip || trip.driverUserId !== params.userId || !(DRIVER_ACTIVE_TRIP_STATUSES as readonly string[]).includes(trip.status)) throw errors.notFound(TRIP);
  const [last] = await tx.select({ recordedAt: goTripTracking.recordedAt }).from(goTripTracking).where(eq(goTripTracking.tripId, trip.id)).limit(1);
  if (last && now.getTime() - last.recordedAt.getTime() < GO_RULES.trackingMinIntervalSeconds * 1000) return { accepted: false };
  const values = {
    latitude: params.position.latitude,
    longitude: params.position.longitude,
    accuracy: params.position.accuracy == null ? null : Math.round(params.position.accuracy),
    heading: params.position.heading == null ? null : Math.round(params.position.heading),
    recordedAt: now,
  };
  await tx.insert(goTripTracking).values({ tripId: trip.id, ...values }).onConflictDoUpdate({ target: goTripTracking.tripId, set: values });
  await tx.update(goDrivers).set({ lastSeenAt: now }).where(eq(goDrivers.userId, params.userId));
  return { accepted: true };
}

/** Same shape the map already reads for orders: `store` is the pick-up point. */
export type TripTrackingView = {
  status: TripRow['status'];
  store: { latitude: number; longitude: number; name: string };
  dropoff: { latitude: number; longitude: number } | null;
  driver: { latitude: number; longitude: number; accuracy: number | null; heading: number | null; ageSeconds: number; live: boolean } | null;
};

async function tracking(executor: Executor, trip: TripRow, now: Date): Promise<TripTrackingView | null> {
  if (trip.pickupLatitude === null || trip.pickupLongitude === null) return null;
  let driver: TripTrackingView['driver'] = null;
  if (trip.driverUserId && (DRIVER_ACTIVE_TRIP_STATUSES as readonly string[]).includes(trip.status)) {
    const [point] = await executor.select().from(goTripTracking).where(eq(goTripTracking.tripId, trip.id)).limit(1);
    if (point) {
      const ageSeconds = Math.max(0, Math.round((now.getTime() - point.recordedAt.getTime()) / 1000));
      driver = { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, heading: point.heading, ageSeconds, live: ageSeconds <= GO_RULES.trackingStaleSeconds };
    }
  }
  return {
    status: trip.status,
    store: { latitude: trip.pickupLatitude, longitude: trip.pickupLongitude, name: '' },
    dropoff: trip.dropoffLatitude !== null && trip.dropoffLongitude !== null ? { latitude: trip.dropoffLatitude, longitude: trip.dropoffLongitude } : null,
    driver,
  };
}

export async function trackingForTripCustomer(executor: Executor, userId: string, tripId: string, now = new Date()): Promise<TripTrackingView | null> {
  const [trip] = await executor.select().from(goTrips).where(eq(goTrips.id, tripId)).limit(1);
  if (!trip || trip.customerUserId !== userId) return null;
  return tracking(executor, trip, now);
}

/** What a share link shows: the trip while it is active, nothing after. */
export async function sharedTrip(executor: Executor, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [trip] = await executor.select().from(goTrips).where(eq(goTrips.shareToken, token)).limit(1);
  if (!trip) return null;
  const active = (DRIVER_ACTIVE_TRIP_STATUSES as readonly string[]).includes(trip.status);
  const driver = active && trip.driverUserId ? await driverCard(executor, trip.driverUserId) : null;
  const [customer] = await executor.select({ displayName: users.displayName }).from(users).where(eq(users.id, trip.customerUserId)).limit(1);
  return { trip: { id: trip.id, code: trip.code, kind: trip.kind, status: trip.status }, active, driver, customerFirstName: customer?.displayName.split(' ')[0] ?? '' };
}

export async function trackingForShare(executor: Executor, token: string, now = new Date()): Promise<TripTrackingView | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [trip] = await executor.select().from(goTrips).where(eq(goTrips.shareToken, token)).limit(1);
  if (!trip || !(DRIVER_ACTIVE_TRIP_STATUSES as readonly string[]).includes(trip.status)) return null;
  return tracking(executor, trip, now);
}

// --- Scheduled upkeep -----------------------------------------------------------------------

/**
 * Requests nobody chose a driver for close, and the customer is told; exact
 * points and phone numbers are erased a day after a trip ends.
 */
export async function tripsUpkeep(database: Database, now = new Date()): Promise<{ expired: number; erased: number }> {
  const expired = await database.transaction(async (tx) => {
    const rows = await tx
      .update(goTrips)
      .set({ status: 'expired', closedAt: now, closedReason: 'no_driver_chosen', updatedAt: now })
      .where(and(eq(goTrips.status, 'open'), lt(goTrips.expiresAt, now)))
      .returning({ id: goTrips.id, customerUserId: goTrips.customerUserId, code: goTrips.code });
    if (rows.length > 0) {
      await tx.update(goTripOffers).set({ status: 'declined', updatedAt: now }).where(and(inArray(goTripOffers.tripId, rows.map((r) => r.id)), eq(goTripOffers.status, 'pending')));
      await notify(tx, rows.map((r) => ({ userId: r.customerUserId, category: 'yavayago' as const, type: 'go.trip_expired', titleKey: 'notify.go.trip_expired', params: { code: r.code }, href: customerLink(r.id), subjectId: r.id })));
      for (const r of rows) await recordAudit(tx, { actorType: 'system', action: 'go.trip_expired', subjectType: TRIP, subjectId: r.id, district: 'yavayago' });
    }
    return rows.length;
  });
  await database.delete(goTripTracking).where(sql`${goTripTracking.tripId} in (select id from go_trips where status in ('completed', 'cancelled', 'expired'))`);
  const eraseBefore = new Date(now.getTime() - 24 * 3_600_000);
  const erased = await database
    .update(goTrips)
    .set({ pickupLatitude: null, pickupLongitude: null, pickupDirections: null, dropoffLatitude: null, dropoffLongitude: null, dropoffDirections: null, customerWhatsappE164: null })
    .where(and(lt(goTrips.closedAt, eraseBefore), or(sql`${goTrips.pickupLatitude} is not null`, sql`${goTrips.customerWhatsappE164} is not null`)))
    .returning({ id: goTrips.id });
  return { expired, erased: erased.length };
}
