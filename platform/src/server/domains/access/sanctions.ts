import 'server-only';
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { enforcementRecords, sanctionAppeals, sessions, userRoles, users } from '@/server/db/schema';
import { SANCTION_RULES } from '@/config/business-rules';
import { seal, unseal } from '@/server/auth/sealed';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/domains/audit/service';
import { disableTwoStep, isTwoStepEnabled } from '@/server/domains/identity/two-step';
import { formatYayId, parseYayId } from '@/server/domains/identity/yay-id';
import { canonicalEmail } from '@/server/domains/identity/normalize';
import { memberTimezone } from '@/server/domains/sanctuary/daily';
import { sendSanctionNotice } from '@/server/domains/notifications/email/service';
import { serverEnv } from '@/config/env';
import { isLocale } from '@/i18n/config';
import { errors } from '@/server/errors';
import { hasPermission, requirePermission, type AuthContext } from './authorize';

/**
 * Account-level sanctions and account help, for operators.
 *
 *   suspend   — users.suspend (moderators, admins). Signs the member out
 *               everywhere; they cannot sign in until it ends or an admin
 *               reinstates them.
 *   ban       — users.ban (admins). Permanent removal; the YAY ID stays
 *               reserved, so the person cannot simply come back as new.
 *   reinstate — users.restore (admins).
 *   two-step  — users.verify_identity (admins): turning off a member's
 *               two-step after checking who they are outside Yavaya.
 *
 * The policy is SANCTION_RULES: a suspension of 1, 7 or 30 days, or until an
 * admin reviews; timed ones lift themselves (`liftExpiredSuspensions`). The
 * member is told by email at every step (the caller sends the returned
 * notice after the transaction commits) and may appeal once per sanction,
 * from a signed link in that email. Someone holding a staff role can be
 * sanctioned only by an admin, and nobody can sanction themselves. Every
 * action records its reason in the audit log and, for sanctions, in the
 * member's enforcement record — in the same transaction as the change.
 */

export const SANCTION_REASONS = ['fraud', 'scam', 'financial_deception', 'animal_abuse', 'fraudulent_fundraising', 'multi_account_abuse', 'criminal_misuse', 'harassment', 'spam', 'other'] as const;
export type SanctionReason = (typeof SANCTION_REASONS)[number];

/**
 * What to tell the member, sent by the caller once the change has committed —
 * never from inside the transaction, so a slow mail server cannot hold it
 * open, and never for a change that rolled back.
 */
export type SanctionNotice = {
  email: string;
  locale: string;
  kind: 'suspended' | 'banned' | 'reinstated' | 'appeal_upheld';
  reason?: SanctionReason;
  /** End of a timed suspension; null means until an admin reviews. */
  until?: Date | null;
  /** The member's own time zone, so the end reads as their clock shows it. */
  timeZone?: string | null;
  /** Sealed link token for the appeal page. */
  appealToken?: string;
  /** What an admin wrote back on an appeal. */
  response?: string | null;
};

const APPEAL_PURPOSE = 'sanction-appeal';

/** The token in the notice email: which sanction, whose — signed, so it cannot be redirected, and good only for the appeal window. */
export function appealTokenFor(recordId: string, userId: string): string {
  return seal(APPEAL_PURPOSE, { r: recordId, u: userId }, SANCTION_RULES.appealWindowDays * 24 * 60 * 60);
}

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
  history: { type: string; reason: string; note: string | null; issuedAt: Date; expiresAt: Date | null; revokedAt: Date | null }[];
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
    .select({ type: enforcementRecords.type, reason: enforcementRecords.reasonCategory, note: enforcementRecords.internalNote, issuedAt: enforcementRecords.issuedAt, expiresAt: enforcementRecords.expiresAt, revokedAt: enforcementRecords.revokedAt })
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
  const [user] = await tx
    .select({ id: users.id, status: users.status, emailVerifiedAt: users.emailVerifiedAt, email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
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

/** `days`: one of SANCTION_RULES.suspensionDays, or null for "until an admin reviews". */
export async function suspendMember(
  tx: Executor,
  params: { actor: AuthContext | null; userId: string; reason: SanctionReason; note: string; days: number | null; now?: Date },
): Promise<SanctionNotice> {
  const actor = await requirePermission(tx, params.actor, 'users.suspend');
  const user = await target(tx, actor, params.userId);
  if (user.status === 'suspended' || user.status === 'banned') throw errors.conflict('sanctions.error.already');
  if (params.days !== null && !(SANCTION_RULES.suspensionDays as readonly number[]).includes(params.days)) throw errors.validation('sanctions.error.duration');
  const note = cleanNote(params.note);
  const now = params.now ?? new Date();
  const until = params.days === null ? null : new Date(now.getTime() + params.days * 24 * 60 * 60 * 1000);
  await tx.update(users).set({ status: 'suspended', updatedAt: now }).where(eq(users.id, user.id));
  const [record] = await tx
    .insert(enforcementRecords)
    .values({ userId: user.id, type: 'suspension', reasonCategory: params.reason, internalNote: note, issuedBy: actor.userId, issuedAt: now, expiresAt: until })
    .returning({ id: enforcementRecords.id });
  await revokeAllSessions(tx, user.id, 'suspended');
  await recordAudit(tx, {
    actorType: 'admin',
    actorUserId: actor.userId,
    action: 'identity.member_suspended',
    subjectType: 'user',
    subjectId: user.id,
    metadata: { reason: params.reason, from: user.status, days: params.days },
  });
  return {
    email: user.email,
    locale: user.locale,
    kind: 'suspended',
    reason: params.reason,
    until,
    timeZone: until ? await memberTimezone(tx, user.id) : null,
    appealToken: appealTokenFor(record!.id, user.id),
  };
}

export async function banMember(tx: Executor, params: { actor: AuthContext | null; userId: string; reason: SanctionReason; note: string }): Promise<SanctionNotice> {
  const actor = await requirePermission(tx, params.actor, 'users.ban');
  const user = await target(tx, actor, params.userId);
  if (user.status === 'banned') throw errors.conflict('sanctions.error.already');
  const note = cleanNote(params.note);
  await tx.update(users).set({ status: 'banned', updatedAt: new Date() }).where(eq(users.id, user.id));
  // A ban replaces a running suspension: one sanction in force, one appeal.
  await tx
    .update(enforcementRecords)
    .set({ revokedAt: new Date(), revokedBy: actor.userId, revokeReason: 'replaced by a ban' })
    .where(and(eq(enforcementRecords.userId, user.id), isNull(enforcementRecords.revokedAt), eq(enforcementRecords.type, 'suspension')));
  const [record] = await tx
    .insert(enforcementRecords)
    .values({ userId: user.id, type: 'permanent_removal', reasonCategory: params.reason, internalNote: note, issuedBy: actor.userId })
    .returning({ id: enforcementRecords.id });
  await revokeAllSessions(tx, user.id, 'banned');
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.member_banned', subjectType: 'user', subjectId: user.id, metadata: { reason: params.reason, from: user.status } });
  return { email: user.email, locale: user.locale, kind: 'banned', reason: params.reason, until: null, appealToken: appealTokenFor(record!.id, user.id) };
}

/**
 * Lifts whatever suspension or ban is in force. Shared by reinstating, an
 * upheld appeal and the clock. The account returns to active, or to awaiting
 * email verification if it never got there. An appeal still waiting on a
 * sanction that is now over is closed as 'ended', so it leaves the queue
 * instead of asking an admin to decide something already decided.
 */
async function lift(
  tx: Executor,
  user: { id: string; status: string; emailVerifiedAt: Date | null },
  by: { actorUserId: string | null; reason: string; action: string },
  now = new Date(),
): Promise<void> {
  const status = user.emailVerifiedAt ? 'active' : 'pending_verification';
  await tx.update(users).set({ status, updatedAt: now }).where(eq(users.id, user.id));
  const ended = await tx
    .update(enforcementRecords)
    .set({ revokedAt: now, revokedBy: by.actorUserId, revokeReason: by.reason })
    .where(and(eq(enforcementRecords.userId, user.id), isNull(enforcementRecords.revokedAt), inArray(enforcementRecords.type, ['suspension', 'permanent_removal'])))
    .returning({ id: enforcementRecords.id });
  if (ended.length > 0) {
    await tx
      .update(sanctionAppeals)
      .set({ decidedAt: now, decidedBy: by.actorUserId, outcome: 'ended' })
      .where(and(inArray(sanctionAppeals.enforcementRecordId, ended.map((row) => row.id)), isNull(sanctionAppeals.decidedAt)));
  }
  await recordAudit(tx, {
    actorType: by.actorUserId ? 'admin' : 'system',
    actorUserId: by.actorUserId,
    action: by.action,
    subjectType: 'user',
    subjectId: user.id,
    metadata: { from: user.status, to: status },
  });
}

/** An admin lifts a suspension or a ban. */
export async function reinstateMember(tx: Executor, params: { actor: AuthContext | null; userId: string; note: string }): Promise<SanctionNotice> {
  const actor = await requirePermission(tx, params.actor, 'users.restore');
  const user = await target(tx, actor, params.userId);
  if (user.status !== 'suspended' && user.status !== 'banned') throw errors.conflict('sanctions.error.not_sanctioned');
  const note = cleanNote(params.note);
  await lift(tx, user, { actorUserId: actor.userId, reason: note, action: 'identity.member_reinstated' });
  return { email: user.email, locale: user.locale, kind: 'reinstated' };
}

/** The clock: timed suspensions that have run out are lifted. Run by the scheduler. */
export async function liftExpiredSuspensions(executor: Executor, now = new Date()): Promise<SanctionNotice[]> {
  const expired = and(
    eq(enforcementRecords.type, 'suspension'),
    isNull(enforcementRecords.revokedAt),
    isNotNull(enforcementRecords.expiresAt),
    lte(enforcementRecords.expiresAt, now),
  );
  const due = await executor.selectDistinct({ userId: enforcementRecords.userId }).from(enforcementRecords).where(expired);
  const notices: SanctionNotice[] = [];
  for (const { userId } of due) {
    // Checked again under a row lock: an admin may have reinstated or banned
    // the member since the list was read, and a ban must not be undone by the
    // clock running out on the suspension it replaced.
    const notice = await executor.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, status: users.status, emailVerifiedAt: users.emailVerifiedAt, email: users.email, locale: users.locale })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (user?.status !== 'suspended') return null;
      const [still] = await tx.select({ id: enforcementRecords.id }).from(enforcementRecords).where(and(expired, eq(enforcementRecords.userId, userId))).limit(1);
      if (!still) return null;
      await lift(tx, user, { actorUserId: null, reason: 'suspension ended', action: 'identity.suspension_expired' }, now);
      return { email: user.email, locale: user.locale, kind: 'reinstated' as const };
    });
    if (notice) notices.push(notice);
  }
  return notices;
}

/** Emails each notice. Call after the transaction that produced them has committed. */
export async function deliverSanctionNotices(notices: SanctionNotice[]): Promise<void> {
  for (const notice of notices) {
    await sendSanctionNotice({
      to: notice.email,
      locale: isLocale(notice.locale) ? notice.locale : 'es',
      kind: notice.kind,
      reason: notice.reason,
      until: notice.until ?? null,
      timeZone: notice.timeZone ?? null,
      appealLink: notice.appealToken ? `${serverEnv().APP_URL}/apelacion?t=${encodeURIComponent(notice.appealToken)}` : null,
      response: notice.response ?? null,
    });
  }
}

// --- Appeals -----------------------------------------------------------------

export type AppealLink = {
  recordId: string;
  userId: string;
  type: 'suspension' | 'permanent_removal';
  reason: string;
  issuedAt: Date;
  until: Date | null;
  /** The sanction was lifted since: nothing left to appeal. */
  lifted: boolean;
  appealedAt: Date | null;
};

/** What the appeal link points at, or null if the link is forged, expired, or not for a suspension or ban. */
export async function readAppealLink(executor: Executor, token: string): Promise<AppealLink | null> {
  const sealed = unseal<{ r: string; u: string }>(APPEAL_PURPOSE, token);
  if (!sealed) return null;
  const [row] = await executor
    .select({
      id: enforcementRecords.id,
      userId: enforcementRecords.userId,
      type: enforcementRecords.type,
      reason: enforcementRecords.reasonCategory,
      issuedAt: enforcementRecords.issuedAt,
      expiresAt: enforcementRecords.expiresAt,
      revokedAt: enforcementRecords.revokedAt,
      appealedAt: sanctionAppeals.createdAt,
    })
    .from(enforcementRecords)
    .leftJoin(sanctionAppeals, eq(sanctionAppeals.enforcementRecordId, enforcementRecords.id))
    .where(and(eq(enforcementRecords.id, sealed.r), eq(enforcementRecords.userId, sealed.u)))
    .limit(1);
  if (!row || (row.type !== 'suspension' && row.type !== 'permanent_removal')) return null;
  return {
    recordId: row.id,
    userId: row.userId,
    type: row.type,
    reason: row.reason,
    issuedAt: row.issuedAt,
    until: row.expiresAt,
    lifted: row.revokedAt !== null,
    appealedAt: row.appealedAt,
  };
}

/** One appeal per sanction, while it is in force. */
export async function submitAppeal(tx: Executor, params: { token: string; body: string; networkHash: string | null }): Promise<'sent' | 'already' | 'lifted'> {
  const limit = await consumeRateLimit(tx, RATE_LIMITS.appeal, params.networkHash ?? 'unknown');
  if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);
  const link = await readAppealLink(tx, params.token);
  if (!link) throw errors.validation('appeal.error.link');
  if (link.lifted) return 'lifted';
  if (link.appealedAt) return 'already';
  const body = params.body.trim();
  if (body.length < SANCTION_RULES.appealMinLength || body.length > SANCTION_RULES.appealMaxLength) throw errors.validation('appeal.error.length');
  const inserted = await tx
    .insert(sanctionAppeals)
    .values({ enforcementRecordId: link.recordId, userId: link.userId, body })
    .onConflictDoNothing()
    .returning({ id: sanctionAppeals.id });
  if (inserted.length === 0) return 'already';
  await recordAudit(tx, { actorType: 'user', actorUserId: link.userId, action: 'identity.sanction_appealed', subjectType: 'user', subjectId: link.userId, metadata: { type: link.type } });
  return 'sent';
}

export type OpenAppeal = {
  id: string;
  userId: string;
  displayName: string;
  yayId: string;
  type: string;
  reason: string;
  note: string | null;
  issuedAt: Date;
  until: Date | null;
  body: string;
  createdAt: Date;
};

/** Appeals waiting for an admin, oldest first. */
export async function openAppeals(executor: Executor, actor: AuthContext | null): Promise<OpenAppeal[]> {
  await requirePermission(executor, actor, 'users.restore');
  const rows = await executor
    .select({
      id: sanctionAppeals.id,
      userId: users.id,
      displayName: users.displayName,
      yayId: users.yayId,
      type: enforcementRecords.type,
      reason: enforcementRecords.reasonCategory,
      note: enforcementRecords.internalNote,
      issuedAt: enforcementRecords.issuedAt,
      until: enforcementRecords.expiresAt,
      body: sanctionAppeals.body,
      createdAt: sanctionAppeals.createdAt,
    })
    .from(sanctionAppeals)
    .innerJoin(enforcementRecords, eq(enforcementRecords.id, sanctionAppeals.enforcementRecordId))
    .innerJoin(users, eq(users.id, sanctionAppeals.userId))
    .where(and(isNull(sanctionAppeals.decidedAt), isNull(enforcementRecords.revokedAt)))
    .orderBy(sanctionAppeals.createdAt);
  return rows.map((row) => ({ ...row, yayId: formatYayId(row.yayId) }));
}

/** An admin keeps the sanction or lifts it; either way the member hears why. */
export async function decideAppeal(
  tx: Executor,
  params: { actor: AuthContext | null; appealId: string; outcome: 'upheld' | 'lifted'; response: string },
): Promise<SanctionNotice> {
  const actor = await requirePermission(tx, params.actor, 'users.restore');
  const response = params.response.trim();
  if (response.length < 5 || response.length > SANCTION_RULES.responseMaxLength) throw errors.validation('appeal.error.response');
  const [appeal] = await tx
    .update(sanctionAppeals)
    .set({ decidedAt: new Date(), decidedBy: actor.userId, outcome: params.outcome, response })
    .where(and(eq(sanctionAppeals.id, params.appealId), isNull(sanctionAppeals.decidedAt)))
    .returning({ userId: sanctionAppeals.userId, recordId: sanctionAppeals.enforcementRecordId });
  if (!appeal) throw errors.conflict('appeal.error.decided');
  const user = await target(tx, actor, appeal.userId);
  if (params.outcome === 'lifted' && (user.status === 'suspended' || user.status === 'banned')) {
    await lift(tx, user, { actorUserId: actor.userId, reason: 'appeal upheld', action: 'identity.member_reinstated' });
  }
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: 'identity.sanction_appeal_decided', subjectType: 'user', subjectId: user.id, metadata: { outcome: params.outcome } });
  return { email: user.email, locale: user.locale, kind: params.outcome === 'lifted' ? 'reinstated' : 'appeal_upheld', response };
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
