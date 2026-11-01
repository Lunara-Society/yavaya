#!/usr/bin/env node
/**
 * Writes the home page's photographs and marks from the second design's 4x
 * masters (extract2.py).
 *
 *   cd platform && node ../tools/cinematic/build2.mjs
 *
 * Every master is that design's own region, its overlays rebuilt and enlarged
 * 4x: not native photographs at these sizes, and no width below goes past its
 * master's. Lands in platform/public (art/ and brand/), at the widths
 * ui/site/art.tsx and icons.tsx offer (tests/unit/image-files.test.ts holds the
 * two together).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.join(here, '..', '..', 'platform');
const sharp = createRequire(path.join(platform, 'package.json'))('sharp');
const PUBLIC = path.join(platform, 'public');
const master = (name) => path.join(here, 'masters2', `${name}-x4.png`);

/** Photographs at 76, as the first set: a little above the site's 74, for the large dusk skies. */
const PHOTO = { quality: 76, effort: 6, smartSubsample: true };
/** Marks keep their edges: near-lossless, with an alpha channel. */
const MARK = { quality: 90, alphaQuality: 100, effort: 6 };

async function widths(source, name, list, dir = 'art', options = PHOTO) {
  const { width: masterWidth } = await sharp(source).metadata();
  for (const width of list) {
    if (width > masterWidth) throw new Error(`${name}: ${width} is wider than its master (${masterWidth}); never enlarged`);
    const target = path.join(PUBLIC, dir, `${name}-${width}.webp`);
    const info = await sharp(source).resize({ width, kernel: 'lanczos3' }).webp(options).toFile(target);
    console.log(`${(dir + '/' + path.basename(target)).padEnd(40)} ${String(info.width).padStart(4)}×${String(info.height).padEnd(4)} ${(info.size / 1024).toFixed(0).padStart(4)} KB`);
  }
}

// The hero: the whole stage on a wide screen; on a phone, the right of it, where she stands (design x 600–1220).
const hero = await sharp(master('hero')).png().toBuffer();
await widths(hero, 'home-balcony', [960, 1600, 2560, 3840]);
const tall = await sharp(hero).extract({ left: 600 * 4, top: 0, width: 620 * 4, height: 494 * 4 }).png().toBuffer();
await widths(tall, 'home-balcony-tall', [640, 960, 1280]);

// The seven cards, whole: the card draws its own emblem, words and arrow back over them.
for (const id of ['mercadito', 'services', 'work', 'yavayago', 'community', 'sanctuary', 'animals']) {
  await widths(await sharp(master(`district-${id}`)).png().toBuffer(), `home-card-${id}`, [400, 640, 960]);
}

// The closing section's night valley.
await widths(await sharp(master('closing')).png().toBuffer(), 'home-valley', [960, 1600, 2560]);

/**
 * The sun of the logo: gold on the design's night sky. The sky becomes
 * transparent — each pixel's coverage is how far it rises from the sky
 * towards the sun's gold, and its colour is unmixed from the sky by that
 * much — so the mark sits on any picture without a dark square behind it.
 */
{
  const { data, info } = await sharp(master('sun')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [data[(y * info.width + x) * 3], data[(y * info.width + x) * 3 + 1], data[(y * info.width + x) * 3 + 2]];
  const corners = [px(2, 2), px(info.width - 3, 2), px(2, info.height - 3), px(info.width - 3, info.height - 3)];
  const sky = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let gold = 0;
  for (let i = 0; i < data.length; i += 3) gold = Math.max(gold, lum([data[i], data[i + 1], data[i + 2]]));
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const p = [data[i], data[i + 1], data[i + 2]];
    let a = (lum(p) - lum(sky)) / (gold * 0.82 - lum(sky));
    a = a < 0.1 ? 0 : Math.min(1, (a - 0.1) / 0.9);
    for (let c = 0; c < 3; c += 1) out[j + c] = a > 0 ? Math.max(0, Math.min(255, Math.round(sky[c] + (p[c] - sky[c]) / Math.max(a, 0.35)))) : 0;
    out[j + 3] = Math.round(a * 255);
  }
  const sun = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await widths(sun, 'sun', [96, 224], 'brand', MARK);
}

/** Santuario's round emblem: everything outside its circle (the card behind it in the design) becomes transparent. */
{
  const size = 300;
  const r = 146;
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="150" cy="150" r="${r}" fill="#fff"/></svg>`);
  const emblem = await sharp(master('sanctuary-emblem')).ensureAlpha().composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  await widths(emblem, 'home-sanctuary-emblem', [160, 300], 'art', MARK);
}
