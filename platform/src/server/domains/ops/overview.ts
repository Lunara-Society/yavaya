import 'server-only';
import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { auditEvents, userRoles, users } from '@/server/db/schema';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';

/**
 * The owner's view of what is happening: the team and when each was last
 * active, the week's team and account actions, and a few real counts.
 * roles.manage only — today, the owner's account alone.
 *
 * Counts follow the demo rules: registered demo subjects never count. Actions
 * come from the audit log, which is permanent; only the last
 * LIVE_FEED_RULES.keepDays are shown here.
 */

/** The audit actions worth the owner's eye, newest first. */
export const OVERVIEW_ACTIONS = [
  'roles.appointed',
  'roles.removed',
  'identity.member_suspended',
  'identity.member_banned',
  'identity.member_reinstated',
  'identity.suspension_expired',
  'identity.sanction_appealed',
  'identity.sanction_appeal_decided',
  'identity.member_signed_out',
  'identity.two_step_disabled',
] as const;

export type OverviewAction = (typeof OVERVIEW_ACTIONS)[number];

export type TeamMember = { id: string; displayName: string; yayId: string; roles: string[]; lastActiveAt: Date | null; twoStep: boolean };
export type OverviewEvent = { at: Date; action: OverviewAction; by: string | null; who: string | null; role: string | null; };
export type Overview = {
  team: TeamMember[];
  events: OverviewEvent[];
  counts: { newMembers: number; members: number; newListings: number };
};

export async function ownerOverview(executor: Executor, actor: AuthContext | null, now = new Date()): Promise<Overview> {
  await requirePermission(executor, actor, 'roles.manage');
  const since = new Date(now.getTime() - LIVE_FEED_RULES.keepDays * 24 * 60 * 60 * 1000);

  // The team: everyone holding a staff role, with their latest session activity.
  const held = await executor
    .select({ userId: userRoles.userId, roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(isNull(userRoles.revokedAt), ne(userRoles.roleKey, 'member'), eq(userRoles.scope, 'global')));
  const ids = [...new Set(held.map((row) => row.userId))];
  const people = ids.length
    ? await executor
        .select({
          id: users.id,
          displayName: users.displayName,
          yayId: users.yayId,
          // Written out with table names: interpolated columns can render
          // unqualified, and inside a subquery "id" would mean the session's.
          lastActiveAt: sql<Date | null>`(select max(s.last_used_at) from sessions s where s.user_id = "users"."id")`,
          twoStep: sql<boolean>`exists (select 1 from two_step_factors f where f.user_id = "users"."id")`,
        })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const team = people
    .map((person) => ({
      id: person.id,
      displayName: person.displayName,
      yayId: formatYayId(person.yayId),
      roles: held.filter((row) => row.userId === person.id).map((row) => row.roleKey),
      lastActiveAt: person.lastActiveAt ? new Date(person.lastActiveAt) : null,
      twoStep: Boolean(person.twoStep),
    }))
    .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));

  // The week's actions, newest first, with names resolved for reading.
  const rows = await executor
    .select({ at: auditEvents.occurredAt, action: auditEvents.action, actorUserId: auditEvents.actorUserId, subjectId: auditEvents.subjectId, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(and(inArray(auditEvents.action, [...OVERVIEW_ACTIONS]), gte(auditEvents.occurredAt, since)))
    .orderBy(desc(auditEvents.id))
    .limit(40);
  const nameIds = [...new Set(rows.flatMap((row) => [row.actorUserId, row.subjectId]).filter((id): id is string => Boolean(id) && /^[0-9a-f-]{36}$/i.test(id as string)))];
  const names = nameIds.length ? await executor.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, nameIds)) : [];
  const nameOf = (id: string | null) => (id ? (names.find((n) => n.id === id)?.displayName ?? null) : null);
  const events = rows
    // A member turning off their own two-step is theirs to do; only an operator doing it is news.
    .filter((row) => row.action !== 'identity.two_step_disabled' || (row.metadata as { by?: string } | null)?.by === 'operator')
    .map((row) => {
      const meta = (row.metadata ?? {}) as { role?: string; roleKey?: string };
      return {
        at: row.at,
        action: row.action as OverviewAction,
        by: nameOf(row.actorUserId),
        who: nameOf(row.subjectId),
        role: meta.role ?? meta.roleKey ?? null,
      };
    });

  // Real counts only: registered demo subjects are left out.
  const sinceIso = since.toISOString();
  const [counts] = (await executor.execute(sql`
    select
      (select count(*)::int from users u where u.created_at >= ${sinceIso}::timestamptz and u.deactivated_at is null
        and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = u.id::text)) as "newMembers",
      (select count(*)::int from users u where u.deactivated_at is null
        and not exists (select 1 from demo_content d where d.subject_type = 'user' and d.subject_id = u.id::text)) as "members",
      (select count(*)::int from mercadito_listings l where l.created_at >= ${sinceIso}::timestamptz and l.status = 'published'
        and not exists (select 1 from demo_content d where d.subject_type = 'mercadito_listing' and d.subject_id = l.id::text)) as "newListings"
  `)) as unknown as Array<{ newMembers: number; members: number; newListings: number }>;

  return { team, events, counts: counts ?? { newMembers: 0, members: 0, newListings: 0 } };
}
