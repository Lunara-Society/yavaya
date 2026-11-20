import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { lightCandle } from '@/server/domains/sanctuary/candles';
import { sameOrigin } from '@/app/api/mirador/shared';

export const dynamic = 'force-dynamic';

const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/** A member lights a candle for someone (docs/sanctuary/CANDLE.md): free, a few a day, and its link to send. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return answer({ ok: false, error: 'error.forbidden' }, 403);
  const session = await currentSession();
  if (!session || session.user.status !== 'active') return answer({ ok: false, error: 'error.unauthenticated' }, 401);
  const body = (await request.json().catch(() => null)) as { forName?: unknown; intention?: unknown; anonymous?: unknown } | null;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.sanctuaryCandle, `user:${session.user.userId}`);
  if (!limit.allowed) return answer({ ok: false, error: 'sanctuary.candle.error.too_many' }, 429);
  try {
    const candle = await db().transaction((tx) => lightCandle(tx, { userId: session.user.userId, forName: body?.forName, intention: body?.intention, anonymous: body?.anonymous }));
    return answer({ ok: true, id: candle.id, path: `/sanctuary/vela/${candle.id}` });
  } catch (error) {
    if (isDomainError(error) && error.expose) return answer({ ok: false, error: error.messageKey }, 400);
    console.error('sanctuary.candle', error instanceof Error ? error.message.slice(0, 300) : 'failed');
    return answer({ ok: false, error: 'error.unexpected' }, 500);
  }
}
