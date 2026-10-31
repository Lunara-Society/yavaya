import 'server-only';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { goDrivers, goOrders, goStores, goTrips, locations } from '@/server/db/schema';
import { GO_RULES } from '@/config/business-rules';
import { getSetting } from '@/server/domains/platform/settings';
import { DRIVER_ACTIVE_ORDER_STATUSES, DRIVER_ACTIVE_TRIP_STATUSES } from './shared';

/**
 * The public map (/yavayago/mapa): what anyone may see of YavayaGo without an
 * account, and what a signed-in member may see of their own deliveries.
 *
 * Public means aggregated. Stores are on it because a store's address is
 * already public on its own page. Deliveries and drivers are only counted:
 * no position of a driver, a customer or a drop-off ever leaves this module,
 * and the driver count is withheld below a small floor (see
 * GO_RULES.publicMapMinCount). Exact tracking stays where it was, behind the
 * order's own authorised endpoints.
 *
 * Registered demo content is left out of every figure, as everywhere else.
 */

export type PublicStorePin = {
  id: string;
  name: string;
  category: string;
  isOpen: boolean;
  latitude: number;
  longitude: number;
  placeName: string;
};

export type PublicMapSummary = {
  /** When these figures were read, so the map can say how fresh they are. */
  generatedAt: string;
  stores: PublicStorePin[];
  /** Orders and trips a driver is carrying right now. A count, nothing more. */
  activeDeliveries: number;
  /** Drivers online, or only that there are fewer than the floor. */
  driversOnline: { count: number } | { fewerThan: number };
};

const notDemo = (id: typeof goStores.id | typeof goOrders.id | typeof goTrips.id) =>
  sql`not exists (select 1 from demo_content d where d.subject_id = ${id}::text and d.removed_at is null)`;

export async function publicMapSummary(executor: Executor, now = new Date()): Promise<PublicMapSummary> {
  const idleSince = new Date(now.getTime() - GO_RULES.driverIdleMinutes * 60_000);
  const [stores, [orders], [trips], [drivers], floor] = await Promise.all([
    executor
      .select({
        id: goStores.id,
        name: goStores.name,
        category: goStores.category,
        isOpen: goStores.isOpen,
        latitude: goStores.latitude,
        longitude: goStores.longitude,
        placeName: locations.name,
      })
      .from(goStores)
      .innerJoin(locations, eq(locations.id, goStores.locationId))
      .where(and(eq(goStores.status, 'approved'), notDemo(goStores.id)))
      .orderBy(asc(goStores.name))
      .limit(500),
    executor
      .select({ n: sql<number>`count(*)::int` })
      .from(goOrders)
      .where(and(inArray(goOrders.status, [...DRIVER_ACTIVE_ORDER_STATUSES]), notDemo(goOrders.id))),
    executor
      .select({ n: sql<number>`count(*)::int` })
      .from(goTrips)
      .where(and(inArray(goTrips.status, [...DRIVER_ACTIVE_TRIP_STATUSES]), notDemo(goTrips.id))),
    // Online and heard from lately: the flag alone can outlive a phone that went quiet until upkeep runs.
    executor
      .select({ n: sql<number>`count(*)::int` })
      .from(goDrivers)
      .where(and(eq(goDrivers.status, 'approved'), eq(goDrivers.online, true), gt(goDrivers.lastSeenAt, idleSince))),
    getSetting(executor, 'go.public_map_min_count', GO_RULES.publicMapMinCount),
  ]);
  const online = drivers?.n ?? 0;
  return {
    generatedAt: now.toISOString(),
    stores,
    activeDeliveries: (orders?.n ?? 0) + (trips?.n ?? 0),
    driversOnline: online >= floor ? { count: online } : { fewerThan: floor },
  };
}

/** Order statuses in which the customer is still waiting for it. */
const OPEN_ORDER = ['placed', 'accepted', 'ready', 'picked_up'] as const;
/** Trip statuses in which the customer is still waiting for it. */
const OPEN_TRIP = ['open', 'accepted', 'arrived', 'in_progress'] as const;

export type MyDelivery = {
  kind: 'order' | 'trip';
  id: string;
  code: string;
  status: string;
  /** A driver holds it, so there can be a position to show. */
  carried: boolean;
  /** The member's own page for it. */
  href: string;
  /** The member's own tracking endpoint: it checks, again, that they are the customer. */
  trackingUrl: string;
};

/** The member's own open orders and trips, newest first. Only ever theirs. */
export async function myActiveDeliveries(executor: Executor, userId: string): Promise<MyDelivery[]> {
  const [orders, trips] = await Promise.all([
    executor
      .select({ id: goOrders.id, code: goOrders.code, status: goOrders.status, driver: goOrders.driverUserId, at: goOrders.placedAt })
      .from(goOrders)
      .where(and(eq(goOrders.customerUserId, userId), inArray(goOrders.status, [...OPEN_ORDER])))
      .limit(5),
    executor
      .select({ id: goTrips.id, code: goTrips.code, status: goTrips.status, driver: goTrips.driverUserId, at: goTrips.createdAt })
      .from(goTrips)
      .where(and(eq(goTrips.customerUserId, userId), inArray(goTrips.status, [...OPEN_TRIP])))
      .limit(5),
  ]);
  const carriedOrder = (status: string) => (DRIVER_ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);
  const carriedTrip = (status: string) => (DRIVER_ACTIVE_TRIP_STATUSES as readonly string[]).includes(status);
  return [
    ...orders.map((o) => ({
      kind: 'order' as const,
      id: o.id,
      code: o.code,
      status: o.status,
      carried: Boolean(o.driver) && carriedOrder(o.status),
      href: `/yavayago/orders/${o.id}`,
      trackingUrl: `/api/go/orders/${o.id}/tracking`,
      at: o.at,
    })),
    ...trips.map((t) => ({
      kind: 'trip' as const,
      id: t.id,
      code: t.code,
      status: t.status,
      carried: Boolean(t.driver) && carriedTrip(t.status),
      href: `/yavayago/viajes/${t.id}`,
      trackingUrl: `/api/go/trips/${t.id}/tracking`,
      at: t.at,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(({ at: _at, ...delivery }) => delivery);
}
