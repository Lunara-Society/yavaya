import 'server-only';
import { and, count, eq, gte } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { reports, sanctuaryCandles, users } from '@/server/db/schema';
import { SANCTUARY_RULES as R } from '@/config/business-rules';
import type { Locale } from '@/i18n/config';
import { dailyLight } from '@/i18n/daily';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { openTicketFor } from '@/server/domains/moderation/tickets';
import { currentLightDate, memberTimezone } from './daily';

/**
 * "Encender una vela por alguien" (docs/sanctuary/CANDLE.md).
 *
 * A member lights a candle for someone — with that person's name and an
 * intention if they like — and sends it to them through whatever app they
 * choose. The page it opens shows the candle burning and, above it, the
 * prayer of the day it was lit: the same words the member saw while lighting
 * it. It burns `candleBurnDays`, like the seven-day veladoras of the region.
 *
 * The page is reachable only by its link and needs no account, because the
 * person it is for may not have one. So what a member writes is kept short,
 * may carry no links, and anyone holding the link can report it — which
 * hides the words at once (the flame keeps burning) and opens a ticket.
 * Free, always: nothing about prayer is ever charged.
 */

const LINK = /(https?:|www\.|\b[a-z0-9-]+\.(com|net|org|lat|io|me|ly|app|info|xyz|link|site|shop|online)\b|wa\.me|t\.me)/i;

const clean = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

export async function lightCandle(
  tx: Executor,
  params: { userId: string; forName: unknown; intention: unknown; anonymous: unknown; now?: Date },
): Promise<{ id: string; burnsUntil: Date }> {
  const now = params.now ?? new Date();
  const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) throw errors.unauthenticated();
  if (user.status !== 'active') throw new DomainError('forbidden', 'sanctuary.candle.error.account');
  const forName = clean(params.forName, R.candleNameMaxLength);
  const intention = clean(params.intention, R.candleIntentionMaxLength);
  if (LINK.test(forName) || LINK.test(intention)) throw errors.validation('sanctuary.candle.error.link');
  const lightDate = currentLightDate(await memberTimezone(tx, params.userId), now);
  const burnsUntil = new Date(now.getTime() + R.candleBurnDays * 86_400_000);
  const [row] = await tx
    .insert(sanctuaryCandles)
    .values({ userId: params.userId, forName: forName || null, intention: intention || null, anonymous: params.anonymous === true, lightDate, createdAt: now, burnsUntil })
    .returning({ id: sanctuaryCandles.id });
  await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'sanctuary.candle_lit', subjectType: 'sanctuary_candle', subjectId: row!.id, district: 'sanctuary', metadata: { named: Boolean(forName), intention: Boolean(intention) } });
  return { id: row!.id, burnsUntil };
}

export type CandleView = {
  id: string;
  forName: string | null;
  intention: string | null;
  /** The sender's display name, or null when they chose to stay unnamed. */
  from: string | null;
  prayer: string;
  litAt: string;
  burnsUntil: string;
  burning: boolean;
  /** Words hidden after a report: the candle still burns, what was written is not shown. */
  wordsHidden: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A candle's page, in the reader's language: the prayer is that day's prayer in their words. Null when unknown. */
export async function candleView(executor: Executor, params: { id: string; locale: Locale; now?: Date }): Promise<CandleView | null> {
  if (!UUID.test(params.id)) return null;
  const [row] = await executor
    .select({ candle: sanctuaryCandles, name: users.displayName })
    .from(sanctuaryCandles)
    .innerJoin(users, eq(users.id, sanctuaryCandles.userId))
    .where(eq(sanctuaryCandles.id, params.id))
    .limit(1);
  if (!row) return null;
  const now = params.now ?? new Date();
  const hidden = row.candle.status !== 'lit';
  return {
    id: row.candle.id,
    forName: hidden ? null : row.candle.forName,
    intention: hidden ? null : row.candle.intention,
    from: hidden || row.candle.anonymous ? null : row.name,
    prayer: dailyLight(row.candle.lightDate, ['prayer'], params.locale).text,
    litAt: row.candle.createdAt.toISOString(),
    burnsUntil: row.candle.burnsUntil.toISOString(),
    burning: row.candle.burnsUntil > now,
    wordsHidden: hidden,
  };
}

/** Candles lit in the last day, by everyone: a real count, shown so no one lights theirs alone. */
export async function candlesLastDay(executor: Executor, now = new Date()): Promise<number> {
  const [row] = await executor.select({ n: count() }).from(sanctuaryCandles).where(gte(sanctuaryCandles.createdAt, new Date(now.getTime() - 86_400_000)));
  return Number(row?.n ?? 0);
}

/**
 * Anyone holding the link may report what is written on a candle. The words
 * are hidden at once — whoever received it should not have to keep reading
 * them — and a ticket goes to Santuario's moderators with who lit it.
 */
export async function reportCandle(tx: Executor, params: { id: string; reporterUserId: string | null }): Promise<void> {
  if (!UUID.test(params.id)) throw errors.notFound('sanctuary_candle');
  const [candle] = await tx.select().from(sanctuaryCandles).where(eq(sanctuaryCandles.id, params.id)).for('update');
  if (!candle) throw errors.notFound('sanctuary_candle');
  if (params.reporterUserId === candle.userId) throw errors.validation('sanctuary.candle.error.own');
  const ticketId = await openTicketFor(tx, { subjectType: 'sanctuary_candle', subjectId: candle.id, category: 'harassment', priority: 'high' });
  await tx.insert(reports).values({ reporterUserId: params.reporterUserId, subjectType: 'sanctuary_candle', subjectId: candle.id, district: 'sanctuary', category: 'harassment', description: [candle.forName, candle.intention].filter(Boolean).join(' — ').slice(0, 300) || null, evidence: [], ticketId });
  await tx.update(sanctuaryCandles).set({ status: 'removed' }).where(and(eq(sanctuaryCandles.id, candle.id), eq(sanctuaryCandles.status, 'lit')));
  await recordAudit(tx, { actorType: params.reporterUserId ? 'user' : 'system', actorUserId: params.reporterUserId, action: 'sanctuary.candle_reported', subjectType: 'sanctuary_candle', subjectId: candle.id, district: 'sanctuary' });
}
