import './district-world.css';
import type { CSSProperties } from 'react';
import { db } from '@/server/db/client';
import { lookEnabled } from '@/server/domains/platform/looks';
import type { DistrictId } from '@/ui/site/blocks';
import { DISTRICT_LIGHT, DOORS_WITH_PEOPLE, WORLD_CROP, WORLD_LIGHT_BELOW, WORLD_SIZE, WORLD_WIDTHS, flSrc, flSrcSet } from './assets';

/**
 * The world behind a district's door: the first thing on the district's own
 * page, while the owner's "Mundos de los distritos" switch is on (Admin →
 * Diseño del sitio; off, the page is as it was).
 *
 * It is the door's own picture, widened into a strip, in the First Light's
 * dawn and the district's own light. A visitor who comes through the door on
 * the home page sees the door's picture settle into exactly this strip
 * (engine.tsx), so the place they chose becomes the place they are in; one
 * who arrives any other way sees it settle on its own. Below it, the
 * district's page is its own, unchanged.
 *
 * Decorative, so hidden from assistive technology; a picture with people in
 * it says "Ilustración", like every other on the site. It shows on a
 * district's front page only (`show`), not over search results.
 */
export async function DistrictWorld({ id, show = true }: { id: DistrictId; show?: boolean }) {
  if (!show || !(await lookEnabled(db(), 'worlds'))) return null;
  const crop = WORLD_CROP[id];
  const name = `world-${id}`;
  return (
    <div className="dw" data-dw={id} data-dw-below={WORLD_LIGHT_BELOW.has(id) ? 'light' : undefined} aria-hidden="true" style={{ '--dw-acc': DISTRICT_LIGHT[id] } as CSSProperties}>
      <picture className="dw-scene">
        <source type="image/avif" srcSet={flSrcSet(name, WORLD_WIDTHS, 'avif')} sizes="100vw" />
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
        <img
          src={flSrc(name, 1280)}
          srcSet={flSrcSet(name, WORLD_WIDTHS, 'webp')}
          sizes="100vw"
          width={WORLD_SIZE.width}
          height={WORLD_SIZE.height}
          alt=""
          fetchPriority="high"
          decoding="async"
          data-dw-crop={`${crop.top},${crop.height}`}
        />
      </picture>
      <i className="dw-glow" />
      <i className="dw-threshold">
        <i className="dw-run" />
      </i>
      {DOORS_WITH_PEOPLE.has(id) ? <span className="art-note" aria-hidden="true" /> : null}
    </div>
  );
}
