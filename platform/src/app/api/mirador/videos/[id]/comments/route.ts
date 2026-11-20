import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { addComment, listComments } from '@/server/domains/mirador/social';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const who = await guard(request, { write: false });
  if ('response' in who) return who.response;
  try {
    return json({ ok: true, comments: await listComments(db(), { videoId: (await params).id, viewerId: who.userId }) });
  } catch (error) {
    return refusal(error, 'mirador.comments.list');
  }
}

export async function POST(request: Request, { params }: Params) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { body?: unknown; parentId?: unknown } | null;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorComment, `user:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.slow_down' }, 429);
  try {
    const videoId = (await params).id;
    const created = await db().transaction((tx) => addComment(tx, { userId: who.userId!, videoId, body: body?.body, parentId: typeof body?.parentId === 'string' ? body.parentId : null }));
    return json({ ok: true, ...created, comments: await listComments(db(), { videoId, viewerId: who.userId }) });
  } catch (error) {
    return refusal(error, 'mirador.comments.add');
  }
}
