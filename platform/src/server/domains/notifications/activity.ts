import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { activityEvents, locations } from '@/server/db/schema';

/**
 * Live activity.
 *
 * The feed shows real things that really happened — a listing posted in
 * Managua, a restaurant joining YavayaGo, an animal adopted. It is never
 * seeded, never simulated, and never padded to look busier than Yavaya is.
 *
 * Two guarantees are enforced here rather than left to callers:
 *  - `publishActivity` refuses to emit an event for demo content;
 *  - `recentActivity` only ever returns non-demo events.
 */

export type ActivityKind =
  | 'listing_published'
  | 'service_request_published'
  | 'restaurant_joined'
  | 'animal_adopted'
  | 'project_published'
  | 'cause_goal_reached'
  | 'member_joined';

export type PublishActivityInput = {
  kind: ActivityKind;
  district?: string | null;
  locationId?: string | null;
  /**
   * Non-identifying detail only — a city name, a count. Never a person's name,
   * an exact location, or the subject of a sensitive request.
   */
  publicParams?: Record<string, string | number>;
  /** True when the underlying row is demo content. Such events are dropped. */
  isDemoSubject?: boolean;
  /** How long the event stays in the feed. */
  visibleForSeconds?: number;
  /** The row the event is about, so the feed can drop it once that row is gone. */
  subject?: { type: 'mercadito_listing'; id: string };
};

export async function publishActivity(
  tx: Executor,
  input: PublishActivityInput,
): Promise<{ published: boolean; reason?: 'demo_subject' }> {
  if (input.isDemoSubject) {
    // Demo content must never appear in the live feed or trigger a
    // notification. Refusing here means no caller can get this wrong.
    return { published: false, reason: 'demo_subject' };
  }

  const visibleForSeconds = input.visibleForSeconds ?? 6 * 60 * 60;

  await tx.insert(activityEvents).values({
    kind: input.kind,
    district: input.district ?? null,
    locationId: input.locationId ?? null,
    publicParams: input.publicParams ?? {},
    isDemo: false,
    subjectType: input.subject?.type ?? null,
    subjectId: input.subject?.id ?? null,
    visibleUntil: new Date(Date.now() + visibleForSeconds * 1000),
  });

  return { published: true };
}

export type FeedItem = {
  id: string;
  kind: ActivityKind;
  district: string | null;
  /** i18n params, including a resolved place name when one is attached. */
  params: Record<string, string | number>;
  occurredAt: Date;
};

/**
 * Recent real activity, newest first.
 *
 * Scoped to a location subtree when one is supplied, so the feed reflects
 * where the user actually is rather than the whole platform.
 */
export async function recentActivity(
  executor: Executor,
  options: { limit?: number; locationCode?: string; locale?: string } = {},
): Promise<FeedItem[]> {
  const conditions = [
    eq(activityEvents.isDemo, false),
    gte(activityEvents.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    sql`(${activityEvents.visibleUntil} is null or ${activityEvents.visibleUntil} > now())`,
    // A listing that was withdrawn, sold or removed no longer counts as news.
    sql`(${activityEvents.subjectType} is distinct from 'mercadito_listing' or exists (
      select 1 from mercadito_listings l
      where l.id::text = ${activityEvents.subjectId} and l.status = 'published'
    ))`,
  ];

  if (options.locationCode) {
    conditions.push(
      sql`${activityEvents.locationId} in (
        select ${locations.id} from ${locations}
        where ${locations.code} = ${options.locationCode}
           or ${options.locationCode} = any(${locations.path})
      )`,
    );
  }

  const rows = await executor
    .select({
      id: activityEvents.id,
      kind: activityEvents.kind,
      district: activityEvents.district,
      publicParams: activityEvents.publicParams,
      occurredAt: activityEvents.occurredAt,
      placeName: locations.name,
      placeNames: locations.names,
    })
    .from(activityEvents)
    .leftJoin(locations, eq(locations.id, activityEvents.locationId))
    .where(and(...conditions))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(options.limit ?? 12);

  const locale = options.locale ?? 'es';

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as ActivityKind,
    district: row.district,
    params: {
      ...row.publicParams,
      ...(row.placeName
        ? { place: (row.placeNames as Record<string, string> | null)?.[locale] ?? row.placeName }
        : {}),
    },
    occurredAt: row.occurredAt,
  }));
}
