import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, locations, sanctuaryChurches, tokenLedger, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import {
  churchInputSchema,
  devotionalInputSchema,
  followedChurches,
  getChurch,
  getDevotional,
  listChurches,
  listDevotionals,
  localDate,
  nextService,
  normalizeStreamUrl,
  publishDevotional,
  registerChurch,
  removeDevotional,
  reportChurch,
  resolveSanctuaryTicket,
  reviewChurch,
  reviewQueue,
  toggleFollow,
  updateChurch,
} from '@/server/domains/sanctuary/service';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'sanctuary-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;
let placeCode: string;
let timezone: string;

async function member(status: 'active' | 'pending_verification' = 'active') {
  const { userId } = await register(
    db(),
    { email: `s-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Pastora Prueba', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status }).where(eq(users.id, userId));
  return userId;
}

async function reviewer() {
  const userId = await member();
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'moderator', grantedBy: null }));
  return userId;
}

const church = (overrides: Record<string, unknown> = {}) =>
  churchInputSchema.parse({
    name: 'Iglesia Luz del Valle',
    denomination: 'Evangélica',
    description: 'Una congregación pequeña y familiar. Todos son bienvenidos a nuestros cultos.',
    locationId: placeId,
    address: '3a avenida 5-20, zona 1',
    whatsapp: '+502 5555 1234',
    streamUrl: 'https://www.youtube.com/@luzdelvalle',
    ...overrides,
  });
const services = [
  { weekday: 0, startTime: '09:00', title: 'Culto dominical' },
  { weekday: 3, startTime: '19:00', title: 'Oración de miércoles' },
];
const word = (overrides: Record<string, unknown> = {}) =>
  devotionalInputSchema.parse({
    forDate: localDate(timezone),
    title: 'El Señor es mi pastor',
    scripture: 'Salmo 23:1-4',
    body: 'Hoy recordamos que no caminamos solos. Que este día encuentres descanso y fuerza.',
    ...overrides,
  });

async function approvedChurch(owner: string) {
  const id = await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church(), services }));
  const rev = await reviewer();
  await db().transaction((tx) => reviewChurch(tx, { actor: { userId: rev, status: 'active' }, churchId: id, decision: 'approve', note: null }));
  return { id, rev };
}

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id, code: locations.code }).from(locations).where(eq(locations.level, 'city')).orderBy(locations.code).limit(1);
  placeId = place!.id;
  placeCode = place!.code;
  const zones = await db().select({ tz: locations.timezone }).from(locations).where(eq(locations.level, 'country'));
  timezone = zones.find((z) => z.tz)?.tz ?? 'UTC';
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('input rules', () => {
  it('accepts only https broadcast links', () => {
    expect(normalizeStreamUrl('https://www.youtube.com/@iglesia')).toBe('https://www.youtube.com/@iglesia');
    expect(normalizeStreamUrl('')).toBeNull();
    expect(normalizeStreamUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeStreamUrl('http://example.com')).toBeUndefined();
    expect(churchInputSchema.safeParse({ ...church(), whatsapp: '', streamUrl: 'ftp://x.y' }).success).toBe(false);
  });

  it('finds the next service in the church own time', () => {
    // Wednesday 2026-09-30 20:00 UTC is 14:00 in UTC-6.
    const now = new Date('2026-09-30T20:00:00Z');
    const next = nextService(services, 'America/Guatemala', now);
    expect(next).toMatchObject({ weekday: 3, startTime: '19:00', inDays: 0 });
    const later = nextService(services, 'America/Guatemala', new Date('2026-10-01T03:00:00Z')); // 21:00 Wednesday
    expect(later).toMatchObject({ weekday: 0, inDays: 4 });
  });
});

describe('registering and reviewing a church', () => {
  it('is invisible until a reviewer approves it, and free', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church(), services }));

    expect(await listChurches(db(), { locale: 'es' })).toHaveLength(0);
    expect(await getChurch(db(), { churchId: id, viewerId: null, locale: 'es' })).toBeNull();
    expect((await getChurch(db(), { churchId: id, viewerId: owner, locale: 'es' }))?.status).toBe('pending');

    const rev = await reviewer();
    const queue = await reviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    expect(queue.pending.map((c) => c.id)).toEqual([id]);
    await db().transaction((tx) => reviewChurch(tx, { actor: { userId: rev, status: 'active' }, churchId: id, decision: 'approve', note: null }));

    const listed = await listChurches(db(), { locale: 'es', placeCode });
    expect(listed.map((c) => c.id)).toEqual([id]);
    const detail = await getChurch(db(), { churchId: id, viewerId: null, locale: 'es' });
    expect(detail?.services).toHaveLength(2);
    expect(detail?.next).not.toBeNull();

    const charges = await db().select().from(tokenLedger).where(eq(tokenLedger.relatedId, id));
    expect(charges).toHaveLength(0);
    const audits = await db().select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.subjectId, id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['sanctuary.church_registered', 'sanctuary.church_approved']));
  });

  it('refuses unverified members, other people reviewing, and owners reviewing themselves', async () => {
    const pending = await member('pending_verification');
    await expect(db().transaction((tx) => registerChurch(tx, { ownerUserId: pending, input: church(), services }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.verify_email' });

    const owner = await reviewer();
    const id = await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church(), services }));
    await expect(
      db().transaction((tx) => reviewChurch(tx, { actor: { userId: owner, status: 'active' }, churchId: id, decision: 'approve', note: null })),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const nobody = await member();
    await expect(
      db().transaction((tx) => reviewChurch(tx, { actor: { userId: nobody, status: 'active' }, churchId: id, decision: 'approve', note: null })),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('needs a reason to reject, and shows that reason only to the owner', async () => {
    const owner = await member();
    const id = await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church(), services }));
    const rev = await reviewer();
    const actor = { userId: rev, status: 'active' };
    await expect(db().transaction((tx) => reviewChurch(tx, { actor, churchId: id, decision: 'reject', note: null }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.review_note' });
    await db().transaction((tx) => reviewChurch(tx, { actor, churchId: id, decision: 'reject', note: 'Falta una dirección que podamos confirmar.' }));
    expect((await getChurch(db(), { churchId: id, viewerId: owner, locale: 'es' }))?.reviewNote).toBe('Falta una dirección que podamos confirmar.');
    expect((await getChurch(db(), { churchId: id, viewerId: rev, locale: 'es' }))?.reviewNote).toBeNull();

    // Correcting a rejected church sends it back to the queue.
    await db().transaction((tx) => updateChurch(tx, { actorUserId: owner, churchId: id, input: church({ address: '4a calle 2-10' }), services }));
    const [row] = await db().select({ status: sanctuaryChurches.status }).from(sanctuaryChurches).where(eq(sanctuaryChurches.id, id));
    expect(row?.status).toBe('pending');
  });

  it('sends an approved church back to review when what identifies it changes', async () => {
    const owner = await member();
    const { id } = await approvedChurch(owner);

    // Service times and the description change freely.
    const same = await db().transaction((tx) => updateChurch(tx, { actorUserId: owner, churchId: id, input: church({ description: 'Una congregación pequeña y familiar. Ahora también con escuela dominical.' }), services: [services[0]!] }));
    expect(same.reReview).toBe(false);
    expect((await getChurch(db(), { churchId: id, viewerId: null, locale: 'es' }))?.services).toHaveLength(1);

    const changed = await db().transaction((tx) => updateChurch(tx, { actorUserId: owner, churchId: id, input: church({ streamUrl: 'https://example.org/live' }), services }));
    expect(changed.reReview).toBe(true);
    expect(await getChurch(db(), { churchId: id, viewerId: null, locale: 'es' })).toBeNull();
  });

  it('limits how many churches one member registers', async () => {
    const owner = await member();
    for (let i = 0; i < SANCTUARY_RULES.maxChurchesPerOwner; i += 1) {
      await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church({ name: `Iglesia número ${i}` }), services: [] }));
    }
    await expect(db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church(), services: [] }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.church_limit' });
  });
});

describe('daily prayer and guidance', () => {
  it('is published only by an approved church, and appears on its day', async () => {
    const owner = await member();
    const pendingId = await db().transaction((tx) => registerChurch(tx, { ownerUserId: owner, input: church({ name: 'Iglesia en revisión' }), services }));
    await expect(db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: pendingId, input: word() }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.not_approved' });

    const { id } = await approvedChurch(owner);
    const today = localDate(timezone);
    const todayId = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word() }));
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const aheadId = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word({ forDate: tomorrow.toISOString().slice(0, 10), title: 'Para mañana' }) }));

    const feed = await listDevotionals(db(), { locale: 'es' });
    expect(feed.map((d) => d.id)).toEqual([todayId]);
    expect(feed[0]).toMatchObject({ isToday: true, scripture: 'Salmo 23:1-4', church: { id } });
    expect(await getDevotional(db(), { id: aheadId, locale: 'es' })).toBeNull();

    // Another member cannot publish in this church's name.
    const stranger = await member();
    await expect(db().transaction((tx) => publishDevotional(tx, { actorUserId: stranger, churchId: id, input: word() }))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps to the date window and the daily limit', async () => {
    const owner = await member();
    const { id } = await approvedChurch(owner);
    await expect(db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word({ forDate: '2020-01-01' }) }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.date_range' });
    for (let i = 0; i < SANCTUARY_RULES.maxDevotionalsPerChurchPerDay; i += 1) {
      await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word({ title: `Palabra ${i + 1}` }) }));
    }
    await expect(db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word() }))).rejects.toMatchObject({ messageKey: 'sanctuary.error.devotional_limit' });
  });

  it('can be withdrawn by the church, removed by a moderator, but by nobody else', async () => {
    const owner = await member();
    const { id, rev } = await approvedChurch(owner);
    const first = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word() }));
    const second = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word({ title: 'Segunda palabra' }) }));
    const stranger = await member();
    await expect(db().transaction((tx) => removeDevotional(tx, { actorUserId: stranger, devotionalId: first }))).rejects.toMatchObject({ code: 'forbidden' });
    await db().transaction((tx) => removeDevotional(tx, { actorUserId: owner, devotionalId: first }));
    await db().transaction((tx) => removeDevotional(tx, { actorUserId: rev, devotionalId: second }));
    expect(await listDevotionals(db(), { locale: 'es' })).toHaveLength(0);
  });
});

describe('following and reporting', () => {
  it('lets members follow a church and see its words first', async () => {
    const owner = await member();
    const { id } = await approvedChurch(owner);
    await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word() }));
    const fan = await member();
    expect(await db().transaction((tx) => toggleFollow(tx, { userId: fan, churchId: id }))).toBe(true);
    expect((await followedChurches(db(), { userId: fan, locale: 'es' })).map((c) => c.id)).toEqual([id]);
    expect(await listDevotionals(db(), { locale: 'es', followedBy: fan })).toHaveLength(1);
    expect((await getChurch(db(), { churchId: id, viewerId: fan, locale: 'es' }))?.followedByViewer).toBe(true);
    expect(await db().transaction((tx) => toggleFollow(tx, { userId: fan, churchId: id }))).toBe(false);
  });

  it('collects reports under one ticket, and a reviewer can suspend the church', async () => {
    const owner = await member();
    const { id, rev } = await approvedChurch(owner);
    const devotionalId = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId: id, input: word() }));
    const a = await member();
    const b = await member();
    await expect(db().transaction((tx) => reportChurch(tx, { churchId: id, reporterUserId: owner, category: 'spam', description: null }))).rejects.toMatchObject({ messageKey: 'sanctuary.report.error.own' });
    const first = await db().transaction((tx) => reportChurch(tx, { churchId: id, reporterUserId: a, category: 'fraud', description: 'Pide dinero por oraciones.', devotionalId }));
    const again = await db().transaction((tx) => reportChurch(tx, { churchId: id, reporterUserId: a, category: 'fraud', description: null }));
    expect(again).toEqual({ ticketCode: first.ticketCode, duplicate: true });
    await db().transaction((tx) => reportChurch(tx, { churchId: id, reporterUserId: b, category: 'scam', description: null }));

    const queue = await reviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    expect(queue.reports).toHaveLength(1);
    expect(queue.reports[0]!.reports).toHaveLength(2);
    expect(queue.reports[0]!.reports.find((r) => r.devotionalTitle)).toBeTruthy();

    await db().transaction((tx) => resolveSanctuaryTicket(tx, { actor: { userId: rev, status: 'active' }, ticketId: queue.reports[0]!.ticketId, decision: 'suspend_church', note: 'Cobro por oraciones confirmado.' }));
    expect(await getChurch(db(), { churchId: id, viewerId: null, locale: 'es' })).toBeNull();
    expect(await listDevotionals(db(), { locale: 'es' })).toHaveLength(0);
    const [row] = await db().select({ status: sanctuaryChurches.status }).from(sanctuaryChurches).where(and(eq(sanctuaryChurches.id, id)));
    expect(row?.status).toBe('suspended');
  });
});
