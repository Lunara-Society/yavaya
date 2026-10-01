import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { ANIMALS_RULES, MEDIA_RULES } from '@/config/business-rules';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { LOST_PHOTO_PURPOSE, lostFoundInputSchema, publishLostFound } from '@/server/domains/animals/lost-found';

/**
 * Posting a lost or found animal, with photos: a plain multipart form that
 * answers with a relative redirect, so it works without JavaScript.
 */
function go(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
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

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const session = await currentSession();
  if (!session) return go('/login');
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '');
  const fail = (key: string) => go(`/animals/lost/new?kind=${field('kind') === 'found' ? 'found' : 'lost'}&error=${encodeURIComponent(key)}`);
  const parsed = lostFoundInputSchema.safeParse({
    kind: field('kind'),
    species: field('species'),
    name: field('name'),
    description: field('description'),
    locationId: field('locationId'),
    seenOn: field('seenOn'),
    whatsapp: field('whatsapp'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'error.validation_failed');
  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length < ANIMALS_RULES.lostMinPhotos || files.length > ANIMALS_RULES.lostMaxPhotos) return fail('animals.lost.error.photo_count');
  if (files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) return fail('media.error.too_large');
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `animals:${session.user.userId}`);
  if (!limit.allowed) return fail('animals.error.rate_limited');

  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  let stored: StoredImage[] = [];
  try {
    stored = await storeImages({ ownerUserId: session.user.userId, purpose: LOST_PHOTO_PURPOSE, files: await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))) });
    const id = await db().transaction((tx) => publishLostFound(tx, { authorUserId: session.user.userId, input: parsed.data, images: stored, audit }));
    return go(`/animals/lost/${id}?published=1`);
  } catch (error) {
    await discardStored(stored);
    if (isDomainError(error) && error.expose) return fail(error.messageKey);
    console.error('lost/found publish failed:', error);
    return fail('animals.error.upload');
  }
}
