import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { buyItem } from '@/server/domains/play/progress';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/** Buys a look with Play Coins: earned by playing, never with money (docs/PLAY.md, "Shop and rewards"). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { item?: unknown } | null;
  if (typeof body?.item !== 'string' || body.item.length > 60) return NextResponse.json({ error: 'input' }, { status: 400 });
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playShop, `play:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const result = await db().transaction((tx) => buyItem(tx, userId, body.item as string));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
  return NextResponse.json(result);
}
