import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import type { MessageKey } from '@/i18n';
import { getTranslator } from '@/i18n/server';
import { db } from '@/server/db/client';
import { getLostFound } from '@/server/domains/animals/lost-found';
import { readActiveImage } from '@/server/domains/media/service';
import { siteUrl } from '@/server/seo';
import { formatDate } from '@/ui/mercadito/format';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A lost or found animal's poster (docs/DISTRICT-FOCUS.md, "SE BUSCA"): the
 * notice as one portrait image, made to be forwarded to WhatsApp groups the
 * way such posters already travel, and the page's own preview when its link
 * is shared.
 *
 * Only what the public page already shows, as a visitor sees it: the photo,
 * the name or species, the place and the day, the start of the description,
 * and the page's address. Never the WhatsApp number, which the page gives
 * only to signed-in members (a number on a poster invites the ransom scam).
 * Only open notices have one: a closed or removed notice answers 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const { t, locale } = await getTranslator();
  const found = await getLostFound(db(), { postId: id, viewerId: null, viewerIsReviewer: false, locale });
  if (!found || found.post.status !== 'open') return new Response('Not found', { status: 404 });
  const { post, photos } = found;
  const lost = post.kind === 'lost';

  // The first photo, cropped to the frame and re-encoded as JPEG (the renderer reads JPEG and PNG); none, and the species stands in.
  let photo: string | null = null;
  const image = photos[0] ? await readActiveImage(db(), photos[0]) : null;
  if (image) {
    const jpeg = await sharp(image.body).rotate().resize(912, 672, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    photo = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }
  const species = t(`animals.species.${post.species}` as MessageKey);
  const seen = formatDate(new Date(`${post.seenOn}T12:00:00Z`), locale);
  const description = post.description.length > 150 ? `${post.description.slice(0, 147).trimEnd()}…` : post.description;
  const address = `${siteUrl().replace(/^https?:\/\//, '')}/animals/lost/${post.id}`;
  // Obsidian with the district's own colour: red for a lost animal, green for a found one.
  const accent = lost ? '#e0533d' : '#3fbf7f';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0b0a10', color: '#f6eedd', padding: '48px 60px' }}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'center', padding: '18px 0', borderRadius: 28, background: accent, color: '#0b0a10', fontSize: 120, fontWeight: 800, letterSpacing: 4 }}>
          {t(lost ? 'animals.poster.lost_title' : 'animals.poster.found_title')}
        </div>
        <div style={{ display: 'flex', marginTop: 32, width: 760, height: 560, borderRadius: 32, overflow: 'hidden', border: `6px solid ${accent}`, background: '#16141d', alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <img src={photo} width={760} height={560} style={{ objectFit: 'cover' }} alt="" /> : <div style={{ display: 'flex', fontSize: 72, color: '#bfb3a0' }}>{species}</div>}
        </div>
        <div style={{ display: 'flex', marginTop: 30, fontSize: 70, fontWeight: 800, textAlign: 'center' }}>{post.name ?? species}</div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 36, color: '#e6cf9c' }}>
          {species} · {post.placeName}
        </div>
        <div style={{ display: 'flex', marginTop: 6, fontSize: 32, color: '#cfc6b6' }}>{t(lost ? 'animals.lost.since' : 'animals.lost.found_on', { date: seen })}</div>
        <div style={{ display: 'flex', marginTop: 16, marginBottom: 24, fontSize: 29, lineHeight: 1.35, color: '#e8e0d0', textAlign: 'center', maxWidth: 900 }}>{description}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto', width: '100%', paddingTop: 22, borderTop: '2px solid rgba(230, 207, 156, 0.35)' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700 }}>{t(lost ? 'animals.poster.lost_call' : 'animals.poster.found_call')}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 30, color: '#e6cf9c' }}>{address}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { 'cache-control': 'public, max-age=300' } },
  );
}
