/**
 * Yavaya's imagery.
 *
 * Two layers. Photography carries the life of each district — a sale in the
 * street, a courier at a grandmother's door, a congregation, a family and
 * its new dog — and the places around it.
 * Over it, drawn in code, the marks of something official and lasting: the
 * guilloché seal and ornamental rules of a banknote or a certificate, which
 * is what "government-level trust, private-bank quality" (Master Bible)
 * looks like.
 *
 * The photographs are illustrative scenes made for Yavaya (see
 * docs/CONFIGURATION.md, "Imagery"). The people in them are not members: they
 * never carry a name, a rating, a price or a listing; the footer says the
 * photographs are illustrative, and each photograph with people in it says so
 * where it is seen (ArtNote). All imagery is decorative and hidden from
 * assistive technology.
 */

import type { DistrictId } from './blocks';
import { HeroFilm } from './hero-film';

// --- Deterministic helpers -----------------------------------------------------

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A guilloché rosette: the interlaced curve printed on banknotes and
 * certificates because it is hard to forge. A hypotrochoid, modulated.
 */
export function rosettePath(options: {
  cx: number;
  cy: number;
  radius: number;
  lobes: number;
  depth: number;
  turns?: number;
  steps?: number;
  phase?: number;
}): string {
  const { cx, cy, radius, lobes, depth } = options;
  const turns = options.turns ?? 1;
  const steps = options.steps ?? 720;
  const phase = options.phase ?? 0;
  /*
   * Written as small relative steps ("l1.2-3.4 …") between the same rounded
   * points an absolute path would use: it draws identically, pixel for pixel,
   * in 70% of the characters and half the compressed bytes. Fewer points was
   * tried and changes the engraving — the lobes need about twenty each.
   */
  let px = 0;
  let py = 0;
  let d = '';
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const r = radius * (1 - depth + depth * Math.cos(lobes * t + phase));
    const x = r1(cx + r * Math.cos(t));
    const y = r1(cy + r * Math.sin(t));
    if (i === 0) d = `M${x} ${y}l`;
    else d += `${i > 1 ? ' ' : ''}${r1(x - px)} ${r1(y - py)}`.replace(/ -/g, '-');
    px = x;
    py = y;
  }
  return `${d}z`;
}

/**
 * The rosettes in use, by name. Each is tens of thousands of points, so it is
 * served once as an SVG file (`/seal/<name>.svg`, cached by the browser) and
 * painted through a CSS mask — drawn inline, the same paths went out twice
 * per page (in the HTML and in the React payload) and made the home page
 * over a megabyte of markup. A mask keeps `currentColor`, so the seal still
 * takes its colour from the stylesheet.
 */
export const GUILLOCHE_VARIANTS = {
  hero: { size: 520, lobes: 36, rings: 12, strokeWidth: 0.45 },
  band: { size: 600, lobes: 40, rings: 12, strokeWidth: 0.4 },
  idcard: { size: 360, lobes: 30, rings: 9, strokeWidth: 0.5 },
} as const;

export type GuillocheVariant = keyof typeof GUILLOCHE_VARIANTS;

/** A banknote rosette as a standalone SVG document: many phased curves laid over each other. */
export function guillocheSvg(variant: GuillocheVariant): string {
  const { size, lobes, rings, strokeWidth } = GUILLOCHE_VARIANTS[variant];
  const c = size / 2;
  const paths: string[] = [];
  for (let i = 0; i < rings; i += 1) {
    const shift = (i / rings) * ((Math.PI * 2) / lobes);
    paths.push(rosettePath({ cx: c, cy: c, radius: c * 0.95, lobes, depth: 0.05, phase: shift * lobes }));
    paths.push(rosettePath({ cx: c, cy: c, radius: c * 0.8, lobes: lobes + 6, depth: 0.07, phase: -shift * (lobes + 6) }));
    paths.push(rosettePath({ cx: c, cy: c, radius: c * 0.58, lobes: Math.round(lobes * 0.75), depth: 0.1, phase: shift * lobes * 0.75 }));
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `<g fill="none" stroke="#000" stroke-width="${strokeWidth}">`,
    ...paths.map((d) => `<path d="${d}"/>`),
    `<circle cx="${c}" cy="${c}" r="${c * 0.99}" stroke-width="${strokeWidth * 1.6}"/>`,
    `<circle cx="${c}" cy="${c}" r="${c * 0.93}"/>`,
    `<circle cx="${c}" cy="${c}" r="${c * 0.36}" stroke-width="${strokeWidth * 1.4}"/>`,
    '</g></svg>',
  ].join('');
}

/** A banknote rosette, in the colour of its `color`. Size and position come from `className`; `maxWidth` matches what the stylesheet gives an inline svg. */
export function Guilloche({ variant, className }: { variant: GuillocheVariant; className?: string }) {
  const mask = `url(/seal/${variant}.svg) center / contain no-repeat`;
  return <span className={className} aria-hidden="true" style={{ display: 'block', maxWidth: '100%', aspectRatio: '1 / 1', backgroundColor: 'currentColor', WebkitMask: mask, mask }} />;
}

/** A thin ornamental band — the rule between sections of a certificate. */
export function OrnamentRule({ className }: { className?: string }) {
  const width = 1200;
  const wave = (amplitude: number, period: number, phase: number) => {
    const points: string[] = [];
    for (let x = 0; x <= width; x += 4) {
      points.push(`${x},${r1(12 + amplitude * Math.sin((x / period) * Math.PI * 2 + phase))}`);
    }
    return `M${points.join('L')}`;
  };
  return (
    <svg className={className} viewBox={`0 0 ${width} 24`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.7" vectorEffect="non-scaling-stroke">
        <path d={wave(7, 60, 0)} />
        <path d={wave(7, 60, Math.PI)} />
        <path d={wave(4, 30, Math.PI / 2)} opacity="0.6" />
      </g>
    </svg>
  );
}

// --- Photography ---------------------------------------------------------------

/** The widths each photograph is published at (public/art). A test holds the files to these lists. */
export const HERO_WIDTHS = [960, 1600, 2560];
export const DISTRICT_WIDTHS = [400, 640, 800, 1200, 1920];

function srcSet(name: string, widths: number[]): string {
  return widths.map((width) => `/art/${name}-${width}.webp ${width}w`).join(', ');
}

/**
 * The phone crop of the home page's market: 3:4, the street and the church,
 * cut from market-2560 at x 1063–2128, y 8–1428. The film (hero-film.tsx) is
 * cut to exactly the same rectangle, so its first frame lands on this picture;
 * re-cut one and the other has to follow, or the picture jumps as the film
 * fades in.
 */
export const MARKET_TALL_WIDTHS = [640, 800];

/**
 * The home page's photographs from the owner's design of 30 October 2026
 * (tools/cinematic): each is that design's own picture with its words and
 * buttons rebuilt away and enlarged 4x, so the widths stop at what the
 * enlargement holds — they are not native photographs at these sizes.
 */
export const HOME_HERO_WIDTHS = [960, 1600, 2560, 3840];
export const HOME_MERCADITO_WIDTHS = [640, 960, 1280, 1920];
export const HOME_GUIDE_WIDTHS = [960, 1600, 2560, 3784];
export const HOME_DISTRICT_WIDTHS = [400, 640, 920];

/**
 * The home page's first picture: a market street in a colonial town at
 * sunset, lanterns lit, the church and the volcano at the end of it. A wide
 * screen gets the design's own street (home-hero); a phone keeps its upright
 * crop of the earlier market (market-tall), because there the scene comes
 * alive when the visit can afford it (hero-film.tsx) and the film starts on
 * exactly that picture. People are in both, so it carries the "Ilustración"
 * note.
 */
export function MarketScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <picture>
        <source media="(max-width: 699px)" srcSet={srcSet('market-tall', MARKET_TALL_WIDTHS)} sizes="100vw" />
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
        <img
          className="hm-photo"
          src="/art/home-hero-1600.webp"
          srcSet={srcSet('home-hero', HOME_HERO_WIDTHS)}
          sizes="100vw"
          width={1600}
          height={684}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <HeroFilm />
      <ArtNote />
    </div>
  );
}

/** The night landscape — volcano, lake, a lit town, the moon — behind the footer. Never the first thing loaded. */
export function NightScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img src="/art/hero-960.webp" srcSet={srcSet('hero', HERO_WIDTHS)} sizes="100vw" width={1600} height={900} alt="" loading="lazy" decoding="async" />
    </div>
  );
}

const DISTRICT_SIZES = '(min-width: 1000px) 40vw, (min-width: 640px) 50vw, 100vw';

/**
 * "Ilustración", in a corner of a photograph with people in it, so nobody
 * takes them for members. The word comes from the dictionary through the
 * --art-note custom property the root layout sets, which lets these image
 * components stay free of a translator. Positioned against the photograph's
 * container (site.css, .art-note).
 */
function ArtNote() {
  return <span className="art-note" aria-hidden="true" />;
}

/** The page photographs with people in them; the rest are places. */
const PEOPLE_PHOTOS: ReadonlySet<string> = new Set(['districts', 'trust', 'reputation', 'tokens', 'sanctuary']);

/**
 * A district's photograph, for its gateway, its page and its header. `sizes`
 * says how wide it is shown where that differs from the usual (the home
 * page's doors, two to a row on a phone), so the browser picks the file that
 * fits instead of one twice the size.
 */
export function DistrictScene({ id, className, priority, sizes = DISTRICT_SIZES }: { id: DistrictId; className?: string; priority?: boolean; sizes?: string }) {
  // Every district photograph has people in it.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className={className ? `district-photo ${className}` : 'district-photo'}
        src={`/art/${id}-1200.webp`}
        srcSet={srcSet(id, DISTRICT_WIDTHS)}
        sizes={sizes}
        width={1200}
        height={675}
        alt=""
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <ArtNote />
    </>
  );
}

/**
 * The home page's Mercadito feature: an artisan at her stall among woven bags
 * and pottery — what Mercadito is for, from the person selling.
 */
export function ArtisanScene({ sizes }: { sizes: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className="district-photo"
        src="/art/home-mercadito-960.webp"
        srcSet={srcSet('home-mercadito', HOME_MERCADITO_WIDTHS)}
        sizes={sizes}
        width={1920}
        height={872}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <ArtNote />
    </>
  );
}

/** The video guide's banner: the old town from above at sunset, the volcano behind, someone looking out over it. */
export function GuideScene() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className="hm-guide-photo"
        src="/art/home-guide-1600.webp"
        srcSet={srcSet('home-guide', HOME_GUIDE_WIDTHS)}
        sizes="(min-width: 1440px) 1216px, (min-width: 1160px) 1100px, 100vw"
        width={1600}
        height={362}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <ArtNote />
    </>
  );
}

/**
 * A district's window on the home page: the design's own picture for it,
 * wider than tall, since the card's panel sits below it. Its gateway, page
 * and header keep the district's full photograph (DistrictScene).
 */
export function HomeDistrictScene({ id, sizes }: { id: DistrictId; sizes: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className="district-photo"
        src={`/art/home-d-${id}-640.webp`}
        srcSet={srcSet(`home-d-${id}`, HOME_DISTRICT_WIDTHS)}
        sizes={sizes}
        width={920}
        height={HOME_DISTRICT_HEIGHT[id]}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <ArtNote />
    </>
  );
}

/** Heights of the 920-wide files: the first row's pictures are about 2:1, the second row's about 3:1. */
const HOME_DISTRICT_HEIGHT: Record<DistrictId, number> = { mercadito: 456, services: 454, work: 454, yavayago: 456, community: 296, sanctuary: 296, animals: 295 };

/** Photographs that sit behind a page's header, full-bleed. */
export const PAGE_PHOTOS = ['districts', 'trust', 'reputation', 'tokens', 'roadmap', 'street', 'transparency', 'status', 'sanctuary', 'sanctuary-church', 'sanctuary-word'] as const;
export type PagePhoto = (typeof PAGE_PHOTOS)[number];

export function PageScene({ name, className }: { name: PagePhoto; className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className="page-photo"
        src={`/art/${name}-1600.webp`}
        srcSet={srcSet(name, HERO_WIDTHS)}
        sizes="100vw"
        width={1600}
        height={900}
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      {PEOPLE_PHOTOS.has(name) ? <ArtNote /> : null}
    </div>
  );
}
