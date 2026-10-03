import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { saveStore, STORE_PHOTO_PURPOSE, storeInputSchema } from '@/server/domains/go/service';
import { go, number, oneFile, sameOrigin, text } from '../upload';

/** Opening or editing a store, with an optional photo of it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return go('/yavayago/store');
  const session = await currentSession();
  if (!session) return go('/login?next=/yavayago/store');
  const form = await request.formData();
  const fail = (key: string) => go(`/yavayago/store?error=${encodeURIComponent(key)}#details`);
  const parsed = storeInputSchema.safeParse({
    name: text(form, 'name'),
    category: text(form, 'category'),
    about: text(form, 'about'),
    locationId: text(form, 'locationId'),
    address: text(form, 'address'),
    latitude: number(form.get('placeLatitude')),
    longitude: number(form.get('placeLongitude')),
    whatsapp: text(form, 'whatsapp'),
    hours: text(form, 'hours'),
    deliveryFee: text(form, 'deliveryFee'),
    minimumOrder: text(form, 'minimumOrder') || '0',
    prepMinutes: Number.parseInt(text(form, 'prepMinutes'), 10),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'error.validation_failed');
  const file = await oneFile(form, 'photo');
  if (file.error) return fail(file.error);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `go-store:${session.user.userId}`);
  if (!limit.allowed) return fail('go.error.rate_limited');
  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  let stored: StoredImage[] = [];
  try {
    if (file.buffer) stored = await storeImages({ ownerUserId: session.user.userId, purpose: STORE_PHOTO_PURPOSE, files: [file.buffer] });
    await db().transaction((tx) => saveStore(tx, { userId: session.user.userId, input: parsed.data, photo: stored[0] ?? null, audit }));
    return go('/yavayago/store?saved=1');
  } catch (error) {
    await discardStored(stored);
    if (isDomainError(error) && error.expose) return fail(error.messageKey);
    console.error('go store save failed:', error);
    return fail('go.error.upload');
  }
}
