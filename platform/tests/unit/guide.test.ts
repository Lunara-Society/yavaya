import { describe, expect, it } from 'vitest';
import { GUIDE_CHAPTERS, GUIDE_KEYS, GUIDE_SECONDS, GUIDE_VERSION, guideFiles, guideObjectKey } from '@/config/guide';

describe('guide videos', () => {
  it('serves only the listed films, at the current version', () => {
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION}.mp4`)).toBe(`guide/mercadito-v${GUIDE_VERSION}.mp4`);
    expect(guideObjectKey(`guia-v${GUIDE_VERSION}-720.mp4`)).toBe(`guide/guia-v${GUIDE_VERSION}-720.mp4`);
    // not a window into the bucket
    expect(guideObjectKey('../media/abc.webp')).toBeNull();
    expect(guideObjectKey('secret-v1.mp4')).toBeNull();
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION + 1}.mp4`)).toBeNull();
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION}.mp4.bak`)).toBeNull();
    expect(guideObjectKey(`Mercadito-v${GUIDE_VERSION}.mp4`)).toBeNull();
  });

  it('names every file it links to so the route will serve it', () => {
    for (const key of GUIDE_KEYS) {
      const files = guideFiles(key);
      expect(guideObjectKey(files.hd.replace('/video/', ''))).not.toBeNull();
      expect(guideObjectKey(files.sd.replace('/video/', ''))).not.toBeNull();
      expect(GUIDE_SECONDS[key]).toBeGreaterThan(0);
    }
  });

  it('lists chapters in order, inside the full guide', () => {
    const at = GUIDE_CHAPTERS.map((c) => c.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[0]).toBe(0);
    expect(at.at(-1)!).toBeLessThan(GUIDE_SECONDS.guia);
  });
});
