import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { demoContent, locations, notificationPreferences, userProfiles, users } from '@/server/db/schema';
import { consumeVerificationCode, register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { addReply, createPost, postInputSchema, toggleSupport } from '@/server/domains/community/service';
import {
  churchInputSchema,
  devotionalInputSchema,
  localDate,
  publishDevotional,
  registerChurch,
  reviewChurch,
  toggleFollow,
  deliverScheduledWords,
} from '@/server/domains/sanctuary/service';
import { sendDailyDigests, setDigestEnabled, unsubscribeSignature, verifyUnsubscribe, type DigestDelivery } from '@/server/domains/notifications/digest';
import type { EmailMessage } from '@/server/domains/notifications/email/provider';
import { listNotifications, markAllRead, openNotification, unreadCount } from '@/server/domains/notifications/service';
import { NOTIFICATION_RULES, REPUTATION_RULE_DEFAULTS, SANCTUARY_RULES } from '@/config/business-rules';
import { getScore } from '@/server/domains/reputation/service';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'notifications-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;
let timezone: string;

async function member() {
  const { userId } = await register(
    db(),
    { email: `n-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const post = (overrides: Record<string, unknown> = {}) =>
  postInputSchema.parse({
    kind: 'help_request',
    title: 'Necesito ayuda para mudarme',
    body: 'El sábado por la mañana, dos horas, tengo que bajar muebles de un segundo piso.',
    locationId: placeId,
    anonymous: false,
    ...overrides,
  });

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
  placeId = place!.id;
  const zones = await db().select({ tz: locations.timezone }).from(locations).where(eq(locations.level, 'country'));
  timezone = zones.find((z) => z.tz)?.tz ?? 'UTC';
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('community news', () => {
  it('tells the author about a reply, but not about their own', async () => {
    const author = await member();
    const neighbour = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post() }));

    await db().transaction((tx) => addReply(tx, { postId, authorUserId: author, body: 'Gracias a todos de antemano.' }));
    expect(await unreadCount(db(), author)).toBe(0);

    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Yo puedo a las diez.' }));
    const [news] = await listNotifications(db(), author);
    expect(news).toMatchObject({
      category: 'community',
      titleKey: 'notify.community.reply',
      params: { title: 'Necesito ayuda para mudarme' },
      href: `/community/${postId}#replies`,
      read: false,
    });
    expect(await listNotifications(db(), neighbour)).toHaveLength(0);
  });

  it('collapses a day of support into one message', async () => {
    const author = await member();
    const prayer = post({ kind: 'prayer', locationId: null, title: 'Oren por mi madre' });
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: prayer }));
    for (let i = 0; i < 3; i += 1) {
      const supporter = await member();
      await db().transaction((tx) => toggleSupport(tx, { postId, userId: supporter }));
    }
    const news = await listNotifications(db(), author);
    expect(news.map((n) => n.titleKey)).toEqual(['notify.community.support']);
  });

  it('respects a member who switched the category off', async () => {
    const author = await member();
    const neighbour = await member();
    await db().insert(notificationPreferences).values({ userId: author, category: 'community', channel: 'in_app', enabled: false });
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post() }));
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Cuenta conmigo.' }));
    expect(await unreadCount(db(), author)).toBe(0);
  });

  it('never announces registered demo content', async () => {
    const author = await member();
    const neighbour = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post() }));
    await db().insert(demoContent).values({ subjectType: 'community_post', subjectId: postId, expiresAt: new Date(Date.now() + 86_400_000) });
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Cuenta conmigo.' }));
    expect(await unreadCount(db(), author)).toBe(0);
  });
});

describe('reading', () => {
  it('opens only for its owner, and marks read', async () => {
    const author = await member();
    const neighbour = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: author, input: post() }));
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Yo voy.' }));
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Llevo una carretilla.' }));
    const [first] = await listNotifications(db(), author);

    expect(await openNotification(db(), { userId: neighbour, id: first!.id })).toBeNull();
    expect(await unreadCount(db(), author)).toBe(2);
    expect(await openNotification(db(), { userId: author, id: first!.id })).toBe(`/community/${postId}#replies`);
    expect(await unreadCount(db(), author)).toBe(1);

    await markAllRead(db(), author);
    expect(await unreadCount(db(), author)).toBe(0);
  });
});

describe('sanctuary news', () => {
  it('tells the owner of the review, and followers of today’s word only', async () => {
    const owner = await member();
    const follower = await member();
    const reviewer = await member();
    await db().transaction((tx) => grantRole(tx, { userId: reviewer, roleKey: 'moderator', grantedBy: null }));
    const churchId = await db().transaction((tx) =>
      registerChurch(tx, {
        ownerUserId: owner,
        input: churchInputSchema.parse({
          name: 'Iglesia Luz del Valle',
          description: 'Una congregación pequeña y familiar. Todos son bienvenidos a nuestros cultos.',
          locationId: placeId,
          denomination: '',
          address: '',
          whatsapp: '',
          streamUrl: '',
        }),
        services: [],
      }),
    );
    await db().transaction((tx) => reviewChurch(tx, { actor: { userId: reviewer, status: 'active' }, churchId, decision: 'approve', note: null }));
    expect((await listNotifications(db(), owner))[0]).toMatchObject({ category: 'sanctuary', titleKey: 'notify.sanctuary.church_approved', params: { church: 'Iglesia Luz del Valle' } });

    await db().transaction((tx) => toggleFollow(tx, { userId: follower, churchId }));
    const word = (forDate: string, title: string) =>
      devotionalInputSchema.parse({ forDate, title, scripture: '', body: 'Hoy recordamos que no caminamos solos. Que este día encuentres descanso.' });
    const tomorrow = new Date(`${localDate(timezone)}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId, input: word(tomorrow.toISOString().slice(0, 10), 'Para mañana') }));
    expect(await listNotifications(db(), follower)).toHaveLength(0);

    const id = await db().transaction((tx) => publishDevotional(tx, { actorUserId: owner, churchId, input: word(localDate(timezone), 'El Señor es mi pastor') }));
    expect(await listNotifications(db(), follower)).toEqual([
      expect.objectContaining({ titleKey: 'notify.sanctuary.word', params: { church: 'Iglesia Luz del Valle', title: 'El Señor es mi pastor' }, href: `/sanctuary/words/${id}` }),
    ]);
    // The owner hears about the review, never about their own word.
    expect(await listNotifications(db(), owner)).toHaveLength(1);
  });
});

describe('verifying an email', () => {
  it('earns the reputation the rules promise, once', async () => {
    const created = await register(
      db(),
      { email: `v-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Nueva', locale: 'es', acceptedTerms: true },
      context,
    );
    const start = await getScore(db(), created.userId);
    const delta = REPUTATION_RULE_DEFAULTS.find((rule) => rule.key === 'email_verified')!.delta;

    expect((await consumeVerificationCode(db(), { userId: created.userId, kind: 'email', code: created.emailVerificationCode })).ok).toBe(true);
    expect(await getScore(db(), created.userId)).toBe(start + delta);
  });
});

/** The first whole hour at or after `from` at which `test` holds for the local hour/date in `zone`. */
function firstHour(from: Date, zone: string, test: (local: { date: string; hour: number }) => boolean): Date {
  const at = new Date(Math.ceil(from.getTime() / 3_600_000) * 3_600_000);
  for (let i = 0; i < 24 * 5; i += 1) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(at));
    if (test({ date, hour })) return at;
    at.setTime(at.getTime() + 3_600_000);
  }
  throw new Error('no such hour');
}

describe('words prepared ahead', () => {
  async function setup() {
    const owner = await member();
    const follower = await member();
    const reviewer = await member();
    await db().transaction((tx) => grantRole(tx, { userId: reviewer, roleKey: 'moderator', grantedBy: null }));
    const churchId = await db().transaction((tx) =>
      registerChurch(tx, {
        ownerUserId: owner,
        input: churchInputSchema.parse({ name: 'Iglesia del Camino', description: 'Una congregación pequeña y familiar. Todos son bienvenidos a nuestros cultos.', locationId: placeId, denomination: '', address: '', whatsapp: '', streamUrl: '' }),
        services: [],
      }),
    );
    await db().transaction((tx) => reviewChurch(tx, { actor: { userId: reviewer, status: 'active' }, churchId, decision: 'approve', note: null }));
    await db().transaction((tx) => toggleFollow(tx, { userId: follower, churchId }));
    const tomorrow = new Date(`${localDate(timezone)}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const forDate = tomorrow.toISOString().slice(0, 10);
    const id = await db().transaction((tx) =>
      publishDevotional(tx, { actorUserId: owner, churchId, input: devotionalInputSchema.parse({ forDate, title: 'Para el domingo', scripture: '', body: 'Hoy recordamos que no caminamos solos. Que este día encuentres descanso.' }) }),
    );
    return { follower, owner, id, forDate };
  }

  it('reach followers on their own morning, once', async () => {
    const { follower, owner, id, forDate } = await setup();
    expect(await listNotifications(db(), follower)).toHaveLength(0);

    const early = firstHour(new Date(), timezone, (l) => l.date === forDate && l.hour === SANCTUARY_RULES.wordDeliveryLocalHour - 1);
    expect((await deliverScheduledWords(db(), early)).delivered).toBe(0);
    expect(await listNotifications(db(), follower)).toHaveLength(0);

    const morning = firstHour(new Date(), timezone, (l) => l.date === forDate && l.hour === SANCTUARY_RULES.wordDeliveryLocalHour);
    expect(await deliverScheduledWords(db(), morning)).toMatchObject({ delivered: 1, notified: 1 });
    expect(await listNotifications(db(), follower)).toEqual([expect.objectContaining({ titleKey: 'notify.sanctuary.word', href: `/sanctuary/words/${id}` })]);
    expect((await deliverScheduledWords(db(), new Date(morning.getTime() + 3_600_000))).delivered).toBe(0);
    // The owner heard about the review, not about their own word.
    expect(await listNotifications(db(), owner)).toHaveLength(1);
  });

  it('are not sent late when their day has passed', async () => {
    const { follower, forDate } = await setup();
    const after = firstHour(new Date(), timezone, (l) => l.date > forDate && l.hour === 9);
    expect(await deliverScheduledWords(db(), after)).toMatchObject({ delivered: 0, skipped: 1 });
    expect(await listNotifications(db(), follower)).toHaveLength(0);
  });
});

describe('the daily email summary', () => {
  function recorder(): DigestDelivery & { sent: EmailMessage[] } {
    const sent: EmailMessage[] = [];
    return { sent, available: () => true, send: async (message) => void sent.push(message) };
  }

  async function verifiedWithNews() {
    const created = await register(
      db(),
      { email: `d-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Doña Marta', locale: 'es', acceptedTerms: true },
      context,
    );
    await consumeVerificationCode(db(), { userId: created.userId, kind: 'email', code: created.emailVerificationCode });
    await db().update(users).set({ status: 'active' }).where(eq(users.id, created.userId));
    // No place set: the summary goes out in the fallback UTC window.
    await db().update(userProfiles).set({ locationId: null }).where(eq(userProfiles.userId, created.userId));
    const neighbour = await member();
    const postId = await db().transaction((tx) => createPost(tx, { authorUserId: created.userId, input: post({ title: 'Busco quien me lleve al médico' }) }));
    await db().transaction((tx) => addReply(tx, { postId, authorUserId: neighbour, body: 'Yo la llevo el martes.' }));
    const morning = firstHour(new Date(Date.now() + NOTIFICATION_RULES.digestMinAgeMinutes * 60_000), 'UTC', (l) => l.hour === NOTIFICATION_RULES.digestFallbackUtcHourStart);
    return { userId: created.userId, morning };
  }

  it('sends one summary in the morning, with a way out, and never twice a day', async () => {
    const { userId, morning } = await verifiedWithNews();
    const delivery = recorder();

    const night = new Date(morning.getTime() - 6 * 3_600_000);
    expect((await sendDailyDigests(db(), night, delivery)).sent).toBe(0);

    expect(await sendDailyDigests(db(), morning, delivery)).toEqual({ sent: 1, failed: 0 });
    const [message] = delivery.sent;
    expect(message!.subject).toBe('Tienes un aviso sin leer en Yavaya');
    expect(message!.text).toContain('Alguien respondió a «Busco quien me lleve al médico»');
    expect(message!.headers?.['List-Unsubscribe']).toContain(`u=${userId}&s=${unsubscribeSignature(userId)}`);
    expect(message!.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    expect((await sendDailyDigests(db(), new Date(morning.getTime() + 3_600_000), delivery)).sent).toBe(0);
    // Unread is still unread on the site; only the email is spent.
    expect(await unreadCount(db(), userId)).toBe(1);
  });

  it('skips what was read, members who switched it off, and runs where mail is not real', async () => {
    const read = await verifiedWithNews();
    await markAllRead(db(), read.userId);
    const off = await verifiedWithNews();
    await setDigestEnabled(db(), off.userId, false);
    const delivery = recorder();
    expect((await sendDailyDigests(db(), off.morning, delivery)).sent).toBe(0);
    expect(await sendDailyDigests(db(), off.morning, { ...delivery, available: () => false })).toMatchObject({ skipped: 'email_unavailable' });
  });

  it('signs the unsubscribe link to its member only', async () => {
    const id = crypto.randomUUID();
    expect(verifyUnsubscribe(id, unsubscribeSignature(id))).toBe(true);
    expect(verifyUnsubscribe(crypto.randomUUID(), unsubscribeSignature(id))).toBe(false);
    expect(verifyUnsubscribe(id, '0'.repeat(32))).toBe(false);
  });
});
