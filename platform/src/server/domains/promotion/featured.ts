import { sql, type AnyColumn } from 'drizzle-orm';

/**
 * Paid placement, the same rule in every district: a feature lasts a fixed
 * number of days, buying again while it runs adds the days to the end, and
 * whatever is featured is always labelled as such — paid placement is never
 * passed off as relevance.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isFeatured(until: Date | null | undefined, now = new Date()): boolean {
  return until != null && until.getTime() > now.getTime();
}

/** When a feature bought now ends: from now, or from the end of the one running. */
export function featuredUntilAfterPurchase(current: Date | null | undefined, days: number, now = new Date()): Date {
  const from = isFeatured(current, now) ? current! : now;
  return new Date(from.getTime() + days * DAY_MS);
}

/** An ORDER BY term that puts featured rows first while their time lasts. */
export function featuredFirst(column: AnyColumn) {
  return sql`(coalesce(${column}, 'epoch'::timestamptz) > now()) desc`;
}
