import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { candleView } from '@/server/domains/sanctuary/candles';
import { siteUrl } from '@/server/seo';

/**
 * A candle's link preview (docs/sanctuary/CANDLE.md), 1200 × 630: the lit
 * candle from the film and "a candle lit for you", with the name it was lit
 * for — so what arrives on WhatsApp already says what it is.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, locale } = await getTranslator();
  const candle = await candleView(db(), { id, locale });
  if (!candle) return new Response('Not found', { status: 404 });
  const still = `data:image/jpeg;base64,${(await readFile(path.join(process.cwd(), 'public', 'velas', 'og.jpg'))).toString('base64')}`;
  const host = siteUrl().replace(/^https?:\/\//, '');
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#070504', color: '#f6eedd' }}>
        <img src={still} width={1200} height={630} style={{ position: 'absolute', left: 0, top: 0 }} alt="" />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 72px', width: 640, textShadow: '0 2px 22px rgba(0,0,0,0.7)' }}>
          <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, color: '#e6cf9c' }}>YAVAYA · SANTUARIO</div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 68, fontWeight: 700, lineHeight: 1.06 }}>{t('sanctuary.candle.og_line')}</div>
          {candle.forName ? <div style={{ display: 'flex', marginTop: 18, fontSize: 44, color: '#f3d77b' }}>{t('sanctuary.candle.for_line', { name: candle.forName })}</div> : null}
          <div style={{ display: 'flex', marginTop: 30, fontSize: 28, color: '#e6cf9c' }}>{host}</div>
        </div>
      </div>
    ),
    // Short caching: a report hides the name, and the preview should follow.
    { width: 1200, height: 630, headers: { 'cache-control': 'public, max-age=300, s-maxage=600' } },
  );
}
