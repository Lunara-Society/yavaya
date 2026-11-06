import type { CSSProperties } from 'react';
import { db } from '@/server/db/client';
import { lookEnabled } from '@/server/domains/platform/looks';
import { LOGO_MARK_WIDTHS, Mark, SunMark } from './icons';

const avif = LOGO_MARK_WIDTHS.map((w) => `/brand/logo-mark-${w}.avif ${w}w`).join(', ');
const webp = LOGO_MARK_WIDTHS.map((w) => `/brand/logo-mark-${w}.webp ${w}w`).join(', ');

/**
 * The owner's new logo (6 November 2026) as a mark: the square of it around
 * the Guardian's head, the orb and the arch, scaled and nothing else
 * (tools/cinematic/logo2_assets.py). Its sky is part of the picture, so it is
 * shown as a tile with rounded corners rather than cut out.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <picture className="brand-logo" style={{ '--logo-size': `${size}px` } as CSSProperties}>
      <source type="image/avif" srcSet={avif} sizes={`${size}px`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img src="/brand/logo-mark-96.webp" srcSet={webp} sizes={`${size}px`} width={size} height={size} alt="" decoding="async" />
    </picture>
  );
}

/**
 * The site's mark wherever the brand appears: the new logo while the owner's
 * "logo" switch is on (Admin → Diseño del sitio), otherwise the seal (or the
 * sun, in the home page's header) exactly as before.
 */
export async function BrandMark({ size, home = false }: { size?: number; home?: boolean }) {
  if (await lookEnabled(db(), 'logo')) return <LogoMark size={size ?? (home ? 44 : 40)} />;
  return home ? <SunMark size={size} /> : <Mark size={size} />;
}
