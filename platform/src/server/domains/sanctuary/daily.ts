import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { notificationPreferences } from '@/server/db/schema';
import { SANCTUARY_RULES as R } from '@/config/business-rules';
import { DAILY_KINDS, lightDate, type DailyKind } from '@/i18n/daily';
import { notify } from '@/server/domains/notifications/service';

/**
 * The daily light in Sanctuary: one prayer, saying, quote or blessing a
 * morning, from Yavaya to everyone. The texts and the choice of the day live
 * in `@/i18n/daily`; this module keeps who wants which kinds, and tells
 * members at their 8 o'clock that a new one is there.
 *
 * Which kinds a member wants is stored as ordinary notification preferences
 * (`daily.prayer`, `daily.saying`… on the in-app channel), so there is no new
 * table to migrate. A kind never touched is on: the default is all of them.
 * Whether to be told at all is the separate `daily` category, switchable in
 * settings like any other.
 */

const PREFIX = 'daily.';
export const DAILY_NOTIFY_CATEGORY = 'daily';

/** The kinds this member wants. Never empty: none chosen means all. */
export async function readDailyKinds(executor: Executor, userId: string): Promise<DailyKind[]> {
  const rows = await executor
    .select({ category: notificationPreferences.category, enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.channel, 'in_app'),
        inArray(notificationPreferences.category, DAILY_KINDS.map((kind) => PREFIX + kind)),
      ),
    );
  const off = new Set(rows.filter((row) => !row.enabled).map((row) => row.category.slice(PREFIX.length)));
  const kinds = DAILY_KINDS.filter((kind) => !off.has(kind));
  return kinds.length > 0 ? kinds : [...DAILY_KINDS];
}

/**
 * Saves the member's choice. Unticking every box is read as "show me
 * everything" rather than stored as "nothing": an empty daily light would be
 * a section that silently stops working.
 */
export async function setDailyKinds(executor: Executor, userId: string, kinds: readonly DailyKind[]): Promise<void> {
  const wanted = new Set(kinds.length > 0 ? kinds : DAILY_KINDS);
  const now = new Date();
  await executor
    .insert(notificationPreferences)
    .values(DAILY_KINDS.map((kind) => ({ userId, category: PREFIX + kind, channel: 'in_app' as const, enabled: wanted.has(kind), updatedAt: now })))
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.category, notificationPreferences.channel],
      set: { enabled: sql`excluded.enabled`, updatedAt: now },
    });
}

/** The member's timezone, from the most specific place that has one. Null without a place. */
export async function memberTimezone(executor: Executor, userId: string): Promise<string | null> {
  const rows = await executor.execute<{ tz: string | null }>(sql`
    select (
      select l2.timezone from locations l2
      where l2.code = any(l.path || array[l.code]) and l2.timezone is not null
      order by l2.depth desc limit 1
    ) as tz
    from user_profiles p join locations l on l.id = p.location_id
    where p.user_id = ${userId}
  `);
  return rows[0]?.tz ?? null;
}

/** Which day's text a member (or, with no timezone, a visitor) sees now. */
export function currentLightDate(timezone: string | null, now = new Date()): string {
  return lightDate(timezone, now, R.dailyLightLocalHour, R.dailyLightFallbackUtcHour);
}

/**
 * Scheduler job: at their local 8 o'clock, each active member gets one
 * in-app note that today's text is there. The dedupe key is the light day,
 * so overlapping or repeated runs never send it twice, and a member whose
 * morning came while the scheduler was down hears of it on the next tick
 * of that same day — never of a day already gone.
 *
 * The note does not carry the text itself: which kinds a member wants can
 * change after it was written, and the page always shows the right one.
 */
export async function deliverDailyLight(database: Database, now = new Date()): Promise<{ notified: number }> {
  const at = now.toISOString();
  const rows = await database.execute<{ user_id: string; light_day: string }>(sql`
    with member_zone as (
      select u.id as user_id, (
        select l2.timezone from user_profiles p
        join locations l on l.id = p.location_id
        join locations l2 on l2.code = any(l.path || array[l.code]) and l2.timezone is not null
        where p.user_id = u.id
        order by l2.depth desc limit 1
      ) as tz
      from users u
      where u.status = 'active'
    ),
    due as (
      select z.user_id,
        to_char(
          case when z.tz is null
            then (${at}::timestamptz at time zone 'UTC') - make_interval(hours => ${R.dailyLightFallbackUtcHour})
            else (${at}::timestamptz at time zone z.tz) - make_interval(hours => ${R.dailyLightLocalHour})
          end, 'YYYY-MM-DD') as light_day
      from member_zone z
    )
    select d.user_id, d.light_day from due d
    where not exists (
        select 1 from notifications n
        where n.user_id = d.user_id and n.dedupe_key = 'daily:' || d.light_day
      )
      and not exists (
        select 1 from notification_preferences np
        where np.user_id = d.user_id and np.category = ${DAILY_NOTIFY_CATEGORY} and np.channel = 'in_app' and np.enabled = false
      )
    order by d.user_id
    limit ${R.dailyLightBatchSize}
  `);
  if (rows.length === 0) return { notified: 0 };
  const notified = await database.transaction((tx) =>
    notify(
      tx,
      rows.map((row) => ({
        userId: row.user_id,
        category: 'daily' as const,
        type: 'daily.light',
        titleKey: 'notify.daily.light',
        href: '/sanctuary#daily',
        dedupeKey: `daily:${row.light_day}`,
      })),
    ),
  );
  return { notified };
}
