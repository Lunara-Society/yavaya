import { db } from '@/server/db/client';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { startUpload } from '@/server/domains/mirador/upload';
import { guard, json, refusal } from '../shared';

export const dynamic = 'force-dynamic';

/** Starts a video upload: the size and type the phone reports, checked; the parts it should send. */
export async function POST(request: Request) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { bytes?: unknown; type?: unknown } | null;
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorUpload, `user:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.upload_limit' }, 429);
  try {
    const started = await db().transaction((tx) =>
      startUpload(tx, { userId: who.userId!, bytes: Number(body?.bytes), contentType: String(body?.type ?? ''), language: who.session!.user.locale }),
    );
    return json({ ok: true, ...started });
  } catch (error) {
    return refusal(error, 'mirador.upload.start');
  }
}
