import { after } from 'next/server';
import { db } from '@/server/db/client';
import { MEDIA_RULES, MIRADOR_RULES } from '@/config/business-rules';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { startPhotoVideo } from '@/server/domains/mirador/upload';
import { processVideo } from '@/server/domains/mirador/process';
import { saveDetails, type VideoDetails } from '@/server/domains/mirador/videos';
import { saveOffer, type OfferInput } from '@/server/domains/mirador/offers';
import { guard, json, refusal } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * Photos to Mirador: up to four, with what the member wrote and, if they
 * offer it, the offer. Yavaya makes the video after answering; the words and
 * the offer are saved on their own, so a refused field never loses the photos.
 */
export async function POST(request: Request) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MIRADOR_RULES.maxPhotos * MEDIA_RULES.maxUploadBytes + 1024 * 1024) return json({ ok: false, error: 'media.error.too_large' }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ ok: false, error: 'error.validation_failed' }, 400);
  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length < 1 || files.length > MIRADOR_RULES.maxPhotos) return json({ ok: false, error: 'mirador.error.photo_count' }, 400);
  if (files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) return json({ ok: false, error: 'media.error.too_large' }, 413);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.miradorUpload, `user:${who.userId}`);
  if (!limit.allowed) return json({ ok: false, error: 'mirador.error.upload_limit' }, 429);

  let videoId: string;
  try {
    const photos = await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer())));
    ({ videoId } = await db().transaction((tx) => startPhotoVideo(tx, { userId: who.userId!, photos, language: who.session!.user.locale })));
  } catch (error) {
    return refusal(error, 'mirador.photos');
  }
  const parse = (name: string) => {
    try {
      return JSON.parse(String(form.get(name) ?? 'null')) as unknown;
    } catch {
      return null;
    }
  };
  const details = parse('details') as VideoDetails | null;
  const offer = parse('offer') as OfferInput | null;
  let detailsError: string | null = null;
  try {
    if (details) await db().transaction((tx) => saveDetails(tx, { userId: who.userId!, videoId, details }));
    if (offer) await db().transaction((tx) => saveOffer(tx, { userId: who.userId!, videoId, input: offer }));
  } catch (error) {
    detailsError = (error as { messageKey?: string }).messageKey ?? 'error.unexpected';
  }
  after(() => processVideo(db(), videoId).catch(() => undefined));
  return json({ ok: true, videoId, status: 'processing', detailsError });
}
