import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { ANIMALS_RULES, MEDIA_RULES } from '@/config/business-rules';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { listingInputSchema, PHOTO_PURPOSE, publishAnimal } from '@/server/domains/animals/service';

/**
 * Publishing an animal, with its photos. A route rather than a server
 * action because photos exceed the action body limit; it takes a plain
 * multipart form and answers with a redirect, so it works without
 * JavaScript. Relative redirects: behind the proxy `request.url` carries the
 * internal host.
 */
function go(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** A browser always sends `Origin` on a form POST; it must be this site. */
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
  const fail = (key: string) => go(`/animals/rescuer?error=${encodeURIComponent(key)}#publish`);
  const field = (name: string) => String(form.get(name) ?? '');
  const age = field('ageMonths').trim();
  const parsed = listingInputSchema.safeParse({
    species: field('species'),
    name: field('name'),
    sex: field('sex'),
    size: field('size'),
    ageMonths: age === '' ? null : Number.parseInt(age, 10),
    sterilised: form.get('sterilised') === 'on',
    vaccinated: form.get('vaccinated') === 'on',
    dewormed: form.get('dewormed') === 'on',
    healthNotes: field('healthNotes'),
    temperament: field('temperament'),
    description: field('description'),
    locationId: field('locationId'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'error.validation_failed');

  const files = form.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length < ANIMALS_RULES.minPhotos || files.length > ANIMALS_RULES.maxPhotos) return fail('animals.error.photo_count');
  if (files.some((file) => file.size > MEDIA_RULES.maxUploadBytes)) return fail('media.error.too_large');

  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `animals:${session.user.userId}`);
  if (!limit.allowed) return fail('animals.error.rate_limited');

  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  let stored: StoredImage[] = [];
  try {
    stored = await storeImages({ ownerUserId: session.user.userId, purpose: PHOTO_PURPOSE, files: await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))) });
    const id = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: session.user.userId, input: parsed.data, images: stored, audit }));
    return go(`/animals/${id}?published=1`);
  } catch (error) {
    await discardStored(stored);
    if (isDomainError(error) && error.expose) return fail(error.messageKey);
    console.error('animal publish failed:', error);
    return fail('animals.error.upload');
  }
}
