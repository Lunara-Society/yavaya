'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { parseMoney } from '@/server/domains/go/service';
import {
  chooseOffer,
  completeTrip,
  customerCancelTrip,
  driverArrived,
  driverDropTrip,
  offerOnTrip,
  requestTrip,
  startTrip,
  tripInputSchema,
  withdrawOffer,
} from '@/server/domains/go/trips';

/** Viajes y mandados: every button re-checks on the server who may press it. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const back = (path: string, key: string) => `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(key)}`;
/** A map left untouched sends an empty field: that is "no point", not NaN. */
const point = (formData: FormData, name: string) => {
  const value = Number.parseFloat(field(formData, name));
  return Number.isFinite(value) ? value : null;
};

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

async function signedIn(next: string) {
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

async function step(path: string, run: (userId: string) => Promise<unknown>): Promise<never> {
  const session = await signedIn(path);
  try {
    await run(session.user.userId);
  } catch (error) {
    redirect(back(path, errorKey(error)));
  }
  revalidatePath(path);
  redirect(path);
}

const tripId = (formData: FormData) => {
  const id = field(formData, 'tripId');
  if (!UUID.test(id)) redirect('/yavayago/viajes');
  return id;
};

export async function requestTripAction(formData: FormData): Promise<void> {
  const path = '/yavayago/viajes';
  const session = await signedIn(path);
  const parsed = tripInputSchema.safeParse({
    kind: field(formData, 'kind'),
    locationId: field(formData, 'locationId'),
    vehicleWanted: field(formData, 'vehicleWanted') || 'any',
    passengers: Number.parseInt(field(formData, 'passengers') || '1', 10),
    description: field(formData, 'description'),
    pickupLatitude: point(formData, 'pickupLatitude'),
    pickupLongitude: point(formData, 'pickupLongitude'),
    pickupDirections: field(formData, 'pickupDirections'),
    dropoffLatitude: point(formData, 'dropoffLatitude'),
    dropoffLongitude: point(formData, 'dropoffLongitude'),
    dropoffDirections: field(formData, 'dropoffDirections'),
    offeredFare: field(formData, 'offeredFare'),
    purchaseBudget: field(formData, 'purchaseBudget'),
    whatsapp: field(formData, 'whatsapp'),
  });
  if (!parsed.success) redirect(back(path, parsed.error.issues[0]?.message ?? 'error.validation_failed'));
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `go-trip:${session.user.userId}`);
  if (!limit.allowed) redirect(back(path, 'go.error.rate_limited'));
  const context = await requestContext();
  const agent = await userAgentHash();
  let id: string;
  try {
    ({ id } = await db().transaction((tx) => requestTrip(tx, { customerUserId: session.user.userId, input: parsed.data, audit: { ipHash: context.addressHash, userAgentHash: agent } })));
  } catch (error) {
    redirect(back(path, errorKey(error)));
  }
  redirect(`/yavayago/viajes/${id}?requested=1`);
}

export async function chooseOfferAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  const offerId = field(formData, 'offerId');
  if (!UUID.test(offerId)) redirect(`/yavayago/viajes/${id}`);
  await step(`/yavayago/viajes/${id}`, (userId) => db().transaction((tx) => chooseOffer(tx, { userId, tripId: id, offerId })));
}

export async function cancelTripAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(`/yavayago/viajes/${id}`, (userId) => db().transaction((tx) => customerCancelTrip(tx, { userId, tripId: id })));
}

// --- Driver side ------------------------------------------------------------------------

const DRIVER = '/yavayago/driver';

export async function offerTripAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  const fare = parseMoney(field(formData, 'fare'));
  const eta = Number.parseInt(field(formData, 'eta'), 10);
  if (fare === null) redirect(back(DRIVER, 'go.trip.error.fare'));
  await step(DRIVER, (userId) => db().transaction((tx) => offerOnTrip(tx, { userId, tripId: id, fareMinor: fare, etaMinutes: eta })));
}

export async function withdrawOfferAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(DRIVER, (userId) => db().transaction((tx) => withdrawOffer(tx, { userId, tripId: id })));
}

export async function arrivedAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(DRIVER, (userId) => db().transaction((tx) => driverArrived(tx, { userId, tripId: id })));
}

export async function startTripAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(DRIVER, (userId) => db().transaction((tx) => startTrip(tx, { userId, tripId: id })));
}

export async function completeTripAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(DRIVER, (userId) => db().transaction((tx) => completeTrip(tx, { userId, tripId: id })));
}

export async function dropTripAction(formData: FormData): Promise<void> {
  const id = tripId(formData);
  await step(DRIVER, (userId) => db().transaction((tx) => driverDropTrip(tx, { userId, tripId: id })));
}
