import { db } from '@/server/db/client';
import { readActiveImage } from '@/server/domains/media/service';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A photo as a link-preview card: 1200×630 JPEG, cropped around what matters.
 *
 * What WhatsApp, Facebook and the rest show when someone shares a listing,
 * a store or an animal. Stored photos are WebP, which not every preview
 * fetcher draws; JPEG is the one every one of them does. Same rules as
 * `/media/[id]`: only active, public images (`readActiveImage`), so a photo
 * taken down stops appearing in new previews at once.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });

  const image = await readActiveImage(db(), id);
  if (!image) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  // Imported here: sharp's native loader must not load with the module graph.
  const { default: sharp } = await import('sharp');
  const card = await sharp(image.body).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(card), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(card.length),
      'Cache-Control': 'public, max-age=86400',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
