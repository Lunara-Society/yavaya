import 'server-only';
import { and, desc, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiHelpDaily } from '@/server/db/schema';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { statsDay } from '@/server/domains/stats/service';

/**
 * Counting what Roxi's own initiatives lead to (src/ui/roxi/presence.tsx).
 * The question it answers is the owner's: do the check-in and the call help
 * people finish something, or do they only interrupt? `prompted_task` is the
 * answer's numerator — a draft prepared or a result opened in a conversation
 * that a check-in or call began.
 *
 * The same table counts the listing flagship's four steps, so the owner can
 * see where people stop between sending Roxi photos and publishing. Only
 * `listing_photos` comes from the browser; the other three are counted on
 * the server, where they happen.
 */
export const ROXI_HELP_EVENTS = [
  'checkin_shown',
  'checkin_opened',
  'checkin_dismissed',
  'checkin_silenced',
  'call_rang',
  'call_answered',
  'call_declined',
  'call_missed',
  'prompted_task',
  'welcome_played',
  // The listing flagship's funnel (docs/roxi/FLAGSHIP.md): photos sent to Roxi, a draft made, its form opened, published.
  'listing_photos',
  'listing_drafted',
  'listing_opened',
  'listing_published',
] as const;
export type RoxiHelpEvent = (typeof ROXI_HELP_EVENTS)[number];

/** The flagship's steps, in order: the owner's statistics show them as a funnel, apart from the initiatives. */
export const ROXI_FUNNEL_EVENTS = ['listing_photos', 'listing_drafted', 'listing_opened', 'listing_published'] as const satisfies readonly RoxiHelpEvent[];

export function isRoxiHelpEvent(value: unknown): value is RoxiHelpEvent {
  return typeof value === 'string' && (ROXI_HELP_EVENTS as readonly string[]).includes(value);
}

export async function countRoxiHelp(executor: Executor, event: RoxiHelpEvent, now = new Date()): Promise<void> {
  await executor
    .insert(roxiHelpDaily)
    .values({ day: statsDay(now), event, count: 1 })
    .onConflictDoUpdate({ target: [roxiHelpDaily.day, roxiHelpDaily.event], set: { count: sql`${roxiHelpDaily.count} + 1` } });
}

/** Totals per event over the last `days`, for the owner's statistics page. */
export async function roxiHelpTotals(executor: Executor, actor: AuthContext | null, options: { days: number; now?: Date }): Promise<Record<RoxiHelpEvent, number>> {
  await requirePermission(executor, actor, 'roles.manage');
  const since = new Date((options.now ?? new Date()).getTime() - options.days * 86_400_000);
  const rows = await executor
    .select({ event: roxiHelpDaily.event, total: sql<number>`sum(${roxiHelpDaily.count})::int` })
    .from(roxiHelpDaily)
    .where(and(gte(roxiHelpDaily.day, statsDay(since))))
    .groupBy(roxiHelpDaily.event)
    .orderBy(desc(sql`sum(${roxiHelpDaily.count})`));
  const totals = Object.fromEntries(ROXI_HELP_EVENTS.map((event) => [event, 0])) as Record<RoxiHelpEvent, number>;
  for (const row of rows) if (isRoxiHelpEvent(row.event)) totals[row.event] = row.total;
  return totals;
}
