import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { exactLook, savePlayLook } from '@/server/domains/play/profile';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/**
 * Keeps the signed-in player's Yavaya Play character (docs/PLAY.md).
 *
 * JSON in, a status out; the game calls it from the Character Studio. A
 * route handler checks the origin by hand (Next's check covers Server
 * Actions only). Players who are not signed in keep their look on the
 * phone and never reach this.
 */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { look?: unknown } | null;
  const look = exactLook(body?.look);
  if (!look) return NextResponse.json({ error: 'look' }, { status: 400 });
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playSave, `play:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  await savePlayLook(db(), userId, look);
  return NextResponse.json({ ok: true });
}
