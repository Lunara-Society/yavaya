import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { readDraftPhoto } from '@/server/domains/roxi/drafts';

export const dynamic = 'force-dynamic';

/**
 * A photo of a listing Roxi drafted, for the member who sent it and nobody
 * else (the public /media route never serves it: PRIVATE_MEDIA_PURPOSES).
 * Once the listing is published the photo is a listing photo, served by
 * /media like any other, and this address stops answering.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const image = await readDraftPhoto(db(), { userId: session.user.userId, mediaId: (await params).id });
  if (!image) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(image.body), {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.body.length),
      // Its owner's alone: never in a shared cache.
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
