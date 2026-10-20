import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { enforcementRecords, sessions, userRoles, users } from '@/server/db/schema';
import { revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/domains/audit/service';
import { disableTwoStep, isTwoStepEnabled } from '@/server/domains/identity/two-step';
import { formatYayId, parseYayId } from '@/server/domains/identity/yay-id';
import { canonicalEmail } from '@/server/domains/identity/normalize';
import { errors } from '@/server/errors';
import { hasPermission, requirePermission, type AuthContext } from './authorize';

/**
 * Account-level sanctions and account help, for operators.
 *
 *   suspend   — users.suspend (moderators, admins). Signs the member out
 *               everywhere; they cannot sign in until reinstated.
 *   ban       — users.ban (admins). Permanent removal; the YAY ID stays
 *               reserved, so the person cannot simply come back as new.
 *   reinstate — users.restore (admins).
 *   two-step  — users.verify_identity (admins): turning off a member's
 *               two-step after checking who they are outside Yavaya.
 *
 * How long a suspension lasts is not defined anywhere, so none is invented:
 * it lasts until someone reinstates the account (see CONFIGURATION.md).
 * Someone holding a staff role can be sanctioned only by an admin, and nobody
 * can sanction themselves. Every action records its reason in the audit log
 * and, for sanctions, in the member's enforcement record — in the same
 * transaction as the change.
 */

export const SANCTION_REASONS = ['fraud', 'scam', 'financial_deception', 'animal_abuse', 'fraudulent_fundraising', 'multi_account_abuse', 'criminal_misuse', 'harassment', 'spam', 'other'] as const;
export type SanctionReason = (typeof SANCTION_REASONS)[number];

export type MemberRecord = {
  id: string;
  yayId: string;
  displayName: string;
  email: string;
  status: string;
  createdAt: Date;
  emailVerified: boolean;
  twoStep: boolean;
  liveSessions: number;
  staffRoles: string[];
  history: { type: string; reason: string; note: string | null; issuedAt: Date; revokedAt: Date | null }[];
};

/** Finds one member by YAY ID or exact email address. Needs users.read. */
export async function lookUpMember(executor: Executor, actor: AuthContext | null, query: string): Promise<MemberRecord | null> {
  await requirePermission(executor, actor, 'users.read');
  const q = query.trim();
  if (q.length < 3) return null;
  const digits = parseYayId(q);
  const [user] = await executor
    .select({ id: users.id, yayId: users.yayId, displayName: users.displayName, email: users.email, status: users.status, createdAt: users.createdAt, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(or(digits ? eq(users.yayId, digits) : sql`false`, q.includes('@') ? eq(users.email, canonicalEmail(q)) : sql`false`))
    .limit(1);
  if (!user) return null;

  const [live] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), sql`${sessions.absoluteExpiresAt} > now()`));
  const roles = await executor
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)));
  const history = await executor
    .select({ type: enforcementRecords.type, reason: enforcementRecords.reasonCategory, note: enforcementRecords.internalNote, issuedAt: enforcementRecords.issuedAt, revokedAt: enforcementRecords.revokedAt })
    .from(enforcementRecords)
    .where(eq(enforcementRecords.userId, user.id))
    .orderBy(desc(enforcementRecords.issuedAt))
    .limit(20);

  return {
    id: user.id,
    yayId: formatYayId(user.yayId),
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    emailVerified: user.emailVerifiedAt !== null,
    twoStep: await isTwoStepEnabled(executor, user.id),
    liveSessions: live?.count ?? 0,
    staffRoles: roles.map((role) => role.roleKey).filter((role) => role !== 'member'),
    history,
  };
}

async function target(tx: Executor, actor: AuthContext, userId: string) {
  if (userId === actor.userId) throw errors.validation('sanctions.error.self');
  const [user] = await tx.select({ id: users.id, status: users.status, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.notFound('user');
  const [staff] = await tx
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt), inArray(userRoles.roleKey, ['admin', 'moderator', 'district_reviewer', 'community_manager', 'safe_space_guardian', 'support'])))
    .limit(1);
  // Staff answer to an admin, not to a colleague.
  if (staff && !(await hasPermission(tx, actor.userId, 'roles.manage'))) throw errors.forbidden('roles.manage');
  return user;
}

function cleanNote(note: string): string {
  const text = note.trim().slice(0, 500);
  if (text.length < 5) throw errors.validation('sanctions.error.note');
  return text;
}

export async function suspendMember(tx: Executor, params: { actor: AuthContext | null; userId: string; reason: SanctionReason; note: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'users.suspend');
  const user = await target(tx, actor, params.userId);
  if (user.status === 'suspended' || user.status === 'banned') throw errors.conflict('sanctions.error.already');
  const note = cleanNote(params.note);
  await tx.update(users).set({ status: 'suspended', updatedAt: new Date() }).where(eq(users.id, user.id));
  await tx.insert(enforcementRecords).values({ userId: user.id, type: 'suspension', reasonCategory: params.reason, internalNote: note, issuedBy: actor.userId });
  await revokeAllSessions(tx, user.id, 'suspended');
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.member_suspended', subjectType: 'user', subjectId: user.id, metadata: { reason: params.reason, from: user.status } });
}

export async function banMember(tx: Executor, params: { actor: AuthContext | null; userId: string; reason: SanctionReason; note: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'users.ban');
  const user = await target(tx, actor, params.userId);
  if (user.status === 'banned') throw errors.conflict('sanctions.error.already');
  const note = cleanNote(params.note);
  await tx.update(users).set({ status: 'banned', updatedAt: new Date() }).where(eq(users.id, user.id));
  await tx.insert(enforcementRecords).values({ userId: user.id, type: 'permanent_removal', reasonCategory: params.reason, internalNote: note, issuedBy: actor.userId });
  await revokeAllSessions(tx, user.id, 'banned');
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.member_banned', subjectType: 'user', subjectId: user.id, metadata: { reason: params.reason, from: user.status } });
}

/** Lifts a suspension or a ban. The account returns to active, or to awaiting email verification if it never got there. */
export async function reinstateMember(tx: Executor, params: { actor: AuthContext | null; userId: string; note: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'users.restore');
  const user = await target(tx, actor, params.userId);
  if (user.status !== 'suspended' && user.status !== 'banned') throw errors.conflict('sanctions.error.not_sanctioned');
  const note = cleanNote(params.note);
  const status = user.emailVerifiedAt ? 'active' : 'pending_verification';
  await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, user.id));
  await tx
    .update(enforcementRecords)
    .set({ revokedAt: new Date(), revokedBy: actor.userId, revokeReason: note })
    .where(and(eq(enforcementRecords.userId, user.id), isNull(enforcementRecords.revokedAt), inArray(enforcementRecords.type, ['suspension', 'permanent_removal'])));
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.member_reinstated', subjectType: 'user', subjectId: user.id, metadata: { from: user.status, to: status } });
}

/** For a member who lost both their phone and their backup codes. */
export async function resetMemberTwoStep(tx: Executor, params: { actor: AuthContext | null; userId: string; note: string }): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'users.verify_identity');
  const user = await target(tx, actor, params.userId);
  const note = cleanNote(params.note);
  const removed = await disableTwoStep(tx, { userId: user.id, actorUserId: actor.userId, by: 'operator', reason: note });
  if (!removed) throw errors.conflict('sanctions.error.no_two_step');
}

/** Signs a member out on every device, e.g. when they report their account was used by someone else. */
export async function signOutMemberEverywhere(tx: Executor, params: { actor: AuthContext | null; userId: string; note: string }): Promise<number> {
  const actor = await requirePermission(tx, params.actor, 'users.suspend');
  const user = await target(tx, actor, params.userId);
  const note = cleanNote(params.note);
  const count = await revokeAllSessions(tx, user.id, 'operator');
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.member_signed_out', subjectType: 'user', subjectId: user.id, metadata: { count, note } });
  return count;
}
