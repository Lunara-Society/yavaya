import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, locations, safeSpaceMembers, safeSpaceReports, safeSpaceRoomMessages, safeSpaceThreadMessages, servicesProviderProfiles, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { listNotifications } from '@/server/domains/notifications/service';
import {
  changeHandle,
  getThread,
  join,
  leave,
  myThreads,
  postRoomMessage,
  purgeSafeSpace,
  reportMessage,
  requireMember,
  resolveReport,
  reviewQueue,
  roomMessages,
  sendThreadMessage,
  setThreadBlocked,
  startThread,
  touchPresence,
  whoIsHere,
  professionals,
  setPresenceVisible,
} from '@/server/domains/safe-space/service';
import { MEMBER_PLEDGES, MEMBER_WORDS, PROFESSIONAL_PLEDGES, PROFESSIONAL_WORDS } from '@/config/safe-space';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'safe-space-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function account(name = 'Persona') {
  const { userId } = await register(
    db(),
    { email: `ss-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function woman() {
  const userId = await account('Ana');
  return db().transaction((tx) => join(tx, { userId, kind: 'member', pledges: [...MEMBER_PLEDGES] }));
}

async function licensedPsychologist(licence: 'verified' | 'pending' = 'verified') {
  const userId = await account('Dra. López');
  await db().insert(servicesProviderProfiles).values({
    userId,
    headline: 'Psicóloga clínica',
    bio: 'Diez años acompañando a mujeres y parejas.',
    categories: ['mental_health'],
    locationId: placeId,
    whatsappE164: '+50588881234',
    licenceClaim: 'Psicóloga, registro 1234, MINSA',
    licenceStatus: licence,
  });
  return userId;
}

describe('Espacio Violeta', () => {
  beforeAll(async () => {
    const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
    placeId = place!.id;
  });
  beforeEach(async () => {
    await resetTransactionalData();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('gives each woman a name of this space only, from words professionals never get', async () => {
    const ana = await woman();
    expect(ana.handle).toMatch(/^\S+ \d{2,3}$/);
    expect((MEMBER_WORDS as readonly string[]).includes(ana.handle.split(' ')[0]!)).toBe(true);
    const [user] = await db().select({ yayId: users.yayId, displayName: users.displayName }).from(users).where(eq(users.id, ana.userId));
    expect(ana.handle).not.toContain(String(user!.yayId));
    expect(ana.handle).not.toContain(user!.displayName);
    // Joining again is harmless and keeps the same name.
    const again = await db().transaction((tx) => join(tx, { userId: ana.userId, kind: 'member', pledges: [...MEMBER_PLEDGES] }));
    expect(again.handle).toBe(ana.handle);
  });

  it('requires every pledge', async () => {
    const userId = await account();
    await expect(db().transaction((tx) => join(tx, { userId, kind: 'member', pledges: ['woman'] }))).rejects.toMatchObject({ messageKey: 'violeta.error.pledges' });
  });

  it('admits a professional only with a verified mental-health licence, and stops them if it is withdrawn', async () => {
    const pending = await licensedPsychologist('pending');
    await expect(
      db().transaction((tx) => join(tx, { userId: pending, kind: 'professional', profession: 'psychology', pledges: [...PROFESSIONAL_PLEDGES] })),
    ).rejects.toMatchObject({ messageKey: 'violeta.error.not_eligible' });

    const verified = await licensedPsychologist();
    const pro = await db().transaction((tx) => join(tx, { userId: verified, kind: 'professional', profession: 'psychology', pledges: [...PROFESSIONAL_PLEDGES] }));
    expect(pro.kind).toBe('professional');
    expect((PROFESSIONAL_WORDS as readonly string[]).includes(pro.handle.split(' ')[0]!)).toBe(true);

    await db().update(servicesProviderProfiles).set({ licenceStatus: 'pending' }).where(eq(servicesProviderProfiles.userId, verified));
    await expect(requireMember(db(), verified)).rejects.toMatchObject({ messageKey: 'violeta.error.licence_withdrawn' });
  });

  it('stores every message sealed, never in plain text', async () => {
    const ana = await woman();
    await db().transaction((tx) => postRoomMessage(tx, { memberId: ana.id, text: 'Mi pareja me dejó sola con el embarazo.' }));
    const [stored] = await db().select().from(safeSpaceRoomMessages);
    expect(stored!.bodySealed.startsWith('v1.')).toBe(true);
    expect(stored!.bodySealed).not.toContain('embarazo');
    const view = await roomMessages(db(), ana);
    expect(view[0]?.text).toBe('Mi pareja me dejó sola con el embarazo.');
    expect(view[0]?.mine).toBe(true);
  });

  it('keeps a private conversation between exactly two people', async () => {
    const ana = await woman();
    const lucia = await woman();
    const outsider = await woman();
    const threadId = await db().transaction((tx) => startThread(tx, { member: ana, otherMemberId: lucia.id }));
    // Starting again from the other side finds the same conversation.
    expect(await db().transaction((tx) => startThread(tx, { member: lucia, otherMemberId: ana.id }))).toBe(threadId);
    await db().transaction((tx) => sendThreadMessage(tx, { viewer: ana, threadId, text: 'Mi número es 8888-1111, escríbeme.' }));

    const forLucia = await getThread(db(), lucia, threadId);
    expect(forLucia.messages[0]?.text).toContain('8888-1111');
    expect(forLucia.other.handle).toBe(ana.handle);
    expect((await myThreads(db(), lucia))[0]?.unread).toBe(true);
    await expect(getThread(db(), outsider, threadId)).rejects.toMatchObject({ code: 'not_found' });

    // The room now remembers they talked.
    await db().transaction((tx) => postRoomMessage(tx, { memberId: ana.id, text: 'Gracias a todas.' }));
    expect((await roomMessages(db(), lucia))[0]?.talkedBefore).toBe(true);
    expect((await roomMessages(db(), outsider))[0]?.talkedBefore).toBe(false);
  });

  it('lets a woman reach a professional, never the other way round', async () => {
    const ana = await woman();
    const proUser = await licensedPsychologist();
    const pro = await db().transaction((tx) => join(tx, { userId: proUser, kind: 'professional', profession: 'psychiatry', pledges: [...PROFESSIONAL_PLEDGES] }));
    await expect(db().transaction((tx) => startThread(tx, { member: pro, otherMemberId: ana.id }))).rejects.toMatchObject({ messageKey: 'violeta.error.professional_first' });
    const threadId = await db().transaction((tx) => startThread(tx, { member: ana, otherMemberId: pro.id }));
    await db().transaction((tx) => sendThreadMessage(tx, { viewer: pro, threadId, text: 'Hola, aquí estoy. ¿Cómo te sientes hoy?' }));
    const view = await getThread(db(), ana, threadId);
    expect(view.other.kind).toBe('professional');
    expect(view.messages[0]?.kind).toBe('professional');
  });

  it('closes a conversation for both when either blocks it', async () => {
    const ana = await woman();
    const lucia = await woman();
    const threadId = await db().transaction((tx) => startThread(tx, { member: ana, otherMemberId: lucia.id }));
    await db().transaction((tx) => setThreadBlocked(tx, { viewer: lucia, threadId, blocked: true }));
    await expect(db().transaction((tx) => sendThreadMessage(tx, { viewer: ana, threadId, text: 'Hola' }))).rejects.toMatchObject({ messageKey: 'violeta.error.blocked' });
    // Only the one who closed it can open it.
    await db().transaction((tx) => setThreadBlocked(tx, { viewer: ana, threadId, blocked: false }));
    expect((await myThreads(db(), ana))[0]?.blocked).toBe(true);
    await db().transaction((tx) => setThreadBlocked(tx, { viewer: lucia, threadId, blocked: false }));
    expect((await myThreads(db(), ana))[0]?.blocked).toBe(false);
  });

  it('shows who is here, unless she chose not to be seen', async () => {
    const ana = await woman();
    const lucia = await woman();
    const proUser = await licensedPsychologist();
    const pro = await db().transaction((tx) => join(tx, { userId: proUser, kind: 'professional', profession: 'psychology', pledges: [...PROFESSIONAL_PLEDGES] }));
    const now = new Date();
    for (const m of [ana, lucia, pro]) await touchPresence(db(), m.id, now);
    await db().transaction((tx) => setPresenceVisible(tx, { memberId: lucia.id, visible: false }));
    const here = await whoIsHere(db(), now);
    expect(here.map((h) => h.id).sort()).toEqual([ana.id, pro.id].sort());
    expect(here[0]?.kind).toBe('professional');
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(await whoIsHere(db(), later)).toEqual([]);
    expect((await professionals(db(), later))[0]?.online).toBe(false);
  });

  it('lets a guardian — and only a guardian — read a report and ban, without leaving names in the audit log', async () => {
    const ana = await woman();
    const intruder = await woman();
    await db().transaction((tx) => postRoomMessage(tx, { memberId: intruder.id, text: 'Sé dónde vives.' }));
    const [message] = await db().select().from(safeSpaceRoomMessages);
    const result = await db().transaction((tx) => reportMessage(tx, { viewer: ana, source: 'room', messageId: message!.id, category: 'threat', note: 'Me da miedo.' }));
    expect(result.duplicate).toBe(false);
    expect((await db().transaction((tx) => reportMessage(tx, { viewer: ana, source: 'room', messageId: message!.id, category: 'threat', note: null }))).duplicate).toBe(true);
    await expect(db().transaction((tx) => reportMessage(tx, { viewer: intruder, source: 'room', messageId: message!.id, category: 'threat', note: null }))).rejects.toMatchObject({ messageKey: 'violeta.report.error.own' });

    const moderatorId = await account('Moderador');
    await db().transaction((tx) => grantRole(tx, { userId: moderatorId, roleKey: 'moderator', grantedBy: null }));
    await expect(reviewQueue(db(), { userId: moderatorId, status: 'active' })).rejects.toMatchObject({ code: 'forbidden' });

    const guardianId = await account('Guardiana');
    await db().transaction((tx) => grantRole(tx, { userId: guardianId, roleKey: 'safe_space_guardian', grantedBy: null }));
    const queue = await reviewQueue(db(), { userId: guardianId, status: 'active' });
    expect(queue[0]?.text).toBe('Sé dónde vives.');
    expect(queue[0]?.note).toBe('Me da miedo.');
    expect(queue[0]?.reportedHandle).toBe(intruder.handle);

    await db().transaction((tx) => resolveReport(tx, { actor: { userId: guardianId, status: 'active' }, reportId: queue[0]!.id, decision: 'ban' }));
    await expect(requireMember(db(), intruder.userId)).rejects.toMatchObject({ messageKey: 'violeta.error.banned' });
    expect(await db().select().from(safeSpaceRoomMessages)).toHaveLength(0);
    // A ban cannot be escaped by leaving and joining again.
    await expect(db().transaction((tx) => leave(tx, { memberId: intruder.id }))).rejects.toMatchObject({ messageKey: 'violeta.error.banned' });
    await expect(db().transaction((tx) => join(tx, { userId: intruder.userId, kind: 'member', pledges: [...MEMBER_PLEDGES] }))).rejects.toMatchObject({ messageKey: 'violeta.error.banned' });

    const audit = await db().select().from(auditEvents).where(eq(auditEvents.action, 'safe_space.report_ban'));
    expect(audit).toHaveLength(1);
    const logged = JSON.stringify(audit[0], (_k, v) => (typeof v === "bigint" ? String(v) : v));
    expect(logged).not.toContain(intruder.handle);
    expect(logged).not.toContain(intruder.id);
    expect(logged).not.toContain('vives');
  });

  it('never notifies or audits a woman for entering or writing', async () => {
    const ana = await woman();
    const lucia = await woman();
    const threadId = await db().transaction((tx) => startThread(tx, { member: ana, otherMemberId: lucia.id }));
    await db().transaction((tx) => sendThreadMessage(tx, { viewer: ana, threadId, text: 'Hola, ¿cómo estás?' }));
    expect(await listNotifications(db(), lucia.userId, 10)).toHaveLength(0);
    const audit = await db().select().from(auditEvents).where(sql`${auditEvents.action} like 'safe_space.%'`);
    expect(audit).toHaveLength(0);
  });

  it('gives a new name on request, but not again within the cooldown', async () => {
    const ana = await woman();
    const fresh = await db().transaction((tx) => changeHandle(tx, { memberId: ana.id }));
    expect(fresh).not.toBe(ana.handle);
    await expect(db().transaction((tx) => changeHandle(tx, { memberId: ana.id }))).rejects.toMatchObject({ messageKey: 'violeta.error.handle_cooldown' });
  });

  it('erases everything she wrote when she leaves', async () => {
    const ana = await woman();
    const lucia = await woman();
    await db().transaction((tx) => postRoomMessage(tx, { memberId: ana.id, text: 'Hola' }));
    const threadId = await db().transaction((tx) => startThread(tx, { member: ana, otherMemberId: lucia.id }));
    await db().transaction((tx) => sendThreadMessage(tx, { viewer: ana, threadId, text: 'Hola' }));
    await db().transaction((tx) => leave(tx, { memberId: ana.id }));
    expect(await db().select().from(safeSpaceMembers).where(eq(safeSpaceMembers.id, ana.id))).toHaveLength(0);
    expect(await db().select().from(safeSpaceRoomMessages)).toHaveLength(0);
    expect(await db().select().from(safeSpaceThreadMessages)).toHaveLength(0);
  });

  it('forgets old messages and decided reports', async () => {
    const ana = await woman();
    const lucia = await woman();
    await db().transaction((tx) => postRoomMessage(tx, { memberId: ana.id, text: 'Hace mucho' }));
    const [message] = await db().select().from(safeSpaceRoomMessages);
    await db().transaction((tx) => reportMessage(tx, { viewer: lucia, source: 'room', messageId: message!.id, category: 'other', note: null }));
    await db().update(safeSpaceReports).set({ status: 'dismissed', decidedAt: new Date(Date.now() - 100 * 86_400_000) });
    await db().update(safeSpaceRoomMessages).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) });
    const result = await purgeSafeSpace(db());
    expect(result).toMatchObject({ room: 1, reports: 1 });
  });
});
