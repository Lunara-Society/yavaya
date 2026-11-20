import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { reports, sanctuaryCandles, tickets, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { dailyLight } from '@/i18n/daily';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { candlesLastDay, candleView, lightCandle, reportCandle } from '@/server/domains/sanctuary/candles';
import { resetTransactionalData } from '../helpers/database';

/**
 * "Encender una vela por alguien" (docs/sanctuary/CANDLE.md): a member lights
 * a candle; its page, open to whoever has the link, shows the prayer of the
 * day it was lit in the reader's language, who lit it unless they chose not
 * to say, and burns for its days; anyone with the link can report its words,
 * which hides them at once.
 */
const context = { networkHash: null, addressHash: 'candles', deviceFingerprint: null, userAgent: 'vitest' };

async function person(name: string) {
  const { userId } = await register(db(), { email: `candle-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true }, context);
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

beforeEach(async () => {
  await resetTransactionalData();
});

afterAll(async () => {
  await closeDb();
});

describe('A candle for someone', () => {
  it('lights a candle that shows the prayer of its day, in the reader’s language, and burns for its days', async () => {
    const rosa = await person('Rosa Prueba');
    const litAt = new Date('2026-11-20T18:00:00Z');
    const { id, burnsUntil } = await db().transaction((tx) => lightCandle(tx, { userId: rosa, forName: '  Mamá  ', intention: 'Por su salud', anonymous: false, now: litAt }));
    expect(burnsUntil.getTime() - litAt.getTime()).toBe(SANCTUARY_RULES.candleBurnDays * 86_400_000);
    const [row] = await db().select().from(sanctuaryCandles).where(eq(sanctuaryCandles.id, id));
    expect(row).toMatchObject({ forName: 'Mamá', intention: 'Por su salud', status: 'lit' });

    const es = await candleView(db(), { id, locale: 'es', now: litAt });
    expect(es).toMatchObject({ forName: 'Mamá', intention: 'Por su salud', from: 'Rosa Prueba', burning: true, wordsHidden: false });
    expect(es!.prayer).toBe(dailyLight(row!.lightDate, ['prayer'], 'es').text);
    // The same day's prayer, in the words of whoever opens it.
    const en = await candleView(db(), { id, locale: 'en', now: litAt });
    expect(en!.prayer).toBe(dailyLight(row!.lightDate, ['prayer'], 'en').text);
    expect(en!.prayer).not.toBe(es!.prayer);
    // Burned out after its days; the page still opens.
    expect((await candleView(db(), { id, locale: 'es', now: new Date(litAt.getTime() + (SANCTUARY_RULES.candleBurnDays + 1) * 86_400_000) }))!.burning).toBe(false);
    expect(await candleView(db(), { id: 'not-a-candle', locale: 'es' })).toBeNull();
    expect(await candlesLastDay(db(), new Date(litAt.getTime() + 3_600_000))).toBe(1);
  });

  it('keeps the sender unnamed when asked, and refuses links in what is written', async () => {
    const rosa = await person('Rosa Prueba');
    const { id } = await db().transaction((tx) => lightCandle(tx, { userId: rosa, forName: '', intention: '', anonymous: true }));
    expect(await candleView(db(), { id, locale: 'es' })).toMatchObject({ from: null, forName: null, intention: null });
    for (const intention of ['mira esto https://example.com', 'escríbeme a wa.me/50588888888', 'visita premios.xyz ya']) {
      await expect(db().transaction((tx) => lightCandle(tx, { userId: rosa, forName: 'Ana', intention, anonymous: false }))).rejects.toMatchObject({ messageKey: 'sanctuary.candle.error.link' });
    }
  });

  it('hides its words at once when someone with the link reports them, and opens a ticket', async () => {
    const rosa = await person('Rosa Prueba');
    const { id } = await db().transaction((tx) => lightCandle(tx, { userId: rosa, forName: 'Juan', intention: 'Palabras que hieren', anonymous: false }));
    await expect(db().transaction((tx) => reportCandle(tx, { id, reporterUserId: rosa }))).rejects.toMatchObject({ messageKey: 'sanctuary.candle.error.own' });
    // Whoever received it may have no account.
    await db().transaction((tx) => reportCandle(tx, { id, reporterUserId: null }));
    expect(await candleView(db(), { id, locale: 'es' })).toMatchObject({ forName: null, intention: null, from: null, wordsHidden: true, burning: true });
    const [report] = await db().select().from(reports).where(eq(reports.subjectId, id));
    expect(report).toMatchObject({ subjectType: 'sanctuary_candle', district: 'sanctuary', reporterUserId: null });
    expect((await db().select().from(tickets).where(eq(tickets.id, report!.ticketId!)))[0]).toMatchObject({ subjectType: 'sanctuary_candle', priority: 'high' });
  });
});
