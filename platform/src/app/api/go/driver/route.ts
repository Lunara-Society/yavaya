import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { applyDriver, driverInputSchema, DRIVER_DOCUMENT_PURPOSE, DRIVER_PHOTO_PURPOSE } from '@/server/domains/go/service';
import { go, oneFile, sameOrigin, text } from '../upload';

/** Applying to drive: details, a clear face photo, and an identity document only reviewers see. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return go('/yavayago/driver');
  const session = await currentSession();
  if (!session) return go('/login?next=/yavayago/driver');
  const form = await request.formData();
  const fail = (key: string) => go(`/yavayago/driver?error=${encodeURIComponent(key)}#apply`);
  const parsed = driverInputSchema.safeParse({
    vehicleType: text(form, 'vehicleType'),
    vehicleDescription: text(form, 'vehicleDescription'),
    plate: text(form, 'plate'),
    locationId: text(form, 'locationId'),
    whatsapp: text(form, 'whatsapp'),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'error.validation_failed');
  const photo = await oneFile(form, 'photo');
  const document = await oneFile(form, 'document');
  if (photo.error || document.error) return fail((photo.error ?? document.error)!);
  if (form.get('consent') !== 'on') return fail('go.error.driver_consent');
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `go-driver:${session.user.userId}`);
  if (!limit.allowed) return fail('go.error.rate_limited');
  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  const stored: StoredImage[] = [];
  try {
    const [face] = photo.buffer ? await storeImages({ ownerUserId: session.user.userId, purpose: DRIVER_PHOTO_PURPOSE, files: [photo.buffer] }) : [];
    if (face) stored.push(face);
    const [doc] = document.buffer ? await storeImages({ ownerUserId: session.user.userId, purpose: DRIVER_DOCUMENT_PURPOSE, files: [document.buffer] }) : [];
    if (doc) stored.push(doc);
    await db().transaction((tx) => applyDriver(tx, { userId: session.user.userId, input: parsed.data, photo: face ?? null, document: doc ?? null, audit }));
    return go('/yavayago/driver?applied=1');
  } catch (error) {
    await discardStored(stored);
    if (isDomainError(error) && error.expose) return fail(error.messageKey);
    console.error('go driver apply failed:', error);
    return fail('go.error.upload');
  }
}
