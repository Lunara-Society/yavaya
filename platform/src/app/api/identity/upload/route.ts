import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { MEDIA_RULES } from '@/config/business-rules';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { errors, toClientError } from '@/server/errors';
import { discardStored, insertMediaRows, storeImages, type StoredImage } from '@/server/domains/media/service';
import { IDENTITY_MEDIA_PURPOSES, roomForPhoto, type IdentityPhotoSlot } from '@/server/domains/identity/studio';

export const dynamic = 'force-dynamic';

const SLOTS = Object.keys(IDENTITY_MEDIA_PURPOSES) as IdentityPhotoSlot[];

/**
 * A member's own photo for their profile: the profile photo, a cover, or a
 * background. It goes through the same pipeline as every image — the first
 * bytes decide the type, the decoder must read it, and what is kept is a
 * fresh re-encoding with no metadata — and is stored for its owner only. It
 * shows on the profile once the member publishes a profile that uses it,
 * and to whom they chose (see identityPhotoAccess).
 *
 * A route handler rather than a Server Action because a phone photo does not
 * fit the Server Action body limit; the origin is therefore checked by hand.
 */
export async function POST(request: Request) {
  const { t } = await getTranslator();
  const fail = (error: unknown, status = 400) => {
    const client = toClientError(error);
    return NextResponse.json(
      { ok: false, code: client.code, message: t(client.messageKey as MessageKey, stringParams(client.details)) },
      { status: client.code === 'internal' ? 500 : status },
    );
  };

  if (!sameOrigin(request)) return fail(errors.forbidden(), 403);
  const session = await currentSession();
  if (!session) return fail(errors.unauthenticated(), 401);
  const userId = session.user.userId;

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MEDIA_RULES.maxUploadBytes + 64 * 1024) {
    return fail(errors.validation('media.error.too_large', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 }), 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(errors.validation('error.validation_failed'));
  }
  const slot = String(form.get('slot') ?? '') as IdentityPhotoSlot;
  if (!SLOTS.includes(slot)) return fail(errors.validation('error.validation_failed'));
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return fail(errors.validation('media.error.empty'));

  const limit = await consumeRateLimit(db(), RATE_LIMITS.identityUpload, `user:${userId}`);
  if (!limit.allowed) return fail(errors.rateLimited(limit.retryAfterSeconds), 429);

  let stored: StoredImage[] = [];
  try {
    // Room first, so a member at the limit is told before anything is uploaded.
    await db().transaction((tx) => roomForPhoto(tx, userId));
    stored = await storeImages({ ownerUserId: userId, purpose: IDENTITY_MEDIA_PURPOSES[slot], files: [Buffer.from(await file.arrayBuffer())] });
    await db().transaction(async (tx) => {
      await roomForPhoto(tx, userId);
      await insertMediaRows(tx, { ownerUserId: userId, purpose: IDENTITY_MEDIA_PURPOSES[slot], images: stored });
    });
    const image = stored[0]!;
    return NextResponse.json({ ok: true, id: image.id, width: image.width, height: image.height });
  } catch (error) {
    await discardStored(stored);
    return fail(error);
  }
}

function stringParams(details: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return out;
}

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
