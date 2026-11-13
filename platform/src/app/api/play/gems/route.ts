import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { startGemPurchase } from '@/server/domains/play/gems';
import { DomainError } from '@/server/errors';
import { sameOrigin } from '@/app/api/go/upload';

export const dynamic = 'force-dynamic';

/**
 * Starts buying a gem pack (docs/PLAY.md, "Gems"): answers with Stripe's
 * page to go to. The gems arrive only when Stripe confirms the payment, server
 * to server; this route moves no money and credits nothing.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'origin' }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { pack?: unknown } | null;
  if (typeof body?.pack !== 'string' || body.pack.length > 40) return NextResponse.json({ error: 'input' }, { status: 400 });
  const userId = session.user.userId;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.playShop, `gems:${userId}`);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const { redirectUrl } = await startGemPurchase(db(), { userId, packKey: body.pack, attemptId: randomUUID(), appUrl: serverEnv().APP_URL, description: 'Yavaya Play · gemas' });
    return NextResponse.json({ redirectUrl });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.code }, { status: 422 });
    throw error;
  }
}
