import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { discardStored, storeImages, type StoredImage } from '@/server/domains/media/service';
import { addMenuItem, ITEM_PHOTO_PURPOSE, menuItemInputSchema } from '@/server/domains/go/service';
import { go, oneFile, sameOrigin, text } from '../upload';

/** Adding a dish or product to the menu, with an optional photo. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return go('/yavayago/store');
  const session = await currentSession();
  if (!session) return go('/login?next=/yavayago/store');
  const form = await request.formData();
  const fail = (key: string) => go(`/yavayago/store?error=${encodeURIComponent(key)}#menu`);
  const parsed = menuItemInputSchema.safeParse({ section: text(form, 'section'), name: text(form, 'name'), description: text(form, 'description'), price: text(form, 'price') });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'error.validation_failed');
  const file = await oneFile(form, 'photo');
  if (file.error) return fail(file.error);
  const limit = await consumeRateLimit(db(), RATE_LIMITS.publishStandard, `go-menu:${session.user.userId}`);
  if (!limit.allowed) return fail('go.error.rate_limited');
  let stored: StoredImage[] = [];
  try {
    if (file.buffer) stored = await storeImages({ ownerUserId: session.user.userId, purpose: ITEM_PHOTO_PURPOSE, files: [file.buffer] });
    await db().transaction((tx) => addMenuItem(tx, { userId: session.user.userId, input: parsed.data, photo: stored[0] ?? null }));
    return go('/yavayago/store?added=1#menu');
  } catch (error) {
    await discardStored(stored);
    if (isDomainError(error) && error.expose) return fail(error.messageKey);
    console.error('go menu add failed:', error);
    return fail('go.error.upload');
  }
}
