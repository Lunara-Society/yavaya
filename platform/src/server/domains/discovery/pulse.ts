import { sql, type SQL } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { BOARD_DISTRICT_KEYS } from '@/config/boards';

/**
 * What is really happening in each district, for the home page's cards
 * (docs/DISTRICT-FOCUS.md): how many new things today and this week, near the
 * visitor when they have chosen a place, and whether a district has nothing
 * in it at all.
 *
 * Every number comes from something that happened. The seven website
 * districts are counted from the live activity feed, which already refuses
 * demo content and drops listings that were withdrawn or sold; the board
 * districts, which do not write to that feed, from their open posts, leaving
 * out posts by registered demo accounts. "New" and "this week" are the live
 * feed's own windows (LIVE_FEED_RULES), so the cards and the ticker never
 * disagree about what is new.
 *
 * `empty` is true only when a district has nothing live a visitor could see
 * on its page; null where the page is for members (Servicios, Comunidad) and
 * a visitor could not check it anyway.
 */
export type DistrictPulse = { today: number; week: number; near: boolean; empty: boolean | null };

type Counts = Map<string, { today: number; week: number }>;

const ACTIVITY_DISTRICTS = ['mercadito', 'services', 'work', 'yavayago', 'community', 'sanctuary', 'animals'] as const;

export async function districtPulse(executor: Executor, options: { locationCode?: string | null; now?: Date } = {}): Promise<Record<string, DistrictPulse>> {
  const now = options.now ?? new Date();
  const day = new Date(now.getTime() - LIVE_FEED_RULES.windowHours * 60 * 60 * 1000);
  const week = new Date(now.getTime() - LIVE_FEED_RULES.keepDays * 24 * 60 * 60 * 1000);
  const code = options.locationCode ?? null;

  const [everywhere, near, live] = await Promise.all([
    counts(executor, { day, week, code: null }),
    code ? counts(executor, { day, week, code }) : Promise.resolve(null),
    liveDistricts(executor, now),
  ]);

  const result: Record<string, DistrictPulse> = {};
  for (const district of [...ACTIVITY_DISTRICTS, ...BOARD_DISTRICT_KEYS]) {
    const local = near?.get(district);
    // Near the visitor when something happened there; otherwise everywhere, said without "near you".
    const pick = local && local.week > 0 ? local : (everywhere.get(district) ?? { today: 0, week: 0 });
    result[district] = {
      today: pick.today,
      week: pick.week,
      near: Boolean(local && local.week > 0),
      empty: district === 'services' || district === 'community' ? null : !live.has(district),
    };
  }
  return result;
}

/** Inside the chosen place, or anywhere: a place's own code or any place under it. */
function within(column: SQL, code: string | null): SQL {
  if (!code) return sql`true`;
  return sql`${column} in (select l.id from locations l where l.code = ${code} or ${code} = any(l.path))`;
}

async function counts(executor: Executor, params: { day: Date; week: Date; code: string | null }): Promise<Counts> {
  const activity = await executor.execute<{ district: string; today: string; week: string }>(sql`
    select e.district, count(*) filter (where e.occurred_at >= ${params.day.toISOString()}) as today, count(*) as week
    from activity_events e
    where e.is_demo = false
      and e.district is not null
      and e.kind <> 'member_joined'
      and e.occurred_at >= ${params.week.toISOString()}
      and (e.subject_type is distinct from 'mercadito_listing' or exists (
        select 1 from mercadito_listings ml where ml.id::text = e.subject_id and ml.status = 'published'
      ))
      and ${within(sql`e.location_id`, params.code)}
    group by e.district`);
  const boards = await executor.execute<{ district: string; today: string; week: string }>(sql`
    select p.district, count(*) filter (where p.created_at >= ${params.day.toISOString()}) as today, count(*) as week
    from board_posts p
    where p.status = 'open'
      and p.created_at >= ${params.week.toISOString()}
      and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = p.author_user_id::text)
      and ${within(sql`p.location_id`, params.code)}
    group by p.district`);
  const map: Counts = new Map();
  for (const row of [...activity, ...boards]) map.set(row.district, { today: Number(row.today), week: Number(row.week) });
  return map;
}

/** The districts with at least one thing a visitor could see on their page right now. */
async function liveDistricts(executor: Executor, now: Date): Promise<Set<string>> {
  const at = now.toISOString();
  const result = await executor.execute<Record<string, boolean>>(sql`
    select
      exists (
        select 1 from mercadito_listings l
        where l.status in ('published', 'reserved')
          and not exists (select 1 from demo_content d where d.subject_type = 'mercadito_listing' and d.subject_id = l.id::text)
          and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = l.seller_user_id::text)
      ) as mercadito,
      exists (select 1 from work_posts w where w.status = 'open' and w.expires_at > ${at}) as work,
      exists (select 1 from animals_listings a where a.status = 'available') as animals,
      exists (select 1 from sanctuary_churches c where c.status = 'approved') as sanctuary,
      exists (select 1 from go_stores s where s.status = 'approved') as yavayago`);
  const boards = await executor.execute<{ district: string }>(sql`
    select distinct p.district from board_posts p
    where p.status = 'open' and p.expires_at > ${at}
      and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = p.author_user_id::text)`);
  const live = new Set<string>();
  for (const [district, any] of Object.entries(result[0] ?? {})) if (any) live.add(district);
  for (const row of boards) live.add(row.district);
  return live;
}
