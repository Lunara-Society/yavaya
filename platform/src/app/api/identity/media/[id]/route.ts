import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { readActiveImage } from '@/server/domains/media/service';
import { identityPhotoAccess } from '@/server/domains/identity/studio';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A member's own profile photo, served only to whom they chose.
 *
 * The general media route never serves these (PRIVATE_MEDIA_PURPOSES). Here
 * the owner always sees their photos, drafts included; anyone else only a
 * photo the published profile uses, and a members-only one only when signed
 * in. Knowing the address is not enough. Every refusal is the same 404, so
 * the route never confirms that a photo exists.
 *
 * Caching follows who may see it: a public photo may be kept by any cache
 * for a while, a members-only or draft photo only by the viewer's own
 * browser, and briefly — a member who hides a photo should not wait a day.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!UUID.test(id)) return missing();

  const session = await currentSession();
  const access = await identityPhotoAccess(db(), { mediaId: id, viewerUserId: session?.user.userId ?? null });
  if (!access) return missing();

  const image = await readActiveImage(db(), id, { allowPrivate: true });
  if (!image) return missing();

  // Short even when public: a member can make their photo members-only at any
  // moment, and a shared cache must not go on handing it out for long after.
  const cache = access === 'public' ? 'public, max-age=300' : 'private, max-age=300';
  return new Response(new Uint8Array(image.body), {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.body.length),
      'Cache-Control': cache,
      // The answer depends on who asks.
      Vary: 'Cookie',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
