import 'server-only';
import { and, gte, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { pageViewsDaily, webVitalsDaily } from '@/server/db/schema';
import { SITE_STATS_RULES } from '@/config/business-rules';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { band, METRICS, type Device, type Metric } from './rules';

/**
 * Yavaya's own visit statistics: written by /api/metrics from what browsers
 * report, read by the owner's panel (/admin/visitas).
 *
 * Nothing here can tell one visitor from another, by design: the tables hold
 * daily counts per page, and the funnel below counts accounts from the
 * accounts table, never by following anyone from page to page.
 */

export type ViewEvent = { kind: 'view'; path: string; device: Device; source: string; entry: boolean };
export type VitalEvent = { kind: 'vital'; path: string; device: Device; metric: Metric; value: number };
export type StatsEvent = ViewEvent | VitalEvent;

/**
 * The calendar day an event belongs to, on the launch market's clock: a visit
 * at nine at night in Managua belongs to that day, not the next one in UTC.
 */
export function statsDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_STATS_RULES.dayTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Adds a batch of events to the day's counts. Events with the same key are summed first, so one statement touches each row once. */
export async function recordStats(executor: Executor, events: readonly StatsEvent[], now = new Date()): Promise<void> {
  const day = statsDay(now);
  const views = new Map<string, { path: string; device: string; source: string; views: number; entries: number }>();
  const vitals = new Map<string, { path: string; device: string; metric: string; good: number; needsImprovement: number; poor: number; total: number }>();

  for (const event of events) {
    if (event.kind === 'view') {
      const key = `${event.path}\u0000${event.device}\u0000${event.source}`;
      const row = views.get(key) ?? { path: event.path, device: event.device, source: event.source, views: 0, entries: 0 };
      row.views += 1;
      if (event.entry) row.entries += 1;
      views.set(key, row);
    } else {
      const key = `${event.path}\u0000${event.device}\u0000${event.metric}`;
      const row = vitals.get(key) ?? { path: event.path, device: event.device, metric: event.metric, good: 0, needsImprovement: 0, poor: 0, total: 0 };
      row[band(event.metric, event.value)] += 1;
      row.total += event.value;
      vitals.set(key, row);
    }
  }

  if (views.size) {
    await executor
      .insert(pageViewsDaily)
      .values([...views.values()].map((row) => ({ day, ...row })))
      .onConflictDoUpdate({
        target: [pageViewsDaily.day, pageViewsDaily.path, pageViewsDaily.device, pageViewsDaily.source],
        set: { views: sql`${pageViewsDaily.views} + excluded.views`, entries: sql`${pageViewsDaily.entries} + excluded.entries` },
      });
  }
  if (vitals.size) {
    await executor
      .insert(webVitalsDaily)
      .values([...vitals.values()].map((row) => ({ day, ...row })))
      .onConflictDoUpdate({
        target: [webVitalsDaily.day, webVitalsDaily.path, webVitalsDaily.device, webVitalsDaily.metric],
        set: {
          good: sql`${webVitalsDaily.good} + excluded.good`,
          needsImprovement: sql`${webVitalsDaily.needsImprovement} + excluded.needs_improvement`,
          poor: sql`${webVitalsDaily.poor} + excluded.poor`,
          total: sql`${webVitalsDaily.total} + excluded.total`,
        },
      });
  }
}

/** Deletes counts older than SITE_STATS_RULES.keepDays. */
export async function purgeSiteStats(executor: Executor, now = new Date()): Promise<{ views: number; vitals: number }> {
  const cutoff = statsDay(new Date(now.getTime() - SITE_STATS_RULES.keepDays * 24 * 60 * 60 * 1000));
  const views = await executor.delete(pageViewsDaily).where(lt(pageViewsDaily.day, cutoff)).returning({ day: pageViewsDaily.day });
  const vitals = await executor.delete(webVitalsDaily).where(lt(webVitalsDaily.day, cutoff)).returning({ day: webVitalsDaily.day });
  return { views: views.length, vitals: vitals.length };
}

/**
 * The actions that mean a new member did something real on Yavaya: published,
 * asked, applied, ordered. The funnel's last step counts new accounts with at
 * least one of these in the audit log.
 */
export const FIRST_ACTIONS = [
  'mercadito.listing_published',
  'community.post_published',
  'community.reply_posted',
  'services.request_created',
  'services.response_sent',
  'work.post_published',
  'work.application_sent',
  'animals.listing_published',
  'animals.application_submitted',
  'animals.lost_found_reported',
  'go.order_placed',
  'go.trip_requested',
  'sanctuary.church_registered',
] as const;

export type VitalSummary = { metric: Metric; good: number; needsImprovement: number; poor: number; samples: number; average: number };

export type SiteStats = {
  days: number;
  from: string;
  to: string;
  totals: { views: number; visits: number };
  byDay: Array<{ day: string; views: number; visits: number }>;
  pages: Array<{ path: string; views: number; visits: number }>;
  sources: Array<{ source: string; visits: number }>;
  devices: Array<{ device: Device; views: number }>;
  vitals: { all: VitalSummary[]; phone: VitalSummary[] };
  slowPages: Array<{ path: string; samples: number; poorShare: number; average: number }>;
  funnel: { visits: number; accounts: number; verified: number; acted: number };
  /** The first day anything was counted at all, so the panel can say when counting began. Null before the first visit. */
  countingSince: string | null;
};

/** The owner's view of visits and speed for the last `days` days, today included. roles.manage only. */
export async function siteStats(executor: Executor, actor: AuthContext | null, options: { days: number; now?: Date }): Promise<SiteStats> {
  await requirePermission(executor, actor, 'roles.manage');
  const now = options.now ?? new Date();
  const days = Math.max(1, Math.min(options.days, SITE_STATS_RULES.keepDays));
  const to = statsDay(now);
  const from = statsDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const inRange = and(gte(pageViewsDaily.day, from), sql`${pageViewsDaily.day} <= ${to}`);
  const vitalsInRange = and(gte(webVitalsDaily.day, from), sql`${webVitalsDaily.day} <= ${to}`);

  const sumViews = sql<number>`coalesce(sum(${pageViewsDaily.views}), 0)::int`;
  const sumVisits = sql<number>`coalesce(sum(${pageViewsDaily.entries}), 0)::int`;

  const [totals] = await executor.select({ views: sumViews, visits: sumVisits }).from(pageViewsDaily).where(inRange);
  const [first] = await executor.select({ day: sql<string | null>`min(${pageViewsDaily.day})::text` }).from(pageViewsDaily);
  const byDayRows = await executor
    .select({ day: pageViewsDaily.day, views: sumViews, visits: sumVisits })
    .from(pageViewsDaily)
    .where(inRange)
    .groupBy(pageViewsDaily.day);
  const pages = await executor
    .select({ path: pageViewsDaily.path, views: sumViews, visits: sumVisits })
    .from(pageViewsDaily)
    .where(inRange)
    .groupBy(pageViewsDaily.path)
    .orderBy(sql`2 desc`)
    .limit(15);
  const sources = await executor
    .select({ source: pageViewsDaily.source, visits: sumVisits })
    .from(pageViewsDaily)
    .where(and(inRange, sql`${pageViewsDaily.source} <> ''`))
    .groupBy(pageViewsDaily.source)
    .having(sql`sum(${pageViewsDaily.entries}) > 0`)
    .orderBy(sql`2 desc`)
    .limit(12);
  const devices = await executor
    .select({ device: pageViewsDaily.device, views: sumViews })
    .from(pageViewsDaily)
    .where(inRange)
    .groupBy(pageViewsDaily.device)
    .orderBy(sql`2 desc`);

  const vitalRows = await executor
    .select({
      metric: webVitalsDaily.metric,
      device: webVitalsDaily.device,
      good: sql<number>`sum(${webVitalsDaily.good})::int`,
      needsImprovement: sql<number>`sum(${webVitalsDaily.needsImprovement})::int`,
      poor: sql<number>`sum(${webVitalsDaily.poor})::int`,
      total: sql<number>`sum(${webVitalsDaily.total})::float8`,
    })
    .from(webVitalsDaily)
    .where(vitalsInRange)
    .groupBy(webVitalsDaily.metric, webVitalsDaily.device);
  const summarize = (rows: typeof vitalRows): VitalSummary[] =>
    METRICS.map((metric) => {
      const mine = rows.filter((row) => row.metric === metric);
      const good = mine.reduce((n, row) => n + row.good, 0);
      const needsImprovement = mine.reduce((n, row) => n + row.needsImprovement, 0);
      const poor = mine.reduce((n, row) => n + row.poor, 0);
      const samples = good + needsImprovement + poor;
      const total = mine.reduce((n, row) => n + Number(row.total), 0);
      return { metric, good, needsImprovement, poor, samples, average: samples ? total / samples : 0 };
    });

  // Pages where the main picture arrives late most often: a list to work through, worst first.
  const slow = await executor
    .select({
      path: webVitalsDaily.path,
      samples: sql<number>`sum(${webVitalsDaily.good} + ${webVitalsDaily.needsImprovement} + ${webVitalsDaily.poor})::int`,
      poor: sql<number>`sum(${webVitalsDaily.poor})::int`,
      total: sql<number>`sum(${webVitalsDaily.total})::float8`,
    })
    .from(webVitalsDaily)
    .where(and(vitalsInRange, sql`${webVitalsDaily.metric} = 'LCP'`))
    .groupBy(webVitalsDaily.path)
    .having(sql`sum(${webVitalsDaily.good} + ${webVitalsDaily.needsImprovement} + ${webVitalsDaily.poor}) >= ${SITE_STATS_RULES.minSamplesForPage}`);
  const slowPages = slow
    .map((row) => ({ path: row.path, samples: row.samples, poorShare: row.samples ? row.poor / row.samples : 0, average: row.samples ? Number(row.total) / row.samples : 0 }))
    .sort((a, b) => b.poorShare - a.poorShare || b.average - a.average)
    .slice(0, 6);

  // The funnel's account steps come from the accounts themselves. Registered demo subjects never count.
  // From midnight of the first day on the same clock as the counts.
  const [funnel] = (await executor.execute(sql`
    with fresh as (
      select u.id, u.email_verified_at from users u
      where u.created_at >= (${from}::date::timestamp at time zone ${SITE_STATS_RULES.dayTimeZone}) and u.deactivated_at is null
        and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = u.id::text)
    )
    select
      (select count(*)::int from fresh) as "accounts",
      (select count(*)::int from fresh where email_verified_at is not null) as "verified",
      (select count(*)::int from fresh f where exists (
        select 1 from audit_events a where a.actor_user_id = f.id and a.action in (${sql.join(FIRST_ACTIONS.map((action) => sql`${action}`), sql`, `)})
      )) as "acted"
  `)) as unknown as Array<{ accounts: number; verified: number; acted: number }>;

  const visits = totals?.visits ?? 0;
  return {
    days,
    from,
    to,
    totals: { views: totals?.views ?? 0, visits },
    byDay: byDayRows.map((row) => ({ day: String(row.day), views: row.views, visits: row.visits })).sort((a, b) => a.day.localeCompare(b.day)),
    pages,
    sources,
    devices: devices.map((row) => ({ device: row.device as Device, views: row.views })),
    vitals: { all: summarize(vitalRows), phone: summarize(vitalRows.filter((row) => row.device === 'phone')) },
    slowPages,
    funnel: { visits, accounts: funnel?.accounts ?? 0, verified: funnel?.verified ?? 0, acted: funnel?.acted ?? 0 },
    countingSince: first?.day ?? null,
  };
}
