import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { MEDIA_RULES, MERCADITO_RULES } from '@/config/business-rules';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { errors, toClientError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { PHOTO_PURPOSE, publishListing, updateListing } from '@/server/domains/mercadito/service';
import { listingInputSchema } from '@/server/domains/mercadito/rules';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Publishes or edits a listing, photos included, in one request.
 *
 * A route handler rather than a Server Action because photos do not fit the
 * 1 MB Server Action body limit, which stays tight on purpose. That also
 * means Next's built-in cross-site check for actions does not apply here, so
 * the origin is checked by hand below.
 *
 * Order matters: validate everything cheap, then rate-limit, then decode and
 * upload the images (slow), then one transaction for every database write.
 * If that transaction fails the uploaded objects are deleted, so a refused
 * listing — not enough tokens, over the new-seller limit — leaves nothing
 * behind.
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
  const ceiling = MERCADITO_RULES.maxPhotos * MEDIA_RULES.maxUploadBytes + 1024 * 1024;
  if (declared > ceiling) {
    return fail(errors.validation('media.error.too_large', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 }), 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(errors.validation('error.validation_failed'));
  }

  const mode = form.get('mode') === 'edit' ? 'edit' : 'create';
  const listingId = String(form.get('listingId') ?? '');
  if (!UUID.test(listingId)) return fail(errors.validation('error.validation_failed'));

  const parsed = listingInputSchema.safeParse({
    title: String(form.get('title') ?? ''),
    description: String(form.get('description') ?? ''),
    price: String(form.get('price') ?? ''),
    currency: String(form.get('currency') ?? ''),
    category: String(form.get('category') ?? ''),
    condition: String(form.get('condition') ?? ''),
    locationId: String(form.get('locationId') ?? ''),
  });
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message ?? 'error.validation_failed';
    return fail(errors.validation(key, ruleParams()));
  }

  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const keep = form.getAll('keep').map(String).filter((id) => UUID.test(id));
  if (files.length > MERCADITO_RULES.maxPhotos) {
    return fail(errors.validation('mercadito.error.photo_count', ruleParams()));
  }
  if (files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) {
    return fail(errors.validation('media.error.too_large', { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 }), 413);
  }

  const monitored = session.user.monitoredUntil > new Date();
  const limit = await consumeRateLimit(
    db(),
    monitored ? RATE_LIMITS.publishMonitored : RATE_LIMITS.publishStandard,
    `user:${userId}`,
  );
  if (!limit.allowed) return fail(errors.rateLimited(limit.retryAfterSeconds), 429);

  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };

  let stored: StoredImage[] = [];
  try {
    stored = await storeImages({
      ownerUserId: userId,
      purpose: PHOTO_PURPOSE,
      files: await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))),
    });

    if (mode === 'create') {
      const result = await db().transaction((tx) =>
        publishListing(tx, { listingId, sellerUserId: userId, input: parsed.data, images: stored, audit }),
      );
      // A replayed submission stored a second copy of the photos that the
      // first one already holds; those copies are not referenced by anything.
      if (result.deduplicated) await discardStored(stored);
      return NextResponse.json({ ok: true, id: result.listingId });
    }

    const result = await db().transaction((tx) =>
      updateListing(tx, {
        listingId,
        sellerUserId: userId,
        input: parsed.data,
        keepMediaIds: keep,
        newImages: stored,
        audit,
      }),
    );
    await discardStored(result.droppedStorageKeys.map((storageKey) => ({ storageKey })));
    return NextResponse.json({ ok: true, id: listingId });
  } catch (error) {
    await discardStored(stored);
    return fail(error);
  }
}

function ruleParams(): Record<string, number> {
  return {
    min: MERCADITO_RULES.minPhotos,
    max: MERCADITO_RULES.maxPhotos,
    titleMin: MERCADITO_RULES.titleMinLength,
    titleMax: MERCADITO_RULES.titleMaxLength,
    descriptionMin: MERCADITO_RULES.descriptionMinLength,
    descriptionMax: MERCADITO_RULES.descriptionMaxLength,
  };
}

function stringParams(details: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * The browser always sends `Origin` on a cross-origin POST. It must name the
 * host this request arrived at, as the platform's proxy forwarded it.
 */
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
