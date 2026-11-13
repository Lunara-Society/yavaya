import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { returnVaultProduct } from '@/server/domains/play/vault';
import { playProgressOf } from '@/server/domains/play/progress';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/** Gives back a Vault product that cannot be used yet, for the gems paid (the terms shown before buying). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { product?: unknown } | null;
  if (typeof body?.product !== 'string' || !/^[a-z0-9_]{1,60}$/.test(body.product)) return NextResponse.json({ error: 'input' }, { status: 400 });
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playShop, `play:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const result = await db().transaction((tx) => returnVaultProduct(tx, userId, body.product as string));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
  return NextResponse.json({ ok: true, returned: result.gems, gems: (await playProgressOf(db(), userId)).gems });
}
