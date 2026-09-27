import { db } from '@/server/db/client';
import { readActiveImage } from '@/server/domains/media/service';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a stored image from this origin.
 *
 * Through the application rather than a public bucket URL, for two reasons:
 * the bucket stays private, and a photo taken down by its seller or a
 * moderator stops being served at once instead of lingering at a guessable
 * address.
 *
 * An image id is never reused and its bytes never change, so it may be
 * cached for a long time — but not `immutable`, because a removed photo must
 * disappear from a browser that reloads.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });

  const image = await readActiveImage(db(), id);
  if (!image) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new Response(new Uint8Array(image.body), {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.body.length),
      'Cache-Control': 'public, max-age=86400',
      // An image response never needs to run or load anything.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
