import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { discardStored } from '@/server/domains/media/service';
import { countLinkOpen, countShare, recordView, setLike, setSave } from '@/server/domains/mirador/social';
import { myVideo, removeOwnVideo, saveDetails, type VideoDetails } from '@/server/domains/mirador/videos';
import { guard, json, refusal, sameOrigin, viewerKey } from '../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The creator's own video, any status: the upload page follows its processing with this. */
export async function GET(request: Request, { params }: Params) {
  const who = await guard(request, { write: false });
  if ('response' in who) return who.response;
  if (!who.userId) return json({ ok: false, error: 'error.unauthenticated' }, 401);
  const video = await myVideo(db(), { userId: who.userId, videoId: (await params).id });
  return video ? json({ ok: true, video }) : json({ ok: false, error: 'error.not_found' }, 404);
}

/** The creator changes what it says, where it was, what it links to, or whether it is published. */
export async function PATCH(request: Request, { params }: Params) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { details?: VideoDetails } | null;
  if (!body?.details) return json({ ok: false, error: 'error.validation_failed' }, 400);
  const videoId = (await params).id;
  try {
    const saved = await db().transaction((tx) => saveDetails(tx, { userId: who.userId!, videoId, details: body.details! }));
    return json({ ok: true, ...saved });
  } catch (error) {
    return refusal(error, 'mirador.video.details');
  }
}

/** The creator takes it down: out of every feed now, its files deleted once that is committed. */
export async function DELETE(request: Request, { params }: Params) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  try {
    const keys = await db().transaction(async (tx) => removeOwnVideo(tx, { userId: who.userId!, videoId: (await params).id }));
    await discardStored(keys.map((storageKey) => ({ storageKey }))).catch(() => undefined);
    return json({ ok: true });
  } catch (error) {
    return refusal(error, 'mirador.video.remove');
  }
}

/**
 * What a viewer does: like, save, share, open its link, and how long they
 * watched. Views are counted for anyone (one per viewer per day); the rest
 * need a signed-in member.
 */
export async function POST(request: Request, { params }: Params) {
  // Views too: a count another site could post to would not be a count.
  if (!sameOrigin(request)) return json({ ok: false, error: 'error.forbidden' }, 403);
  const action = ((await request.clone().json().catch(() => null)) as { action?: string } | null)?.action;
  const anonymous = action === 'view' || action === 'link' || action === 'share';
  const who = await guard(request, { write: !anonymous });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { action?: string; watchedMs?: unknown; replay?: unknown } | null;
  const videoId = (await params).id;
  const subject = who.userId ? `user:${who.userId}` : await viewerKey(null);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorTap, subject);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.slow_down' }, 429);
  try {
    switch (body?.action) {
      case 'like':
      case 'unlike':
        return json({ ok: true, ...(await db().transaction((tx) => setLike(tx, { userId: who.userId!, videoId, on: body.action === 'like' }))) });
      case 'save':
      case 'unsave':
        return json({ ok: true, ...(await db().transaction((tx) => setSave(tx, { userId: who.userId!, videoId, on: body.action === 'save' }))) });
      case 'view': {
        const key = await viewerKey(who.userId);
        await db().transaction((tx) => recordView(tx, { videoId, viewerKey: key, userId: who.userId, watchedMs: Number(body.watchedMs) || 0, replay: body.replay === true }));
        return json({ ok: true });
      }
      case 'share': {
        const key = await viewerKey(who.userId);
        await db().transaction((tx) => countShare(tx, { videoId, viewerKey: key, userId: who.userId }));
        return json({ ok: true });
      }
      case 'link':
        await db().transaction((tx) => countLinkOpen(tx, { videoId, userId: who.userId }));
        return json({ ok: true });
      default:
        return json({ ok: false, error: 'error.validation_failed' }, 400);
    }
  } catch (error) {
    return refusal(error, 'mirador.video.action');
  }
}
