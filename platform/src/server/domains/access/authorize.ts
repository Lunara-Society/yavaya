import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { rolePermissions, userRoles } from '@/server/db/schema';
import { errors } from '@/server/errors';
import type { PermissionKey } from './permissions';

/**
 * Authorization.
 *
 * Every privileged operation calls `requirePermission` on the server. There is
 * no client-side authority: the browser is never asked what a user may do, and
 * a hidden control is a usability affordance, never a security boundary.
 *
 * Scope narrows a grant to one district or one location subtree. A global
 * grant satisfies any scoped check; a scoped grant satisfies only its own.
 */

export type AuthContext = {
  userId: string;
  status: string;
};

export type PermissionScope = { type: 'district' | 'location'; ref: string } | null;

export async function listPermissions(
  executor: Executor,
  userId: string,
): Promise<Set<PermissionKey>> {
  const rows = await executor
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleKey, userRoles.roleKey))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(userRoles.revokedAt),
        or(isNull(userRoles.expiresAt), sql`${userRoles.expiresAt} > now()`),
      ),
    );

  return new Set(rows.map((row) => row.permissionKey as PermissionKey));
}

export async function hasPermission(
  executor: Executor,
  userId: string,
  permission: PermissionKey,
  scope: PermissionScope = null,
): Promise<boolean> {
  const conditions = [
    eq(userRoles.userId, userId),
    eq(rolePermissions.permissionKey, permission),
    isNull(userRoles.revokedAt),
    or(isNull(userRoles.expiresAt), sql`${userRoles.expiresAt} > now()`),
  ];

  const scopeCondition = scope
    ? or(
        eq(userRoles.scope, 'global'),
        and(eq(userRoles.scope, scope.type), eq(userRoles.scopeRef, scope.ref)),
      )
    : eq(userRoles.scope, 'global');

  const [row] = await executor
    .select({ ok: sql<number>`1` })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleKey, userRoles.roleKey))
    .where(and(...conditions, scopeCondition))
    .limit(1);

  return Boolean(row);
}

/**
 * Throws unless the caller holds the permission.
 *
 * A suspended or banned account is refused regardless of its roles — an
 * administrator who is themselves suspended has no authority.
 */
export async function requirePermission(
  executor: Executor,
  context: AuthContext | null,
  permission: PermissionKey,
  scope: PermissionScope = null,
): Promise<AuthContext> {
  if (!context) throw errors.unauthenticated();
  if (context.status === 'banned' || context.status === 'suspended' || context.status === 'deactivated') {
    throw errors.forbidden(permission);
  }
  const allowed = await hasPermission(executor, context.userId, permission, scope);
  if (!allowed) throw errors.forbidden(permission);
  return context;
}

export async function isAdmin(executor: Executor, userId: string): Promise<boolean> {
  const [row] = await executor
    .select({ ok: sql<number>`1` })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleKey, 'admin'), isNull(userRoles.revokedAt)))
    .limit(1);
  return Boolean(row);
}

/** Grants a role. Callers must already have checked their own authority. */
export async function grantRole(
  tx: Executor,
  params: {
    userId: string;
    roleKey: string;
    grantedBy: string | null;
    scope?: 'global' | 'district' | 'location';
    scopeRef?: string | null;
    expiresAt?: Date | null;
  },
): Promise<void> {
  await tx
    .insert(userRoles)
    .values({
      userId: params.userId,
      roleKey: params.roleKey,
      scope: params.scope ?? 'global',
      scopeRef: params.scopeRef ?? null,
      grantedBy: params.grantedBy,
      expiresAt: params.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [userRoles.userId, userRoles.roleKey, userRoles.scope, userRoles.scopeRef],
      set: { revokedAt: null, grantedAt: new Date(), expiresAt: params.expiresAt ?? null },
    });
}

export async function revokeRole(
  tx: Executor,
  params: { userId: string; roleKey: string; scope?: 'global' | 'district' | 'location'; scopeRef?: string | null },
): Promise<void> {
  await tx
    .update(userRoles)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userRoles.userId, params.userId),
        eq(userRoles.roleKey, params.roleKey),
        eq(userRoles.scope, params.scope ?? 'global'),
        params.scopeRef ? eq(userRoles.scopeRef, params.scopeRef) : isNull(userRoles.scopeRef),
      ),
    );
}
