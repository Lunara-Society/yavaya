import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '@/server/db/client';
import {
  safeSpaceMembers,
  safeSpaceReports,
  safeSpaceRoomMessages,
  safeSpaceThreadMessages,
  safeSpaceThreads,
  servicesProviderProfiles,
  users,
} from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { SAFE_SPACE_RULES as R } from '@/config/business-rules';
import {
  MEMBER_PLEDGES,
  MEMBER_WORDS,
  PROFESSIONAL_PLEDGES,
  PROFESSIONAL_WORDS,
  PROFESSIONS,
  SAFE_SPACE_REPORT_CATEGORIES,
  type Profession,
  type SafeSpaceReportCategory,
} from '@/config/safe-space';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { seal, unseal } from '@/server/security/sealed-text';

/**
 * Espacio Violeta — see the schema for the promises this keeps.
 *
 * Two deliberate departures from the rest of Yavaya, both for the women here:
 *
 * - Joining, writing and reading are not audited. The audit log is read by
 *   staff, and "this account entered Espacio Violeta" is itself the kind of
 *   fact that can endanger someone. Guardians' decisions are audited, without
 *   names or content.
 * - Nothing here notifies or emails. Unread conversations are shown inside
 *   the space only.
 */

const PURPOSE = { message: 'safe-space.message', report: 'safe-space.report' } as const;

export type MemberKind = 'member' | 'professional';
export type Member = typeof safeSpaceMembers.$inferSelect;

// --- Availability and sealing ------------------------------------------------

/** At least 32 characters, and not a template expression the host left unrendered. */
function key(): string | null {
  try {
    const value = serverEnv().SAFE_SPACE_KEY?.trim();
    return value && value.length >= 32 && !value.includes('${{') ? value : null;
  } catch {
    return null;
  }
}

/** Closed without a key: these conversations are never stored readable. */
export function safeSpaceAvailable(): boolean {
  return key() !== null;
}

function requireKey(): string {
  const secret = key();
  if (!secret) throw new DomainError('integration_unconfigured', 'violeta.error.unavailable');
  return secret;
}

const sealText = (purpose: string, plain: string) => seal(requireKey(), purpose, plain);

function openText(purpose: string, sealed: string): string | null {
  try {
    return unseal(requireKey(), purpose, sealed);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // Sealed with a key that has since been rotated: shown as unreadable,
    // never as an error page in the middle of someone's conversation.
    return null;
  }
}

// --- Membership ----------------------------------------------------------------

const body = z
  .string()
  .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
  .pipe(z.string().min(1, { message: 'violeta.error.empty' }).max(R.messageMaxLength, { message: 'violeta.error.too_long' }));

export async function getMember(executor: Executor, userId: string): Promise<Member | null> {
  const [member] = await executor.select().from(safeSpaceMembers).where(eq(safeSpaceMembers.userId, userId)).limit(1);
  return member ?? null;
}

/**
 * A professional may join only while their Servicios profile carries a
 * mental-health licence a reviewer verified against the official register.
 */
export async function professionalEligible(executor: Executor, userId: string): Promise<boolean> {
  const [provider] = await executor
    .select({ status: servicesProviderProfiles.status, licence: servicesProviderProfiles.licenceStatus, categories: servicesProviderProfiles.categories })
    .from(servicesProviderProfiles)
    .where(eq(servicesProviderProfiles.userId, userId))
    .limit(1);
  return Boolean(provider && provider.status === 'active' && provider.licence === 'verified' && provider.categories.includes('mental_health'));
}

async function freshHandle(executor: Executor, kind: MemberKind): Promise<string> {
  const words: readonly string[] = kind === 'professional' ? PROFESSIONAL_WORDS : MEMBER_WORDS;
  // Two digits keep a name easy to remember; three only once two run short.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const number = attempt < 30 ? randomInt(10, 100) : randomInt(100, 1000);
    const handle = `${words[randomInt(0, words.length)]} ${number}`;
    const [taken] = await executor.select({ id: safeSpaceMembers.id }).from(safeSpaceMembers).where(eq(safeSpaceMembers.handle, handle)).limit(1);
    if (!taken) return handle;
  }
  throw errors.internal('no free safe-space handle');
}

export async function join(
  tx: Executor,
  params: { userId: string; kind: MemberKind; profession?: string | null; pledges: string[] },
): Promise<Member> {
  requireKey();
  const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status === 'pending_verification') throw new DomainError('forbidden', 'violeta.error.verify_email');
  if (user.status !== 'active') throw new DomainError('forbidden', 'violeta.error.account_restricted');

  const existing = await getMember(tx, params.userId);
  if (existing?.status === 'banned') throw new DomainError('forbidden', 'violeta.error.banned');
  if (existing) return existing;

  const required: readonly string[] = params.kind === 'professional' ? PROFESSIONAL_PLEDGES : MEMBER_PLEDGES;
  if (!required.every((pledge) => params.pledges.includes(pledge))) throw errors.validation('violeta.error.pledges');

  let profession: Profession | null = null;
  if (params.kind === 'professional') {
    if (!(PROFESSIONS as readonly string[]).includes(params.profession ?? '')) throw errors.validation('violeta.error.profession');
    if (!(await professionalEligible(tx, params.userId))) throw new DomainError('forbidden', 'violeta.error.not_eligible');
    profession = params.profession as Profession;
  }
  const [member] = await tx
    .insert(safeSpaceMembers)
    .values({ userId: params.userId, kind: params.kind, profession, handle: await freshHandle(tx, params.kind), lastSeenAt: new Date() })
    .returning();
  return member!;
}

/**
 * Who is acting here, checked on every request: a member who was banned, or
 * a professional whose licence was withdrawn, stops at once.
 */
export async function requireMember(executor: Executor, userId: string): Promise<Member> {
  requireKey();
  const member = await getMember(executor, userId);
  if (!member) throw new DomainError('forbidden', 'violeta.error.not_member');
  if (member.status === 'banned') throw new DomainError('forbidden', 'violeta.error.banned');
  if (member.kind === 'professional' && !(await professionalEligible(executor, userId))) {
    throw new DomainError('forbidden', 'violeta.error.licence_withdrawn');
  }
  return member;
}

export async function touchPresence(tx: Executor, memberId: string, now = new Date()): Promise<void> {
  await tx.update(safeSpaceMembers).set({ lastSeenAt: now }).where(eq(safeSpaceMembers.id, memberId));
}

export async function setPresenceVisible(tx: Executor, params: { memberId: string; visible: boolean }): Promise<void> {
  await tx.update(safeSpaceMembers).set({ showPresence: params.visible }).where(eq(safeSpaceMembers.id, params.memberId));
}

/** A new name, for a woman who feels recognised. Conversations stay; others see the new name. */
export async function changeHandle(tx: Executor, params: { memberId: string; now?: Date }): Promise<string> {
  const now = params.now ?? new Date();
  const [member] = await tx.select().from(safeSpaceMembers).where(eq(safeSpaceMembers.id, params.memberId)).limit(1).for('update');
  if (!member) throw errors.notFound('safe_space_member');
  const since = member.handleChangedAt ?? member.createdAt;
  if (member.handleChangedAt && now.getTime() - since.getTime() < R.handleChangeCooldownDays * 86_400_000) {
    throw errors.conflict('violeta.error.handle_cooldown');
  }
  const handle = await freshHandle(tx, member.kind);
  await tx.update(safeSpaceMembers).set({ handle, handleChangedAt: now }).where(eq(safeSpaceMembers.id, member.id));
  return handle;
}

/**
 * Leaving erases: her messages, her conversations (for both people — a
 * private conversation exists only between two), and her membership.
 * A ban is not erased, or leaving would be the way around it.
 */
export async function leave(tx: Executor, params: { memberId: string }): Promise<void> {
  const [member] = await tx.select({ status: safeSpaceMembers.status }).from(safeSpaceMembers).where(eq(safeSpaceMembers.id, params.memberId)).limit(1);
  if (!member) return;
  if (member.status === 'banned') throw new DomainError('forbidden', 'violeta.error.banned');
  await tx.delete(safeSpaceMembers).where(eq(safeSpaceMembers.id, params.memberId));
}

// --- Presence -------------------------------------------------------------------

export type PresenceEntry = { id: string; handle: string; kind: MemberKind; profession: string | null; online: boolean };

function onlineSince(now: Date): Date {
  return new Date(now.getTime() - R.onlineWindowSeconds * 1000);
}

/** Everyone visibly here now, professionals first. Hidden members are not counted or shown. */
export async function whoIsHere(executor: Executor, now = new Date()): Promise<PresenceEntry[]> {
  const rows = await executor
    .select({ id: safeSpaceMembers.id, handle: safeSpaceMembers.handle, kind: safeSpaceMembers.kind, profession: safeSpaceMembers.profession })
    .from(safeSpaceMembers)
    .where(and(eq(safeSpaceMembers.status, 'active'), eq(safeSpaceMembers.showPresence, true), gt(safeSpaceMembers.lastSeenAt, onlineSince(now))))
    .orderBy(desc(safeSpaceMembers.kind), asc(safeSpaceMembers.handle))
    .limit(100);
  return rows.map((row) => ({ ...row, online: true }));
}

/** Every professional in the space, with whether they are here now. */
export async function professionals(executor: Executor, now = new Date()): Promise<PresenceEntry[]> {
  const rows = await executor
    .select({ id: safeSpaceMembers.id, handle: safeSpaceMembers.handle, kind: safeSpaceMembers.kind, profession: safeSpaceMembers.profession, lastSeenAt: safeSpaceMembers.lastSeenAt, showPresence: safeSpaceMembers.showPresence })
    .from(safeSpaceMembers)
    .where(and(eq(safeSpaceMembers.status, 'active'), eq(safeSpaceMembers.kind, 'professional')))
    .orderBy(desc(safeSpaceMembers.lastSeenAt))
    .limit(100);
  const since = onlineSince(now);
  return rows.map((row) => ({ id: row.id, handle: row.handle, kind: row.kind, profession: row.profession, online: row.showPresence && Boolean(row.lastSeenAt && row.lastSeenAt > since) }));
}

// --- The shared room ---------------------------------------------------------------

export type MessageView = {
  id: string;
  authorId: string;
  handle: string;
  kind: MemberKind;
  profession: string | null;
  text: string | null;
  createdAt: Date;
  mine: boolean;
  /** She has a private conversation with this person: "habló contigo antes". */
  talkedBefore: boolean;
};

export async function postRoomMessage(tx: Executor, params: { memberId: string; text: string }): Promise<string> {
  const parsed = body.safeParse(params.text);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]?.message ?? 'violeta.error.empty');
  const [row] = await tx.insert(safeSpaceRoomMessages).values({ authorMemberId: params.memberId, bodySealed: sealText(PURPOSE.message, parsed.data) }).returning({ id: safeSpaceRoomMessages.id });
  return row!.id;
}

async function partnersOf(executor: Executor, memberId: string): Promise<Set<string>> {
  const rows = await executor
    .select({ a: safeSpaceThreads.memberA, b: safeSpaceThreads.memberB })
    .from(safeSpaceThreads)
    .where(or(eq(safeSpaceThreads.memberA, memberId), eq(safeSpaceThreads.memberB, memberId)));
  return new Set(rows.map((row) => (row.a === memberId ? row.b : row.a)));
}

/** The latest messages, oldest first. */
export async function roomMessages(executor: Executor, viewer: Member): Promise<MessageView[]> {
  const rows = await executor
    .select({ id: safeSpaceRoomMessages.id, authorId: safeSpaceRoomMessages.authorMemberId, sealed: safeSpaceRoomMessages.bodySealed, createdAt: safeSpaceRoomMessages.createdAt, handle: safeSpaceMembers.handle, kind: safeSpaceMembers.kind, profession: safeSpaceMembers.profession })
    .from(safeSpaceRoomMessages)
    .innerJoin(safeSpaceMembers, eq(safeSpaceMembers.id, safeSpaceRoomMessages.authorMemberId))
    .where(eq(safeSpaceMembers.status, 'active'))
    .orderBy(desc(safeSpaceRoomMessages.createdAt))
    .limit(R.roomPageSize);
  const partners = await partnersOf(executor, viewer.id);
  return rows.reverse().map((row) => ({
    id: row.id,
    authorId: row.authorId,
    handle: row.handle,
    kind: row.kind,
    profession: row.profession,
    text: openText(PURPOSE.message, row.sealed),
    createdAt: row.createdAt,
    mine: row.authorId === viewer.id,
    talkedBefore: partners.has(row.authorId),
  }));
}

export async function deleteOwnRoomMessage(tx: Executor, params: { memberId: string; messageId: string }): Promise<void> {
  await tx.delete(safeSpaceRoomMessages).where(and(eq(safeSpaceRoomMessages.id, params.messageId), eq(safeSpaceRoomMessages.authorMemberId, params.memberId)));
}

// --- Private conversations ---------------------------------------------------------

const pair = (x: string, y: string) => (x < y ? { memberA: x, memberB: y } : { memberA: y, memberB: x });

/**
 * Women start private conversations; professionals answer them. A
 * professional cannot write first to a woman who did not ask — that is the
 * protection for her, and for the professional against being accused of it.
 */
export async function startThread(tx: Executor, params: { member: Member; otherMemberId: string }): Promise<string> {
  if (params.member.kind === 'professional') throw new DomainError('forbidden', 'violeta.error.professional_first');
  if (params.otherMemberId === params.member.id) throw errors.validation('violeta.error.self');
  const [other] = await tx.select({ status: safeSpaceMembers.status }).from(safeSpaceMembers).where(eq(safeSpaceMembers.id, params.otherMemberId)).limit(1);
  if (!other || other.status !== 'active') throw errors.notFound('safe_space_member');
  const ids = pair(params.member.id, params.otherMemberId);
  const [existing] = await tx.select().from(safeSpaceThreads).where(and(eq(safeSpaceThreads.memberA, ids.memberA), eq(safeSpaceThreads.memberB, ids.memberB))).limit(1);
  if (existing) return existing.id;
  const [thread] = await tx.insert(safeSpaceThreads).values({ ...ids, startedBy: params.member.id }).returning({ id: safeSpaceThreads.id });
  return thread!.id;
}

export type ThreadSummary = { id: string; other: PresenceEntry; lastMessageAt: Date | null; unread: boolean; blocked: boolean; blockedByMe: boolean };

export async function myThreads(executor: Executor, viewer: Member, now = new Date()): Promise<ThreadSummary[]> {
  const threads = await executor
    .select()
    .from(safeSpaceThreads)
    .where(or(eq(safeSpaceThreads.memberA, viewer.id), eq(safeSpaceThreads.memberB, viewer.id)))
    .orderBy(sql`${safeSpaceThreads.lastMessageAt} desc nulls last`)
    .limit(100);
  if (threads.length === 0) return [];
  const otherIds = threads.map((t) => (t.memberA === viewer.id ? t.memberB : t.memberA));
  const others = await executor.select().from(safeSpaceMembers).where(inArray(safeSpaceMembers.id, otherIds));
  const byId = new Map(others.map((o) => [o.id, o]));
  const since = onlineSince(now);
  return threads.flatMap((thread) => {
    const other = byId.get(thread.memberA === viewer.id ? thread.memberB : thread.memberA);
    if (!other) return [];
    const readAt = thread.memberA === viewer.id ? thread.aReadAt : thread.bReadAt;
    return [
      {
        id: thread.id,
        other: { id: other.id, handle: other.handle, kind: other.kind, profession: other.profession, online: other.status === 'active' && other.showPresence && Boolean(other.lastSeenAt && other.lastSeenAt > since) },
        lastMessageAt: thread.lastMessageAt,
        unread: Boolean(thread.lastMessageAt && (!readAt || readAt < thread.lastMessageAt)),
        blocked: thread.blockedBy !== null,
        blockedByMe: thread.blockedBy === viewer.id,
      },
    ];
  });
}

export async function unreadThreadCount(executor: Executor, viewer: Member): Promise<number> {
  return (await myThreads(executor, viewer)).filter((t) => t.unread && !t.blocked).length;
}

async function threadFor(executor: Executor, viewer: Member, threadId: string) {
  const [thread] = await executor.select().from(safeSpaceThreads).where(eq(safeSpaceThreads.id, threadId)).limit(1);
  // Not a participant reads the same as not existing: no hint that it does.
  if (!thread || (thread.memberA !== viewer.id && thread.memberB !== viewer.id)) throw errors.notFound('safe_space_thread');
  return thread;
}

export async function getThread(executor: Executor, viewer: Member, threadId: string, now = new Date()) {
  const thread = await threadFor(executor, viewer, threadId);
  const summary = (await myThreads(executor, viewer, now)).find((t) => t.id === thread.id)!;
  const rows = await executor
    .select({ id: safeSpaceThreadMessages.id, authorId: safeSpaceThreadMessages.authorMemberId, sealed: safeSpaceThreadMessages.bodySealed, createdAt: safeSpaceThreadMessages.createdAt })
    .from(safeSpaceThreadMessages)
    .where(eq(safeSpaceThreadMessages.threadId, thread.id))
    .orderBy(desc(safeSpaceThreadMessages.createdAt))
    .limit(R.threadPageSize);
  const messages: MessageView[] = rows.reverse().map((row) => {
    const mine = row.authorId === viewer.id;
    return {
      id: row.id,
      authorId: row.authorId,
      handle: mine ? viewer.handle : summary.other.handle,
      kind: mine ? viewer.kind : summary.other.kind,
      profession: mine ? viewer.profession : summary.other.profession,
      text: openText(PURPOSE.message, row.sealed),
      createdAt: row.createdAt,
      mine,
      talkedBefore: true,
    };
  });
  return { ...summary, messages };
}

export async function markThreadRead(tx: Executor, params: { viewer: Member; threadId: string; now?: Date }): Promise<void> {
  const thread = await threadFor(tx, params.viewer, params.threadId);
  const now = params.now ?? new Date();
  await tx
    .update(safeSpaceThreads)
    .set(thread.memberA === params.viewer.id ? { aReadAt: now } : { bReadAt: now })
    .where(eq(safeSpaceThreads.id, thread.id));
}

export async function sendThreadMessage(tx: Executor, params: { viewer: Member; threadId: string; text: string; now?: Date }): Promise<string> {
  const thread = await threadFor(tx, params.viewer, params.threadId);
  if (thread.blockedBy) throw errors.conflict('violeta.error.blocked');
  const parsed = body.safeParse(params.text);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]?.message ?? 'violeta.error.empty');
  const now = params.now ?? new Date();
  const [row] = await tx
    .insert(safeSpaceThreadMessages)
    .values({ threadId: thread.id, authorMemberId: params.viewer.id, bodySealed: sealText(PURPOSE.message, parsed.data), createdAt: now })
    .returning({ id: safeSpaceThreadMessages.id });
  await tx
    .update(safeSpaceThreads)
    .set({ lastMessageAt: now, ...(thread.memberA === params.viewer.id ? { aReadAt: now } : { bReadAt: now }) })
    .where(eq(safeSpaceThreads.id, thread.id));
  return row!.id;
}

export async function deleteOwnThreadMessage(tx: Executor, params: { viewer: Member; messageId: string }): Promise<void> {
  await tx.delete(safeSpaceThreadMessages).where(and(eq(safeSpaceThreadMessages.id, params.messageId), eq(safeSpaceThreadMessages.authorMemberId, params.viewer.id)));
}

/** Either person can close the door; only the one who closed it can open it again. */
export async function setThreadBlocked(tx: Executor, params: { viewer: Member; threadId: string; blocked: boolean }): Promise<void> {
  const thread = await threadFor(tx, params.viewer, params.threadId);
  if (params.blocked) {
    if (!thread.blockedBy) await tx.update(safeSpaceThreads).set({ blockedBy: params.viewer.id }).where(eq(safeSpaceThreads.id, thread.id));
    return;
  }
  if (thread.blockedBy === params.viewer.id) await tx.update(safeSpaceThreads).set({ blockedBy: null }).where(eq(safeSpaceThreads.id, thread.id));
}

// --- Reports and guardians ------------------------------------------------------------

export const REPORT_DECISIONS = ['dismiss', 'remove', 'ban'] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export async function reportMessage(
  tx: Executor,
  params: { viewer: Member; source: 'room' | 'thread'; messageId: string; category: string; note: string | null },
): Promise<{ duplicate: boolean }> {
  if (!(SAFE_SPACE_REPORT_CATEGORIES as readonly string[]).includes(params.category)) throw errors.validation('violeta.report.error.category');
  let authorId: string;
  let sealed: string;
  if (params.source === 'room') {
    const [message] = await tx.select().from(safeSpaceRoomMessages).where(eq(safeSpaceRoomMessages.id, params.messageId)).limit(1);
    if (!message) throw errors.notFound('safe_space_message');
    authorId = message.authorMemberId;
    sealed = message.bodySealed;
  } else {
    const [message] = await tx.select().from(safeSpaceThreadMessages).where(eq(safeSpaceThreadMessages.id, params.messageId)).limit(1);
    if (!message) throw errors.notFound('safe_space_message');
    await threadFor(tx, params.viewer, message.threadId);
    authorId = message.authorMemberId;
    sealed = message.bodySealed;
  }
  if (authorId === params.viewer.id) throw errors.validation('violeta.report.error.own');
  const text = openText(PURPOSE.message, sealed) ?? '';
  const note = params.note?.trim().slice(0, R.reportNoteMaxLength) || null;
  const inserted = await tx
    .insert(safeSpaceReports)
    .values({
      reporterMemberId: params.viewer.id,
      reportedMemberId: authorId,
      source: params.source,
      messageId: params.messageId,
      snapshotSealed: sealText(PURPOSE.report, text),
      category: params.category as SafeSpaceReportCategory,
      noteSealed: note ? sealText(PURPOSE.report, note) : null,
    })
    .onConflictDoNothing()
    .returning({ id: safeSpaceReports.id });
  return { duplicate: inserted.length === 0 };
}

export type ReportView = {
  id: string;
  source: string;
  category: string;
  createdAt: Date;
  text: string | null;
  note: string | null;
  reportedHandle: string;
  reportedKind: MemberKind;
  reportedStatus: string;
  /** Other reports against the same person, decided or not. */
  priorReports: number;
};

export async function reviewQueue(executor: Executor, actor: AuthContext): Promise<ReportView[]> {
  await requirePermission(executor, actor, 'safe_space.review');
  const rows = await executor
    .select({ report: safeSpaceReports, handle: safeSpaceMembers.handle, kind: safeSpaceMembers.kind, status: safeSpaceMembers.status })
    .from(safeSpaceReports)
    .innerJoin(safeSpaceMembers, eq(safeSpaceMembers.id, safeSpaceReports.reportedMemberId))
    .where(eq(safeSpaceReports.status, 'open'))
    .orderBy(asc(safeSpaceReports.createdAt))
    .limit(100);
  const counts = rows.length
    ? await executor
        .select({ id: safeSpaceReports.reportedMemberId, n: sql<number>`count(*)::int` })
        .from(safeSpaceReports)
        .where(inArray(safeSpaceReports.reportedMemberId, rows.map((r) => r.report.reportedMemberId)))
        .groupBy(safeSpaceReports.reportedMemberId)
    : [];
  const countOf = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map(({ report, handle, kind, status }) => ({
    id: report.id,
    source: report.source,
    category: report.category,
    createdAt: report.createdAt,
    text: openText(PURPOSE.report, report.snapshotSealed),
    note: report.noteSealed ? openText(PURPOSE.report, report.noteSealed) : null,
    reportedHandle: handle,
    reportedKind: kind,
    reportedStatus: status,
    priorReports: (countOf.get(report.reportedMemberId) ?? 1) - 1,
  }));
}

/**
 * A guardian decides a report. Removing deletes the message; banning also
 * deletes everything the person wrote in the shared room and keeps them out.
 * Their private conversations are closed, so the other person is not left
 * talking to someone who was banned.
 */
export async function resolveReport(
  tx: Executor,
  params: { actor: AuthContext; reportId: string; decision: ReportDecision; now?: Date },
): Promise<void> {
  const actor = await requirePermission(tx, params.actor, 'safe_space.review');
  const [report] = await tx.select().from(safeSpaceReports).where(eq(safeSpaceReports.id, params.reportId)).limit(1).for('update');
  if (!report) throw errors.notFound('safe_space_report');
  if (report.status !== 'open') throw errors.conflict('violeta.error.report_closed');
  const [reported] = await tx.select({ userId: safeSpaceMembers.userId }).from(safeSpaceMembers).where(eq(safeSpaceMembers.id, report.reportedMemberId)).limit(1);
  if (reported?.userId === actor.userId) throw errors.forbidden('safe_space.review');
  const now = params.now ?? new Date();

  if ((params.decision === 'remove' || params.decision === 'ban') && report.messageId) {
    if (report.source === 'room') await tx.delete(safeSpaceRoomMessages).where(eq(safeSpaceRoomMessages.id, report.messageId));
    else await tx.delete(safeSpaceThreadMessages).where(eq(safeSpaceThreadMessages.id, report.messageId));
  }
  if (params.decision === 'ban') {
    await tx.update(safeSpaceMembers).set({ status: 'banned', showPresence: false }).where(eq(safeSpaceMembers.id, report.reportedMemberId));
    await tx.delete(safeSpaceRoomMessages).where(eq(safeSpaceRoomMessages.authorMemberId, report.reportedMemberId));
    await tx
      .update(safeSpaceThreads)
      .set({ blockedBy: report.reportedMemberId })
      .where(and(or(eq(safeSpaceThreads.memberA, report.reportedMemberId), eq(safeSpaceThreads.memberB, report.reportedMemberId)), sql`${safeSpaceThreads.blockedBy} is null`));
    // Every open report about the same person is settled by the ban.
    await tx
      .update(safeSpaceReports)
      .set({ status: 'banned', decidedBy: actor.userId, decidedAt: now })
      .where(and(eq(safeSpaceReports.reportedMemberId, report.reportedMemberId), eq(safeSpaceReports.status, 'open')));
  }
  const status = params.decision === 'dismiss' ? 'dismissed' : params.decision === 'remove' ? 'removed' : 'banned';
  await tx.update(safeSpaceReports).set({ status, decidedBy: actor.userId, decidedAt: now }).where(eq(safeSpaceReports.id, report.id));
  // No handle, no member id, no content: the decision, and that it happened.
  await recordAudit(tx, { actorType: 'admin', actorUserId: actor.userId, action: `safe_space.report_${params.decision}`, subjectType: 'safe_space_report', subjectId: report.id, metadata: { category: report.category } });
}

export async function openReportCount(executor: Executor): Promise<number> {
  const [row] = await executor.select({ n: sql<number>`count(*)::int` }).from(safeSpaceReports).where(eq(safeSpaceReports.status, 'open'));
  return row?.n ?? 0;
}

// --- Forgetting -----------------------------------------------------------------------

/** Deletes what has outlived its purpose. Run by the scheduler; needs no key. */
export async function purgeSafeSpace(database: Database, now = new Date()): Promise<{ room: number; thread: number; reports: number; threads: number }> {
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  return database.transaction(async (tx) => {
    const room = await tx.delete(safeSpaceRoomMessages).where(lt(safeSpaceRoomMessages.createdAt, days(R.roomRetentionDays))).returning({ id: safeSpaceRoomMessages.id });
    const thread = await tx.delete(safeSpaceThreadMessages).where(lt(safeSpaceThreadMessages.createdAt, days(R.threadRetentionDays))).returning({ id: safeSpaceThreadMessages.id });
    const reports = await tx
      .delete(safeSpaceReports)
      .where(and(ne(safeSpaceReports.status, 'open'), lt(safeSpaceReports.decidedAt, days(R.reportRetentionDays))))
      .returning({ id: safeSpaceReports.id });
    const threads = await tx
      .delete(safeSpaceThreads)
      .where(
        and(
          // A raw comparison needs the timestamp as text; the driver will not bind a Date here.
          sql`coalesce(${safeSpaceThreads.lastMessageAt}, ${safeSpaceThreads.createdAt}) < ${days(R.threadRetentionDays).toISOString()}::timestamptz`,
          sql`not exists (select 1 from ${safeSpaceThreadMessages} m where m.thread_id = ${safeSpaceThreads.id})`,
        ),
      )
      .returning({ id: safeSpaceThreads.id });
    return { room: room.length, thread: thread.length, reports: reports.length, threads: threads.length };
  });
}
