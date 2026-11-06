import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_KEYS, guideFiles } from '@/config/guide';
import {
  DISTRICT_WIDTHS,
  HERO_WIDTHS,
  HOME_BALCONY_TALL_WIDTHS,
  HOME_BALCONY_WIDTHS,
  HOME_CARD_WIDTHS,
  HOME_DISTRICT_WIDTHS,
  HOME_GUIDE_WIDTHS,
  HOME_HERO_WIDTHS,
  HOME_MERCADITO_WIDTHS,
  HOME_SANCTUARY_EMBLEM_WIDTHS,
  HOME_VALLEY_WIDTHS,
  MARKET_TALL_WIDTHS,
  PAGE_PHOTOS,
} from '@/ui/site/art';
import { DISTRICT_IDS } from '@/ui/site/blocks';
import { HERO_FILM } from '@/ui/site/hero-film';
import { LOGO_MARK_WIDTHS, SEAL_WIDTHS, SUN_WIDTHS } from '@/ui/site/icons';

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

  it('has the phone crop of the home page market at every width, and its film', () => {
    expect(missing([...MARKET_TALL_WIDTHS.map((w) => `art/market-tall-${w}.webp`), HERO_FILM.replace(/^\//, '')])).toEqual([]);
  });

  it('has every width of the home page photographs: the street, the artisan, the guide and each district window', () => {
    const files = [
      ...HOME_HERO_WIDTHS.map((w) => `art/home-hero-${w}.webp`),
      ...HOME_MERCADITO_WIDTHS.map((w) => `art/home-mercadito-${w}.webp`),
      ...HOME_GUIDE_WIDTHS.map((w) => `art/home-guide-${w}.webp`),
      ...DISTRICT_IDS.flatMap((id) => HOME_DISTRICT_WIDTHS.map((w) => `art/home-d-${id}-${w}.webp`)),
    ];
    expect(missing(files)).toEqual([]);
  });

  it("has every width of the second design's photographs: the balcony (and its phone crop), each card, the valley and Santuario's emblem", () => {
    const files = [
      ...HOME_BALCONY_WIDTHS.map((w) => `art/home-balcony-${w}.webp`),
      ...HOME_BALCONY_TALL_WIDTHS.map((w) => `art/home-balcony-tall-${w}.webp`),
      ...DISTRICT_IDS.flatMap((id) => HOME_CARD_WIDTHS.map((w) => `art/home-card-${id}-${w}.webp`)),
      ...HOME_VALLEY_WIDTHS.map((w) => `art/home-valley-${w}.webp`),
      ...HOME_SANCTUARY_EMBLEM_WIDTHS.map((w) => `art/home-sanctuary-emblem-${w}.webp`),
    ];
    expect(missing(files)).toEqual([]);
  });

  it('has every width of the sun of the logo', () => {
    expect(missing(SUN_WIDTHS.map((w) => `brand/sun-${w}.webp`))).toEqual([]);
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
  it("has the owner's new logo: the mark at every width, both icon sets and both share cards", () => {
    const files = [
      ...LOGO_MARK_WIDTHS.flatMap((w) => [`brand/logo-mark-${w}.avif`, `brand/logo-mark-${w}.webp`]),
      'logo-favicon.ico', 'logo-icon-192.png', 'logo-icon-512.png', 'logo-icon-maskable-512.png', 'logo-apple-touch-icon.png', 'og-logo.jpg',
      'favicon.ico', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og.jpg',
    ];
    expect(missing(files)).toEqual([]);
  });
});
