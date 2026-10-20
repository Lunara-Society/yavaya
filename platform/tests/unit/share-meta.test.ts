import { describe, expect, it } from 'vitest';
import { previewMetadata } from '@/ui/site/share-meta';

describe('Link previews', () => {
  it('uses the item’s own photo, as the JPEG preview card', () => {
    const meta = previewMetadata({ title: 'Bicicleta · C$ 4,500', description: 'Managua — Casi nueva', imageId: 'cea0e218-38ae-4100-8da2-c65c30657091', alt: 'Bicicleta' });
    expect(meta.openGraph).toMatchObject({
      title: 'Bicicleta · C$ 4,500',
      siteName: 'Yavaya',
      images: [{ url: '/media/cea0e218-38ae-4100-8da2-c65c30657091/preview', width: 1200, height: 630, alt: 'Bicicleta' }],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: ['/media/cea0e218-38ae-4100-8da2-c65c30657091/preview'] });
  });

  it('falls back to the Yavaya card, and keeps the description to one tidy line', () => {
    const meta = previewMetadata({ title: 'Iglesia Luz del Valle', description: `Una congregación\n\n pequeña ${'y familiar '.repeat(30)}` });
    expect((meta.openGraph?.images as Array<{ url: string }>)[0]?.url).toBe('/og.jpg');
    expect(meta.description).toMatch(/^Una congregación pequeña y familiar/);
    expect((meta.description as string).length).toBeLessThanOrEqual(160);
    expect(meta.description).not.toMatch(/\s{2}|\n/);
  });
});
