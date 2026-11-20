import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession, requestContext } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { reportCandle } from '@/server/domains/sanctuary/candles';
import { sameOrigin } from '@/app/api/mirador/shared';

export const dynamic = 'force-dynamic';

const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * Whoever holds a candle's link may report its words: the person it was sent
 * to often has no account, so this does not need one. Rate-limited by member
 * or, signed out, by network.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return answer({ ok: false, error: 'error.forbidden' }, 403);
  const session = await currentSession();
  const who = session ? `user:${session.user.userId}` : `net:${(await requestContext()).addressHash ?? 'unknown'}`;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.sanctuaryCandleReport, who);
  if (!limit.allowed) return answer({ ok: false, error: 'error.rate_limited' }, 429);
  const { id } = await params;
  try {
    await db().transaction((tx) => reportCandle(tx, { id, reporterUserId: session?.user.userId ?? null }));
    return answer({ ok: true });
  } catch (error) {
    if (isDomainError(error) && error.expose) return answer({ ok: false, error: error.messageKey }, error.code === 'not_found' ? 404 : 400);
    console.error('sanctuary.candle_report', error instanceof Error ? error.message.slice(0, 300) : 'failed');
    return answer({ ok: false, error: 'error.unexpected' }, 500);
  }
}
