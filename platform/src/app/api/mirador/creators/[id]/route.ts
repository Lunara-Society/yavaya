import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { setBlock, setFollow } from '@/server/domains/mirador/social';
import { guard, json, refusal } from '../../shared';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Follow or stop following a creator; block or unblock someone in Mirador. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const other = (await params).id;
  if (!UUID.test(other)) return json({ ok: false, error: 'error.not_found' }, 404);
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorTap, `user:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.slow_down' }, 429);
  try {
    switch (body?.action) {
      case 'follow':
      case 'unfollow':
        return json({ ok: true, ...(await db().transaction((tx) => setFollow(tx, { userId: who.userId!, creatorUserId: other, on: body.action === 'follow' }))) });
      case 'block':
      case 'unblock':
        return json({ ok: true, ...(await db().transaction((tx) => setBlock(tx, { userId: who.userId!, otherUserId: other, on: body.action === 'block' }))) });
      default:
        return json({ ok: false, error: 'error.validation_failed' }, 400);
    }
  } catch (error) {
    return refusal(error, 'mirador.creator');
  }
}
