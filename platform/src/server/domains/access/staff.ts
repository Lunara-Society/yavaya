import 'server-only';
import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { userRoles, users } from '@/server/db/schema';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
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
export const APPOINTABLE_ROLES = ['moderator', 'district_reviewer', 'safe_space_guardian', 'support'] as const;
export type AppointableRole = (typeof APPOINTABLE_ROLES)[number];

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
  const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw errors.notFound('user');
  // Staff act for everyone; an account that has not confirmed its email, or is restricted, cannot.
  if (user.status !== 'active') throw new DomainError('conflict', 'staff.error.not_active');
  await grantRole(tx, { userId: params.userId, roleKey: params.role, grantedBy: actor.userId });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'roles.appointed', subjectType: 'user', subjectId: params.userId, metadata: { role: params.role } });
  await notify(tx, [{ userId: params.userId, category: 'account', type: 'staff.appointed', titleKey: `notify.staff.appointed.${params.role}`, href: '/admin' }]);
}

export async function removeAppointment(tx: Executor, params: { actor: AuthContext | null; userId: string; role: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'roles.manage');
  if (!(APPOINTABLE_ROLES as readonly string[]).includes(params.role)) throw errors.validation('staff.error.role');
  await revokeRole(tx, { userId: params.userId, roleKey: params.role });
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'roles.removed', subjectType: 'user', subjectId: params.userId, metadata: { role: params.role } });
}
