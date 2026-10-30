#!/usr/bin/env node
/**
 * Writes the home page's photographs from the 4x masters (extract.py).
 *
 *   cd platform && node ../tools/cinematic/build.mjs
 *
 * Each master is the mockup's own region, its overlays rebuilt and enlarged
 * 4x: these are not native photographs at these sizes, and the widths below
 * never go past the master's. The files land in platform/public/art beside
 * the rest of Yavaya's photographs, at the widths ui/site/art.tsx offers (a
 * test holds the two together).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.join(here, '..', '..', 'platform');
const sharp = createRequire(path.join(platform, 'package.json'))('sharp');
const ART = path.join(platform, 'public', 'art');

/** Photographs at 76: a little above the site's 74, for the large skies of the hero and the guide. */
const PHOTO = { quality: 76, effort: 6, smartSubsample: true };

/**
 * A district card shows only the top of its photograph: the mockup's text
 * panel covered the rest, and the card draws its own panel there. 114 rows of
 * a first-row card and 100 of a second-row card, in mockup pixels, stop just
 * above where the panel's lettering began.
 */
const DISTRICT_TOP = { mercadito: 114, services: 114, work: 114, yavayago: 114, community: 100, sanctuary: 100, animals: 100 };

const JOBS = [
  { master: 'hero', name: 'home-hero', widths: [960, 1600, 2560, 3840] },
  { master: 'mercadito', name: 'home-mercadito', widths: [640, 960, 1280, 1920] },
  { master: 'guide', name: 'home-guide', widths: [960, 1600, 2560, 3784] },
  ...Object.entries(DISTRICT_TOP).map(([id, rows]) => ({ master: `district-${id}`, name: `home-d-${id}`, widths: [400, 640, 920], topRows: rows })),
];

for (const job of JOBS) {
  const file = path.join(here, 'masters', `${job.master}-x4.png`);
  let image = sharp(file);
  const meta = await image.metadata();
  if (job.topRows) image = sharp(await image.extract({ left: 0, top: 0, width: meta.width, height: job.topRows * 4 }).png().toBuffer());
  const source = await image.png().toBuffer();
  const { width: masterWidth } = await sharp(source).metadata();
  for (const width of job.widths) {
    if (width > masterWidth) throw new Error(`${job.name}: ${width} is wider than its master (${masterWidth}); never enlarged`);
    const target = path.join(ART, `${job.name}-${width}.webp`);
    const info = await sharp(source).resize({ width, kernel: 'lanczos3' }).webp(PHOTO).toFile(target);
    console.log(`${path.basename(target).padEnd(30)} ${String(info.width).padStart(4)}×${String(info.height).padEnd(4)} ${(info.size / 1024).toFixed(0).padStart(4)} KB`);
  }
}
