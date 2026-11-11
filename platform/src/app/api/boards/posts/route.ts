import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db/client';
import { BOARD_RULES, MEDIA_RULES } from '@/config/business-rules';
import { BOARD_DISTRICTS, isBoardDistrict } from '@/config/boards';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { BOARD_PHOTO_PURPOSE, boardInputSchema, createBoardPost } from '@/server/domains/boards/service';

export const dynamic = 'force-dynamic';

/**
 * Publishes a post in a board district, photos included.
 *
 * A route handler rather than a Server Action because photos do not fit the
 * 1 MB Server Action body limit. It is posted to by a plain form, so it works
 * without JavaScript, and it always answers with a redirect: to the new post,
 * or back to the form with the reason as a message key. Next's cross-site
 * check for actions does not apply to route handlers, so the origin is
 * checked by hand.
 *
 * Order: validate what is cheap, rate-limit, then decode and upload the
 * photos (slow), then one transaction. If that transaction refuses the post,
 * the uploaded photos are deleted.
 */
export async function POST(request: Request) {
  const to = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const session = await currentSession();
  if (!session) return to('/login');

  const declared = Number(request.headers.get('content-length') ?? '0');
  let form: FormData | null = null;
  if (declared <= BOARD_RULES.maxPhotos * MEDIA_RULES.maxUploadBytes + 1024 * 1024) form = await request.formData().catch(() => null);
  const district = String(form?.get('district') ?? '');
  if (!form || !isBoardDistrict(district)) return to('/districts');
  const base = `/${BOARD_DISTRICTS[district].slug}`;
  const back = (key: string) => to(`${base}/new?error=${encodeURIComponent(key)}`);

  const parsed = boardInputSchema.safeParse({
    district,
    subdistrict: String(form.get('subdistrict') ?? ''),
    kind: String(form.get('kind') ?? ''),
    title: String(form.get('title') ?? ''),
    body: String(form.get('body') ?? ''),
    priceText: String(form.get('priceText') ?? ''),
    locationId: String(form.get('locationId') ?? ''),
  });
  if (!parsed.success) return back(parsed.error.issues[0]?.message ?? 'error.validation_failed');

  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > BOARD_RULES.maxPhotos) return back('board.error.photo_count');
  if (files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) return back('media.error.too_large');

  const userId = session.user.userId;
  const monitored = session.user.monitoredUntil > new Date();
  const limit = await consumeRateLimit(db(), monitored ? RATE_LIMITS.publishMonitored : RATE_LIMITS.publishStandard, `board:${userId}`);
  if (!limit.allowed) return back('board.error.rate_limited');

  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  let stored: StoredImage[] = [];
  try {
    if (files.length > 0) {
      stored = await storeImages({ ownerUserId: userId, purpose: BOARD_PHOTO_PURPOSE, files: await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))) });
    }
    const postId = await db().transaction((tx) => createBoardPost(tx, { authorUserId: userId, input: parsed.data, images: stored, audit }));
    revalidatePath(base);
    return to(`${base}/${postId}`);
  } catch (error) {
    await discardStored(stored).catch(() => {});
    if (isDomainError(error) && error.expose) return back(error.messageKey);
    console.error('boards.publish', error instanceof Error ? error.message : 'failed');
    return back('board.error.upload');
  }
}

/** The browser always sends `Origin` on a form POST. It must name the host this request arrived at, as the platform's proxy forwarded it. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
