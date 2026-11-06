import 'server-only';
import { and, desc, eq, gt, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import {
  animalsLostFound,
  communityPosts,
  demoContent,
  goStores,
  locations,
  mercaditoListings,
  roxiItems,
  roxiSubscriptions,
  servicesRequests,
  userProfiles,
  users,
  workApplications,
  workPosts,
  workProfiles,
} from '@/server/db/schema';
import { notify } from '@/server/domains/notifications/service';
import { SITE_STATS_RULES } from '@/config/business-rules';
import { listItems, type ItemView } from './items';

/**
 * What Roxi tells a member about the world around them. Every sentence comes
 * from a record; when there is nothing, she says so.
 *
 * - **Community pulse (20)** — counts of what is new and public in a town
 *   today, with the newest public item of each kind. Family support and
 *   prayer are never counted: they are sensitive even when public. Demo
 *   content is never counted.
 * - **Watches (26)** — "tell me when a fridge under 5,000 córdobas appears":
 *   one notification per new matching listing or job offer, at most a few a
 *   day, starting from the moment the watch was saved.
 * - **Something good for you today (2)** — once a day, for Pro and Max, one
 *   real new item that fits a watch, the member's work fields, or a goal.
 *   No item, no message.
 * - **Mi camino (19)** — what Yavaya's records show the member did, next to
 *   the milestones they chose to save, never mixed up: a member saying they
 *   sold something is not a recorded sale.
 */

const DAY_MS = 86_400_000;

/** Ids of registered demo content of one type, to leave out of anything counted or suggested. */
async function demoIds(executor: Executor, subjectType: string): Promise<string[]> {
  const rows = await executor.select({ id: demoContent.subjectId }).from(demoContent).where(eq(demoContent.subjectType, subjectType));
  return rows.map((row) => row.id);
}

const under = (placeCode: string) => sql`(${locations.code} = ${placeCode} or ${placeCode} = any(${locations.path}))`;
const notDemo = (column: typeof mercaditoListings.id | typeof workPosts.id | typeof animalsLostFound.id | typeof communityPosts.id | typeof servicesRequests.id, ids: string[]) =>
  ids.length > 0 ? notInArray(column, ids) : undefined;

export type PulseItem = { title: string; url: string };
export type Pulse = {
  place: string;
  since: string;
  mercadito: { newListings: number; newest: PulseItem | null };
  work: { newOffers: number; newest: PulseItem | null };
  community: { openHelpRequests: number; newHelpOffers: number };
  services: { openRequests: number };
  animals: { stillLost: number; newest: PulseItem | null };
  empty: boolean;
};

/** Today's public activity under a place (a town includes its villages). */
export async function communityPulse(executor: Executor, params: { placeCode: string; placeName: string; now?: Date }): Promise<Pulse> {
  const now = params.now ?? new Date();
  const since = new Date(now.getTime() - DAY_MS);
  const [demoListings, demoWork, demoLost, demoPosts, demoServices] = await Promise.all([
    demoIds(executor, 'mercadito_listing'),
    demoIds(executor, 'work_post'),
    demoIds(executor, 'animals_lost_found'),
    demoIds(executor, 'community_post'),
    demoIds(executor, 'services_request'),
  ]);

  const listings = await executor
    .select({ id: mercaditoListings.id, title: mercaditoListings.title })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .where(and(inArray(mercaditoListings.status, ['published', 'reserved']), gt(mercaditoListings.publishedAt, since), under(params.placeCode), notDemo(mercaditoListings.id, demoListings)))
    .orderBy(desc(mercaditoListings.publishedAt))
    .limit(200);

  const offers = await executor
    .select({ id: workPosts.id, title: workPosts.title })
    .from(workPosts)
    .innerJoin(locations, eq(locations.id, workPosts.locationId))
    .where(and(eq(workPosts.status, 'open'), gt(workPosts.createdAt, since), gt(workPosts.expiresAt, now), under(params.placeCode), notDemo(workPosts.id, demoWork)))
    .orderBy(desc(workPosts.createdAt))
    .limit(200);

  const lost = await executor
    .select({ id: animalsLostFound.id, name: animalsLostFound.name, species: animalsLostFound.species })
    .from(animalsLostFound)
    .innerJoin(locations, eq(locations.id, animalsLostFound.locationId))
    .where(and(eq(animalsLostFound.status, 'open'), eq(animalsLostFound.kind, 'lost'), under(params.placeCode), notDemo(animalsLostFound.id, demoLost)))
    .orderBy(desc(animalsLostFound.createdAt))
    .limit(200);

  const [help] = await executor
    .select({
      requests: sql<number>`count(*) filter (where ${communityPosts.kind} = 'help_request')::int`,
      offers: sql<number>`count(*) filter (where ${communityPosts.kind} = 'help_offer' and ${communityPosts.createdAt} > ${since.toISOString()}::timestamptz)::int`,
    })
    .from(communityPosts)
    .innerJoin(locations, eq(locations.id, communityPosts.locationId))
    .where(and(eq(communityPosts.status, 'open'), inArray(communityPosts.kind, ['help_request', 'help_offer']), under(params.placeCode), notDemo(communityPosts.id, demoPosts)));

  const [services] = await executor
    .select({ open: sql<number>`count(*)::int` })
    .from(servicesRequests)
    .innerJoin(locations, eq(locations.id, servicesRequests.locationId))
    .where(and(eq(servicesRequests.status, 'open'), under(params.placeCode), notDemo(servicesRequests.id, demoServices)));

  const pulse: Pulse = {
    place: params.placeName,
    since: since.toISOString(),
    mercadito: { newListings: listings.length, newest: listings[0] ? { title: listings[0].title, url: `/mercadito/${listings[0].id}` } : null },
    work: { newOffers: offers.length, newest: offers[0] ? { title: offers[0].title, url: `/work/posts/${offers[0].id}` } : null },
    community: { openHelpRequests: Number(help?.requests ?? 0), newHelpOffers: Number(help?.offers ?? 0) },
    services: { openRequests: Number(services?.open ?? 0) },
    animals: { stillLost: lost.length, newest: lost[0] ? { title: lost[0].name ?? lost[0].species, url: `/animals/lost/${lost[0].id}` } : null },
    empty: false,
  };
  pulse.empty = listings.length + offers.length + lost.length + pulse.community.openHelpRequests + pulse.community.newHelpOffers + pulse.services.openRequests === 0;
  return pulse;
}

/** The member's own place: its code and name, from their profile. */
export async function memberPlace(executor: Executor, userId: string): Promise<{ code: string; name: string; parentCode: string | null; parentName: string | null } | null> {
  const [row] = await executor
    .select({ code: locations.code, name: locations.name, path: locations.path })
    .from(userProfiles)
    .innerJoin(locations, eq(locations.id, userProfiles.locationId))
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  const path = (row.path as string[] | null) ?? [];
  const parentCode = path.length > 0 ? path[path.length - 1]! : null;
  const [parent] = parentCode ? await executor.select({ name: locations.name }).from(locations).where(eq(locations.code, parentCode)).limit(1) : [];
  return { code: row.code, name: row.name, parentCode, parentName: parent?.name ?? null };
}

/**
 * The member's clock and money: the time zone and currency of the country
 * they live in (countries carry both as rows), so "today" is their today and
 * the ledger starts in their currency. Without a place, the site's day clock
 * and no currency — never a guessed country.
 */
export async function memberClock(executor: Executor, userId: string, now = new Date()): Promise<{ timeZone: string; today: string; currency: string | null }> {
  const [row] = await executor
    .select({ code: locations.code, path: locations.path })
    .from(userProfiles)
    .innerJoin(locations, eq(locations.id, userProfiles.locationId))
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const codes = row ? [...((row.path as string[] | null) ?? []), row.code] : [];
  const ancestors = codes.length
    ? await executor
        .select({ timezone: locations.timezone, currency: locations.currencyCode, depth: locations.depth })
        .from(locations)
        .where(inArray(locations.code, codes))
        .orderBy(desc(locations.depth))
    : [];
  const timeZone = ancestors.find((place) => place.timezone)?.timezone ?? SITE_STATS_RULES.dayTimeZone;
  const currency = ancestors.find((place) => place.currency)?.currency ?? null;
  let today: string;
  try {
    today = now.toLocaleDateString('en-CA', { timeZone });
  } catch {
    today = now.toLocaleDateString('en-CA', { timeZone: SITE_STATS_RULES.dayTimeZone });
  }
  return { timeZone, today, currency };
}

// --- Watches -------------------------------------------------------------------

type Match = { id: string; title: string; url: string; detail: string };

/** New things that fit one watch, published after `since`, newest first. */
export async function watchMatches(executor: Executor, watch: ItemView, since: Date, limit = 3): Promise<Match[]> {
  const query = watch.query ? `%${watch.query.replace(/[\\%_]/g, (match) => `\\${match}`)}%` : null;
  if (watch.district === 'work') {
    const demo = await demoIds(executor, 'work_post');
    const rows = await executor
      .select({ id: workPosts.id, title: workPosts.title, pay: workPosts.payText })
      .from(workPosts)
      .innerJoin(locations, eq(locations.id, workPosts.locationId))
      .where(
        and(
          eq(workPosts.status, 'open'),
          gt(workPosts.createdAt, since),
          query ? sql`(${workPosts.title} ilike ${query} or ${workPosts.description} ilike ${query})` : undefined,
          watch.placeCode ? under(watch.placeCode) : undefined,
          notDemo(workPosts.id, demo),
        ),
      )
      .orderBy(desc(workPosts.createdAt))
      .limit(limit);
    return rows.map((row) => ({ id: row.id, title: row.title, url: `/work/posts/${row.id}`, detail: row.pay }));
  }
  const demo = await demoIds(executor, 'mercadito_listing');
  // A price only compares with a price in the same currency: 5,000 córdobas is not 5,000 dollars.
  const priceCap = watch.maxPrice && watch.currency ? Math.round(watch.maxPrice * 100) : null;
  const rows = await executor
    .select({ id: mercaditoListings.id, title: mercaditoListings.title, priceMinor: mercaditoListings.priceMinor, currency: mercaditoListings.currencyCode })
    .from(mercaditoListings)
    .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
    .where(
      and(
        inArray(mercaditoListings.status, ['published', 'reserved']),
        gt(mercaditoListings.publishedAt, since),
        query ? sql`(${mercaditoListings.title} ilike ${query} or ${mercaditoListings.description} ilike ${query})` : undefined,
        priceCap !== null ? and(eq(mercaditoListings.currencyCode, watch.currency!), sql`${mercaditoListings.priceMinor} <= ${priceCap}`) : undefined,
        watch.placeCode ? under(watch.placeCode) : undefined,
        notDemo(mercaditoListings.id, demo),
      ),
    )
    .orderBy(desc(mercaditoListings.publishedAt))
    .limit(limit);
  return rows.map((row) => ({ id: row.id, title: row.title, url: `/mercadito/${row.id}`, detail: `${row.currency} ${(Number(row.priceMinor) / 100).toLocaleString('es')}` }));
}

/**
 * Every active watch, against what was published since it last looked. One
 * notification per new match (a repeat is dropped by its key), at most three
 * a run per watch, so a busy category cannot flood anyone.
 */
export async function runWatches(database: Database, now = new Date()): Promise<{ checked: number; sent: number }> {
  const rows = await database
    .select({ id: roxiItems.id, userId: roxiItems.userId, notifiedAt: roxiItems.notifiedAt, createdAt: roxiItems.createdAt })
    .from(roxiItems)
    .where(and(eq(roxiItems.kind, 'watch'), isNull(roxiItems.doneAt)))
    .limit(2_000);
  let sent = 0;
  const byUser = new Map<string, ItemView[]>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, (await listItems(database, row.userId, 'watch')).filter((item) => !item.done));
  }
  for (const row of rows) {
    const watch = byUser.get(row.userId)?.find((item) => item.id === row.id);
    if (!watch) continue;
    const since = row.notifiedAt ?? row.createdAt;
    const matches = await watchMatches(database, watch, since);
    await database.transaction(async (tx) => {
      for (const match of matches.reverse()) {
        sent += await notify(tx, [
          {
            userId: row.userId,
            category: 'roxi',
            type: 'roxi.watch',
            titleKey: 'roxi.notify.watch',
            bodyKey: 'roxi.notify.watch_body',
            params: { title: match.title.slice(0, 120) },
            href: match.url,
            dedupeKey: `roxi-watch:${row.id}:${match.id}`,
            subjectId: match.id,
          },
        ]);
      }
      await tx.update(roxiItems).set({ notifiedAt: now }).where(eq(roxiItems.id, row.id));
    });
  }
  return { checked: rows.length, sent };
}

// --- Something good for you today ----------------------------------------------------

const STOP = new Set(['para', 'quiero', 'comprar', 'tener', 'hacer', 'mucho', 'poco', 'todavía', 'dinero', 'ahorrar', 'nueva', 'nuevo', 'with', 'want', 'have', 'money', 'save', 'algún', 'algun', 'mismo', 'propia', 'propio']);

function goalWords(goals: ItemView[]): string[] {
  const words = goals.flatMap((goal) =>
    `${goal.title} ${goal.detail ?? ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9ñ]+/)
      .filter((word) => word.length >= 4 && !STOP.has(word)),
  );
  return [...new Set(words)].slice(0, 6);
}

export type Opportunity = { kind: 'watch' | 'work' | 'goal'; title: string; url: string; why: string };

/** One real new thing for this member from the last day, or null. Never invented, never a filler. */
export async function opportunityFor(executor: Executor, userId: string, now = new Date()): Promise<Opportunity | null> {
  const since = new Date(now.getTime() - DAY_MS);
  const items = await listItems(executor, userId);
  for (const watch of items.filter((item) => item.kind === 'watch' && !item.done)) {
    const [match] = await watchMatches(executor, watch, since, 1);
    if (match) return { kind: 'watch', title: match.title, url: match.url, why: watch.query ?? '' };
  }
  const place = await memberPlace(executor, userId);
  const [profile] = await executor.select({ fields: workProfiles.fields }).from(workProfiles).where(eq(workProfiles.userId, userId)).limit(1);
  if (profile && profile.fields.length > 0) {
    const demo = await demoIds(executor, 'work_post');
    const [offer] = await executor
      .select({ id: workPosts.id, title: workPosts.title, field: workPosts.field })
      .from(workPosts)
      .innerJoin(locations, eq(locations.id, workPosts.locationId))
      .where(and(eq(workPosts.status, 'open'), gt(workPosts.createdAt, since), inArray(workPosts.field, profile.fields), place ? under(place.parentCode ?? place.code) : undefined, notDemo(workPosts.id, demo)))
      .orderBy(desc(workPosts.createdAt))
      .limit(1);
    if (offer) return { kind: 'work', title: offer.title, url: `/work/posts/${offer.id}`, why: offer.field };
  }
  const words = goalWords(items.filter((item) => item.kind === 'goal' && !item.done));
  if (words.length > 0 && place) {
    const demo = await demoIds(executor, 'mercadito_listing');
    const [listing] = await executor
      .select({ id: mercaditoListings.id, title: mercaditoListings.title })
      .from(mercaditoListings)
      .innerJoin(locations, eq(locations.id, mercaditoListings.locationId))
      .where(
        and(
          inArray(mercaditoListings.status, ['published', 'reserved']),
          gt(mercaditoListings.publishedAt, since),
          under(place.parentCode ?? place.code),
          sql`(${sql.join(
            words.map((word) => sql`${mercaditoListings.title} ilike ${`%${word}%`}`),
            sql` or `,
          )})`,
          notDemo(mercaditoListings.id, demo),
        ),
      )
      .orderBy(desc(mercaditoListings.publishedAt))
      .limit(1);
    if (listing) return { kind: 'goal', title: listing.title, url: `/mercadito/${listing.id}`, why: words.join(', ') };
  }
  return null;
}

/**
 * Once a day (the first tick after 12:00 UTC, early morning in Central
 * America), Pro and Max members get one opportunity if there is a real one.
 * Nothing found: no message.
 */
export async function sendDailyOpportunities(database: Database, now = new Date()): Promise<{ members: number; sent: number }> {
  if (now.getUTCHours() !== 12) return { members: 0, sent: 0 };
  const members = await database
    .select({ userId: roxiSubscriptions.userId })
    .from(roxiSubscriptions)
    .innerJoin(users, eq(users.id, roxiSubscriptions.userId))
    .where(and(inArray(roxiSubscriptions.status, ['active', 'canceling']), gt(roxiSubscriptions.periodEnd, now), eq(users.status, 'active')));
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const member of members) {
    const found = await opportunityFor(database, member.userId, now).catch(() => null);
    if (!found) continue;
    sent += await notify(database, [
      {
        userId: member.userId,
        category: 'roxi',
        type: 'roxi.opportunity',
        titleKey: 'roxi.notify.opportunity',
        bodyKey: 'roxi.notify.opportunity_body',
        params: { title: found.title.slice(0, 120) },
        href: found.url,
        dedupeKey: `roxi-daily:${member.userId}:${day}`,
      },
    ]);
  }
  return { members: members.length, sent };
}

// --- Mi camino --------------------------------------------------------------------

export type PathEntry = { day: string; text: string; source: 'yavaya' | 'member'; key?: string; id?: string };

/**
 * The member's path: what Yavaya's own records show (account opened, first
 * listing, Trabajo profile, first application, store approved) and the
 * milestones they chose to save. Each entry says which it is.
 */
export async function lifePath(executor: Executor, userId: string): Promise<PathEntry[]> {
  const entries: PathEntry[] = [];
  const day = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
  const [account] = await executor.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (account) entries.push({ day: day(account.createdAt)!, text: '', key: 'joined', source: 'yavaya' });
  const [listing] = await executor
    .select({ first: sql<Date | null>`min(${mercaditoListings.publishedAt})`, count: sql<number>`count(*)::int` })
    .from(mercaditoListings)
    .where(eq(mercaditoListings.sellerUserId, userId));
  if (listing?.first) entries.push({ day: day(new Date(listing.first))!, text: '', key: 'first_listing', source: 'yavaya' });
  const [sold] = await executor
    .select({ first: sql<Date | null>`min(${mercaditoListings.updatedAt})` })
    .from(mercaditoListings)
    .where(and(eq(mercaditoListings.sellerUserId, userId), eq(mercaditoListings.status, 'sold')));
  // "Sold" is what the seller marked: Yavaya does not see the sale itself, and says so.
  if (sold?.first) entries.push({ day: day(new Date(sold.first))!, text: '', key: 'first_sold_marked', source: 'yavaya' });
  const [profile] = await executor.select({ createdAt: workProfiles.createdAt }).from(workProfiles).where(eq(workProfiles.userId, userId)).limit(1);
  if (profile) entries.push({ day: day(profile.createdAt)!, text: '', key: 'work_profile', source: 'yavaya' });
  const [application] = await executor
    .select({ first: sql<Date | null>`min(${workApplications.createdAt})` })
    .from(workApplications)
    .where(eq(workApplications.candidateUserId, userId));
  if (application?.first) entries.push({ day: day(new Date(application.first))!, text: '', key: 'first_application', source: 'yavaya' });
  const [store] = await executor
    .select({ createdAt: goStores.createdAt, status: goStores.status })
    .from(goStores)
    .where(eq(goStores.ownerUserId, userId))
    .limit(1);
  if (store?.status === 'approved') entries.push({ day: day(store.createdAt)!, text: '', key: 'store', source: 'yavaya' });
  for (const milestone of await listItems(executor, userId, 'milestone')) {
    if (milestone.day) entries.push({ day: milestone.day, text: milestone.title, source: 'member', id: milestone.id });
  }
  for (const goal of (await listItems(executor, userId, 'goal')).filter((item) => item.done)) {
    entries.push({ day: goal.createdAt.toISOString().slice(0, 10), text: goal.title, key: 'goal_done', source: 'member', id: goal.id });
  }
  return entries.sort((a, b) => b.day.localeCompare(a.day));
}
