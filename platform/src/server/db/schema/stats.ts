import { date, doublePrecision, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Yavaya's own visit statistics, counted per day. There is no visitor in
 * these tables: no cookie, address, account, device id or anything that
 * could tell one person from another — a row says "this page was seen this
 * many times today on phones, and this many of those visits arrived from
 * Google". See src/server/domains/stats and docs/SECURITY.md.
 *
 * Kept SITE_STATS_RULES.keepDays, then deleted by the scheduler.
 */
export const pageViewsDaily = pgTable(
  'page_views_daily',
  {
    day: date('day').notNull(),
    /** The page's route, with ids replaced by their name: /mercadito/[id], never a listing's id. */
    path: text('path').notNull(),
    /** phone, tablet or desktop, from the width of the window. */
    device: text('device').notNull(),
    /**
     * Where the visit came from, as a site's name (google, facebook, a host),
     * "direct" with no referrer, or empty for a page reached from another
     * Yavaya page.
     */
    source: text('source').notNull(),
    views: integer('views').notNull().default(0),
    /** Views that began a visit: arrived from outside, not a reload or a step back. */
    entries: integer('entries').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.path, table.device, table.source] })],
);

/**
 * How fast pages were for real visitors, per day, page, kind of screen and
 * measure (LCP, INP, CLS, FCP, TTFB), sorted into the three bands the web's
 * own guidance uses. `total` is the sum of the values, for an average.
 */
export const webVitalsDaily = pgTable(
  'web_vitals_daily',
  {
    day: date('day').notNull(),
    path: text('path').notNull(),
    device: text('device').notNull(),
    metric: text('metric').notNull(),
    good: integer('good').notNull().default(0),
    needsImprovement: integer('needs_improvement').notNull().default(0),
    poor: integer('poor').notNull().default(0),
    total: doublePrecision('total').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.path, table.device, table.metric] })],
);

/**
 * What Roxi's own initiatives led to, per day: check-ins shown and opened,
 * simulated calls rung, answered, declined or missed, and — the number that
 * matters — conversations begun from one of them that ended with a draft
 * prepared or a result opened. Counts only; no member, no session.
 */
export const roxiHelpDaily = pgTable(
  'roxi_help_daily',
  {
    day: date('day').notNull(),
    event: text('event').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.event] })],
);
