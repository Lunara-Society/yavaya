import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import type { MessageKey } from '@/i18n';
import { getTranslator } from '@/i18n/server';
import { districtBySlug } from '@/config/districts';
import { siteUrl } from '@/server/seo';

/**
 * A district's link preview (docs/DISTRICT-FOCUS.md): its own photograph, its
 * name and its promise, 1200 × 630, so a district shared on WhatsApp shows
 * which door it opens instead of the generic Yavaya card. The photographs are
 * the district's illustration, the same the site shows (and says so in its
 * footer); nothing here is a member's.
 *
 * Only the fifteen districts have one; anything else answers 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const district = /^[a-z]{3,20}$/.test(slug) ? districtBySlug(slug) : null;
  if (!district) return new Response('Not found', { status: 404 });
  const { t } = await getTranslator();

  // The website districts' own photograph, or the board districts' card picture: both are served from /public/art.
  let photo: string | null = null;
  for (const file of [`${slug}-1200.webp`, `home-card-${slug}-960.webp`]) {
    try {
      const jpeg = await sharp(await readFile(path.join(process.cwd(), 'public', 'art', file))).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
      photo = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      break;
    } catch {
      // Not this file; the next, or the card without a photograph.
    }
  }
  const host = siteUrl().replace(/^https?:\/\//, '');

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a10', color: '#f6eedd' }}>
        {photo ? <img src={photo} width={1200} height={630} style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} alt="" /> : null}
        {/* The renderer draws gradients as a background image, not as a background. */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, display: 'flex', backgroundImage: 'linear-gradient(90deg, rgba(11,10,16,0.96) 0%, rgba(11,10,16,0.86) 42%, rgba(11,10,16,0.2) 100%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 72px', width: 760, textShadow: '0 2px 18px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 6, color: '#e6cf9c' }}>YAVAYA</div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: 92, fontWeight: 700, lineHeight: 1.02 }}>{t(district.nameKey as MessageKey)}</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 38, lineHeight: 1.25, color: '#efe6d4' }}>{t(district.taglineKey as MessageKey)}</div>
          <div style={{ display: 'flex', marginTop: 34, fontSize: 28, color: '#e6cf9c' }}>
            {host}/{slug}
          </div>
        </div>
        {/* The same label every photograph with people carries on the site. */}
        {photo ? <div style={{ position: 'absolute', right: 28, bottom: 26, display: 'flex', padding: '6px 14px', borderRadius: 999, background: 'rgba(11,10,16,0.62)', color: '#f6eedd', fontSize: 20, letterSpacing: 2 }}>{t('art.note')}</div> : null}
      </div>
    ),
    { width: 1200, height: 630, headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' } },
  );
}
