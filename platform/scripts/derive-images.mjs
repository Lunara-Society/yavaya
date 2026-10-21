#!/usr/bin/env node
/**
 * Derives the smaller image sizes the pages ask for from the largest file of
 * each image, so a phone downloads what it can show and no more.
 *
 *   node scripts/derive-images.mjs
 *
 * Idempotent: it rewrites the derived files from their sources every time.
 * Sources are never touched.
 *
 * - District photographs (/art/<district>-1920.webp) gain 400w and 800w: the
 *   home page shows them two to a row on a phone, and a district page's header
 *   on a 2× phone wants about 800px, which used to fall through to 1200.
 * - The seal (/brand/seal-768.webp) gains 512w: the hero shows it at 148–240px,
 *   which on a 2× screen picked the 210 KB 768px file.
 * - Each guide film's poster (/guide/<key>-v<n>.jpg, 1280×720 JPEG) gains WebP
 *   copies at 640, 960 and 1280. The JPEG stays: it is what search engines and
 *   link previews are given.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Photographs: 74 keeps skin and stone textures clean at a third of the bytes of the originals' setting. */
const PHOTO = { quality: 74, effort: 6, smartSubsample: true };
/** The seal is fine engraving and gold text: it gets more. */
const SEAL = { quality: 82, effort: 6, smartSubsample: true };

async function derive(source, target, width, options) {
  const info = await sharp(source).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' }).webp(options).toFile(target);
  console.log(`${path.relative(root, target).padEnd(36)} ${String(info.width).padStart(4)}×${String(info.height).padEnd(4)} ${(info.size / 1024).toFixed(0).padStart(4)} KB`);
}

const art = path.join(root, 'art');
for (const file of (await readdir(art)).filter((f) => f.endsWith('-1920.webp'))) {
  const name = file.replace('-1920.webp', '');
  for (const width of [400, 800]) await derive(path.join(art, file), path.join(art, `${name}-${width}.webp`), width, PHOTO);
}

const brand = path.join(root, 'brand');
await derive(path.join(brand, 'seal-768.webp'), path.join(brand, 'seal-512.webp'), 512, SEAL);

const guide = path.join(root, 'guide');
for (const file of (await readdir(guide)).filter((f) => /-v\d+\.jpg$/.test(f))) {
  const name = file.replace(/\.jpg$/, '');
  for (const width of [640, 960, 1280]) await derive(path.join(guide, file), path.join(guide, `${name}-${width}.webp`), width, PHOTO);
}
