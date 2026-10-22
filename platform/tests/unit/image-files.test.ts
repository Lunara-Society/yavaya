import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_KEYS, guideFiles } from '@/config/guide';
import { DISTRICT_WIDTHS, HERO_WIDTHS, MARKET_TALL_WIDTHS, PAGE_PHOTOS } from '@/ui/site/art';
import { DISTRICT_IDS } from '@/ui/site/blocks';
import { SEAL_WIDTHS } from '@/ui/site/icons';

/**
 * Every file a srcset offers must exist: a browser that picks a missing size
 * shows a broken image instead of falling back to another one. The smaller
 * sizes come from scripts/derive-images.mjs.
 */
const PUBLIC = join(__dirname, '..', '..', 'public');
const missing = (paths: string[]) => paths.filter((p) => !existsSync(join(PUBLIC, p)));

describe('published image sizes', () => {
  it('has every width of every district photograph', () => {
    expect(missing(DISTRICT_IDS.flatMap((id) => DISTRICT_WIDTHS.map((w) => `art/${id}-${w}.webp`)))).toEqual([]);
  });

  it('has every width of the hero and every page photograph', () => {
    expect(missing(['hero', 'market', ...PAGE_PHOTOS].flatMap((name) => HERO_WIDTHS.map((w) => `art/${name}-${w}.webp`)))).toEqual([]);
  });

  it('has the phone crop of the home page market at every width', () => {
    expect(missing(MARKET_TALL_WIDTHS.map((w) => `art/market-tall-${w}.webp`))).toEqual([]);
  });

  it('has every width of the seal', () => {
    expect(missing(SEAL_WIDTHS.map((w) => `brand/seal-${w}.webp`))).toEqual([]);
  });

  it('has the JPEG and every WebP size of each guide poster', () => {
    const files = GUIDE_KEYS.flatMap((key) => {
      const f = guideFiles(key);
      return [f.poster, f.posterWebp, ...f.posterSet.split(', ').map((entry) => entry.split(' ')[0]!)];
    });
    expect(missing(files.map((p) => p.replace(/^\//, '')))).toEqual([]);
  });
});
