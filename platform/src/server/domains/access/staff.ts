import 'server-only';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { userRoles, users } from '@/server/db/schema';
import { DomainError, errors } from '@/server/errors';
import { recentAuditEvents, recordAudit } from '@/server/domains/audit/service';
import { formatYayId, parseYayId } from '@/server/domains/identity/yay-id';
import { notify } from '@/server/domains/notifications/service';
import { grantRole, requirePermission, revokeRole, type AuthContext } from './authorize';

/**
 * Appointing people to staff roles.
 *
 * Only these roles can be given from the page. `admin` is not among them on
 * purpose: full authority is granted by the bootstrap (PRIMARY_ADMIN_EMAIL)
 * or by hand, never by a form that a stolen admin session could use to make
 * a second admin.
 */
export const APPOINTABLE_ROLES = ['community_manager', 'moderator', 'district_reviewer', 'safe_space_guardian', 'support'] as const;

/**
 * Roles shown on the holder's public profile as a team badge. The others stay
 * private on purpose: who reads Espacio Violeta's reports, or who can see
 * accounts, is not something to advertise.
 */
export const PUBLIC_TEAM_ROLES = ['community_manager'] as const;

/** The public team badge a member wears, if any. */
export async function publicTeamRole(executor: Executor, userId: string): Promise<(typeof PUBLIC_TEAM_ROLES)[number] | null> {
  const [row] = await executor
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt), eq(userRoles.scope, 'global'), inArray(userRoles.roleKey, [...PUBLIC_TEAM_ROLES]), or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))))
    .limit(1);
  return (row?.roleKey as (typeof PUBLIC_TEAM_ROLES)[number] | undefined) ?? null;
}
export type AppointableRole = (typeof APPOINTABLE_ROLES)[number];

/** Notification type of an appointment; unread, it means the welcome has not been seen. */
export const STAFF_WELCOME_TYPE = 'staff.appointed';

export type Member = { id: string; displayName: string; email: string; yayId: string; status: string; roles: string[] };

async function rolesOf(executor: Executor, userIds: string[]): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await executor
    .select({ userId: userRoles.userId, roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(sql`${userRoles.userId} in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`, isNull(userRoles.revokedAt), ne(userRoles.roleKey, 'member'), eq(userRoles.scope, 'global')));
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row.roleKey]);
  return map;
}

/** Find a member by email, YAY ID or name. Admin only; the email is needed to tell people apart. */
export async function searchMembers(executor: Executor, actor: AuthContext | null, query: string): Promise<Member[]> {
  await requirePermission(executor, actor, 'roles.manage');
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = parseYayId(q);
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const rows = await executor
    .select({ id: users.id, displayName: users.displayName, email: users.email, yayId: users.yayId, status: users.status })
    .from(users)
    .where(or(ilike(users.email, like), ilike(users.displayName, like), digits ? eq(users.yayId, digits) : sql`false`))
    .orderBy(asc(users.displayName))
    .limit(20);
  const roles = await rolesOf(executor, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, yayId: formatYayId(r.yayId), roles: roles.get(r.id) ?? [] }));
}

/** Everyone who holds a staff role now. */
export async function staffList(executor: Executor, actor: AuthContext | null) {
  await requirePermission(executor, actor, 'roles.manage');
  const rows = await executor
    .select({ id: users.id, displayName: users.displayName, email: users.email, yayId: users.yayId, status: users.status, roleKey: userRoles.roleKey, grantedAt: userRoles.grantedAt, expiresAt: userRoles.expiresAt })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(isNull(userRoles.revokedAt), ne(userRoles.roleKey, 'member'), eq(userRoles.scope, 'global')))
    .orderBy(asc(userRoles.roleKey), desc(userRoles.grantedAt));
  return rows.map((r) => ({ ...r, yayId: formatYayId(r.yayId) }));
}

export async function appoint(tx: Executor, params: { actor: AuthContext | null; userId: string; role: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'roles.manage');
  if (!(APPOINTABLE_ROLES as readonly string[]).includes(params.role)) throw errors.validation('staff.error.role');
  const [user] = await tx.select({ status: users.status, displayName: users.displayName }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw errors.notFound('user');
  // Already holding it: nothing happens. A double click or a resubmitted form
  // must not send a second welcome or write a second appointment.
  const [held] = await tx
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(eq(userRoles.userId, params.userId), eq(userRoles.roleKey, params.role), eq(userRoles.scope, 'global'), isNull(userRoles.revokedAt), or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))))
    .limit(1);
  if (held) return;
  // Staff act for everyone; an account that has not confirmed its email, or is restricted, cannot.
  if (user.status !== 'active') throw new DomainError('conflict', 'staff.error.not_active');
  await grantRole(tx, { userId: params.userId, roleKey: params.role, grantedBy: actor.userId });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'roles.appointed', subjectType: 'user', subjectId: params.userId, metadata: { role: params.role } });
  // The note opens the welcome page, and the next sign-in goes there too
  // (see loginAction) until it has been seen once.
  await notify(tx, [{ userId: params.userId, category: 'account', type: STAFF_WELCOME_TYPE, titleKey: `notify.staff.appointed.${params.role}`, params: { name: user.displayName }, href: '/welcome' }]);
}

export async function removeAppointment(tx: Executor, params: { actor: AuthContext | null; userId: string; role: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'roles.manage');
  if (!(APPOINTABLE_ROLES as readonly string[]).includes(params.role)) throw errors.validation('staff.error.role');
  await revokeRole(tx, { userId: params.userId, roleKey: params.role });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'roles.removed', subjectType: 'user', subjectId: params.userId, metadata: { role: params.role } });
}

export type TeamChange = { at: Date; change: 'appointed' | 'removed'; role: string; name: string | null; by: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The latest appointments and removals, newest first, from the audit log. Admin only. */
export async function recentTeamChanges(executor: Executor, actor: AuthContext | null, limit = 20): Promise<TeamChange[]> {
  await requirePermission(executor, actor, 'roles.manage');
  const events = await recentAuditEvents(executor, { actions: ['roles.appointed', 'roles.removed'], limit });
  const ids = [...new Set(events.flatMap((e) => [e.subjectId, e.actorUserId]).filter((id): id is string => Boolean(id && UUID.test(id))))];
  const people = ids.length ? await executor.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, ids)) : [];
  const nameOf = new Map(people.map((p) => [p.id, p.displayName]));
  return events.map((e) => ({
    at: e.occurredAt,
    change: e.action === 'roles.appointed' ? 'appointed' : 'removed',
    role: String(e.metadata.role ?? ''),
    name: (e.subjectId && nameOf.get(e.subjectId)) ?? null,
    by: (e.actorUserId && nameOf.get(e.actorUserId)) ?? null,
  }));
}
