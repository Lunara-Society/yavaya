import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { goOrders, goStores } from '@/server/db/schema';
import { GO_PLAN_RULES as R } from '@/config/business-rules';
import { getSetting } from '@/server/domains/platform/settings';

/**
 * The restaurant plan: free while a store is small or founding, a flat
 * monthly fee once Yavaya brings it real volume. Never a percentage of an
 * order (see GO_PLAN_RULES for why).
 *
 * No `server-only` guard: the seed (plain tsx) imports it for the backfill.
 *
 * This module only measures. Charging is not built, so nothing here blocks
 * an order or a store: it tells the store where it stands, honestly.
 */

/** The last moment a store can be approved and still be a founding store. */
function foundingCutoffEnd(): Date {
  return new Date(`${R.foundingCutoff}T23:59:59.999Z`);
}

/** When a store approved at `approvedAt` stops being free as a founder; null if it came after the cut-off. */
export function foundingUntilFor(approvedAt: Date): Date | null {
  if (approvedAt.getTime() > foundingCutoffEnd().getTime()) return null;
  const until = new Date(approvedAt);
  until.setUTCMonth(until.getUTCMonth() + R.foundingMonths);
  return until;
}

/** The calendar month an order counts in. UTC: a few hours either side of midnight on the 1st change nothing that is billed. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type PlanStatus = {
  founding: boolean;
  foundingUntil: Date | null;
  deliveredThisMonth: number;
  freeOrdersPerMonth: number;
  /** Past the free orders, outside the founding year: the plan would apply. */
  planWouldApply: boolean;
  planPriceUsdCents: number;
};

export async function planStatus(executor: Executor, store: { id: string; foundingUntil: Date | null }, now = new Date()): Promise<PlanStatus> {
  const [freeOrders, price] = await Promise.all([getSetting(executor, 'go.free_orders_per_month', R.freeOrdersPerMonth), getSetting(executor, 'go.plan_price_usd_cents', R.planPriceUsdCents)]);
  const [{ n }] = (await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(goOrders)
    .where(and(eq(goOrders.storeId, store.id), eq(goOrders.status, 'delivered'), gte(goOrders.deliveredAt, monthStart(now))))) as [{ n: number }];
  const founding = Boolean(store.foundingUntil && store.foundingUntil.getTime() > now.getTime());
  return {
    founding,
    foundingUntil: store.foundingUntil,
    deliveredThisMonth: n,
    freeOrdersPerMonth: freeOrders,
    planWouldApply: !founding && n > freeOrders,
    planPriceUsdCents: price,
  };
}

/**
 * Stores approved before founding dates existed get theirs from their review
 * date. Runs on every deploy (from the seed) and only fills what is empty.
 */
export async function backfillFoundingStores(database: Database): Promise<number> {
  const rows = await database
    .select({ id: goStores.id, reviewedAt: goStores.reviewedAt, createdAt: goStores.createdAt })
    .from(goStores)
    .where(and(eq(goStores.status, 'approved'), isNull(goStores.foundingUntil), lte(goStores.createdAt, foundingCutoffEnd())));
  let filled = 0;
  for (const row of rows) {
    const until = foundingUntilFor(row.reviewedAt ?? row.createdAt);
    if (!until) continue;
    await database.update(goStores).set({ foundingUntil: until }).where(and(eq(goStores.id, row.id), isNull(goStores.foundingUntil)));
    filled += 1;
  }
  return filled;
}
