import { after } from 'next/server';
import { db } from '@/server/db/client';
import { completeUpload } from '@/server/domains/mirador/upload';
import { processVideo } from '@/server/domains/mirador/process';
import { saveDetails, type VideoDetails } from '@/server/domains/mirador/videos';
import { guard, json, refusal } from '../../../shared';

export const dynamic = 'force-dynamic';

/**
 * Every part is in: the file is joined in the bucket, the member's words
 * saved with it, and processing starts once this answer has gone (the
 * scheduler picks up any server restart in between).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { details?: VideoDetails } | null;
  try {
    // On its own: once the bucket has joined the parts, that cannot be rolled back with the words below.
    await db().transaction((tx) => completeUpload(tx, { userId: who.userId!, videoId: id }));
  } catch (error) {
    return refusal(error, 'mirador.upload.complete');
  }
  let detailsError: string | null = null;
  if (body?.details) {
    try {
      await db().transaction((tx) => saveDetails(tx, { userId: who.userId!, videoId: id, details: body.details! }));
    } catch (error) {
      // The video is safe and processing; the member fixes what was refused and saves again.
      detailsError = (error as { messageKey?: string }).messageKey ?? 'error.unexpected';
    }
  }
  after(() => processVideo(db(), id).catch(() => undefined));
  return json({ ok: true, videoId: id, status: 'processing', detailsError });
}
