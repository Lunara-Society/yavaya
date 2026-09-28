/**
 * Yavaya's imagery.
 *
 * Two layers. Photography carries the places — volcano and lake, market,
 * plaza, city, wildlife — graded to navy, gold and each district's colour.
 * Over it, drawn in code, the marks of something official and lasting: the
 * guilloché seal and ornamental rules of a banknote or a certificate, which
 * is what "government-level trust, private-bank quality" (Master Bible)
 * looks like.
 *
 * The photographs are illustrative scenes made for Yavaya (see
 * docs/CONFIGURATION.md, "Imagery"). None shows a person, so nothing can be
 * taken for a real member, seller or listing, and the site says so in its
 * footer. All imagery is decorative and hidden from assistive technology.
 */

import type { ReactNode } from 'react';
import type { DistrictId } from './blocks';

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
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const r = radius * (1 - depth + depth * Math.cos(lobes * t + phase));
    points.push(`${r1(cx + r * Math.cos(t))},${r1(cy + r * Math.sin(t))}`);
  }
  return `M${points.join('L')}Z`;
}

/** A banknote rosette: many phased curves laid over each other. */
export function Guilloche({
  size = 400,
  lobes = 18,
  rings = 9,
  className,
  strokeWidth = 0.6,
}: {
  size?: number;
  lobes?: number;
  rings?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const c = size / 2;
  const paths: ReactNode[] = [];
  for (let i = 0; i < rings; i += 1) {
    const shift = (i / rings) * ((Math.PI * 2) / lobes);
    paths.push(<path key={`o${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.95, lobes, depth: 0.05, phase: shift * lobes })} />);
    paths.push(<path key={`m${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.8, lobes: lobes + 6, depth: 0.07, phase: -shift * (lobes + 6) })} />);
    paths.push(<path key={`i${i}`} d={rosettePath({ cx: c, cy: c, radius: c * 0.58, lobes: Math.round(lobes * 0.75), depth: 0.1, phase: shift * lobes * 0.75 })} />);
  }
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        {paths}
        <circle cx={c} cy={c} r={c * 0.99} strokeWidth={strokeWidth * 1.6} />
        <circle cx={c} cy={c} r={c * 0.93} />
        <circle cx={c} cy={c} r={c * 0.36} strokeWidth={strokeWidth * 1.4} />
      </g>
    </svg>
  );
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

const HERO_WIDTHS = [960, 1600, 2560];
const DISTRICT_WIDTHS = [640, 1200, 1920];

function srcSet(name: string, widths: number[]): string {
  return widths.map((width) => `/art/${name}-${width}.webp ${width}w`).join(', ');
}

/** The home page's night landscape: volcano, lake, a lit town, the moon. */
export function HeroScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img
        className="hero-photo"
        src="/art/hero-1600.webp"
        srcSet={srcSet('hero', HERO_WIDTHS)}
        sizes="100vw"
        width={1600}
        height={900}
        alt=""
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}

/** A district's photograph, for its gateway, its page and its header. */
export function DistrictScene({ id, className, priority }: { id: DistrictId; className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public
    <img
      className={className ? `district-photo ${className}` : 'district-photo'}
      src={`/art/${id}-1200.webp`}
      srcSet={srcSet(id, DISTRICT_WIDTHS)}
      sizes="(min-width: 1000px) 40vw, (min-width: 640px) 50vw, 100vw"
      width={1200}
      height={675}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

/** Photographs that sit behind a page's header, full-bleed. */
export const PAGE_PHOTOS = ['districts', 'trust', 'reputation', 'tokens', 'roadmap', 'street', 'transparency', 'status'] as const;
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
    </div>
  );
}
