import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { requestOffer } from '@/server/domains/mirador/offers';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

/** "Lo quiero": the member asks for some of what the video offers; the creator is told at once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { quantity?: unknown; note?: unknown } | null;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorComment, `want:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.slow_down' }, 429);
  const videoId = (await params).id;
  try {
    return json({ ok: true, ...(await db().transaction((tx) => requestOffer(tx, { userId: who.userId!, videoId, quantity: body?.quantity, note: body?.note }))) });
  } catch (error) {
    return refusal(error, 'mirador.offer.want');
  }
}
