import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { goDrivers, goOrders, goTrips, locations, users } from '@/server/db/schema';
import { DomainError, errors } from '@/server/errors';

/**
 * What orders and trips have in common: who may use them, which currency a
 * place pays in, and whether a driver is already busy — with either.
 */

/** Order statuses in which a driver holds an order. */
export const DRIVER_ACTIVE_ORDER_STATUSES = ['accepted', 'ready', 'picked_up'] as const;
/** Trip statuses in which a driver holds a trip. */
export const DRIVER_ACTIVE_TRIP_STATUSES = ['accepted', 'arrived', 'in_progress'] as const;

export async function activeMember(executor: Executor, userId: string): Promise<{ displayName: string }> {
  const [user] = await executor.select({ status: users.status, displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'go.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'go.error.account_restricted');
  return { displayName: user.displayName };
}

/** The currency of the country a place belongs to. Prices are in it; nothing converts. */
export async function currencyOf(executor: Executor, locationId: string): Promise<string> {
  const [self] = await executor.select({ path: locations.path, currency: locations.currencyCode }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!self) throw errors.validation('go.error.location');
  if (self.currency) return self.currency;
  const chain = self.path.length > 0 ? await executor.select({ currency: locations.currencyCode, depth: locations.depth }).from(locations).where(inArray(locations.code, self.path)).orderBy(desc(locations.depth)) : [];
  const currency = chain.find((node) => node.currency)?.currency;
  if (!currency) throw errors.validation('go.error.location');
  return currency;
}

export async function cityExists(executor: Executor, locationId: string): Promise<void> {
  const [row] = await executor.select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.isActive, true))).limit(1);
  if (!row) throw errors.validation('go.error.location');
}

/** One job at a time: the person waiting was promised this driver, not a queue. */
export async function driverIsBusy(executor: Executor, userId: string): Promise<boolean> {
  const [order] = await executor.select({ id: goOrders.id }).from(goOrders).where(and(eq(goOrders.driverUserId, userId), inArray(goOrders.status, [...DRIVER_ACTIVE_ORDER_STATUSES]))).limit(1);
  if (order) return true;
  const [trip] = await executor.select({ id: goTrips.id }).from(goTrips).where(and(eq(goTrips.driverUserId, userId), inArray(goTrips.status, [...DRIVER_ACTIVE_TRIP_STATUSES]))).limit(1);
  return Boolean(trip);
}

export type DriverCard = { userId: string; name: string; photoMediaId: string; vehicleType: string; vehicleDescription: string; plate: string | null; whatsappE164: string };

/** What a customer sees of a driver: name, face, vehicle, plate, WhatsApp. */
export async function driverCard(executor: Executor, userId: string): Promise<DriverCard | null> {
  const [row] = await executor
    .select({ userId: goDrivers.userId, name: users.displayName, photoMediaId: goDrivers.photoMediaId, vehicleType: goDrivers.vehicleType, vehicleDescription: goDrivers.vehicleDescription, plate: goDrivers.plate, whatsappE164: goDrivers.whatsappE164 })
    .from(goDrivers)
    .innerJoin(users, eq(users.id, goDrivers.userId))
    .where(eq(goDrivers.userId, userId))
    .limit(1);
  return row ?? null;
}
