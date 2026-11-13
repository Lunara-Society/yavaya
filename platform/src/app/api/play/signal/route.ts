import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { requestContext } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { countSignal, signalKey } from '@/server/domains/play/signals';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/**
 * One anonymous count (docs/PLAY.md, "What players do"): a course started,
 * finished, or a fall and where. Only the count is kept. The address is
 * used, hashed, for the rate limit alone and is not stored with the count.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { event?: unknown; course?: unknown; segment?: unknown } | null;
  const key = signalKey(body?.event, body?.course, body?.segment);
  if (!key) return NextResponse.json({ error: 'input' }, { status: 400 });
  const context = await requestContext();
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playSignal, `signal:${context.addressHash ?? 'unknown'}`);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });
  await countSignal(db(), key);
  return NextResponse.json({ ok: true });
}
