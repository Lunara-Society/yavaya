#!/usr/bin/env node
/**
 * Builds the Identity Studio's design library from its masters.
 *
 *   cd platform && node ../tools/identity-assets/build.mjs
 *
 * For every brief in briefs.json it opens the master, measures it, writes
 * the sizes a page asks for into platform/public/identity/<collection>/,
 * reads its dominant colours, and writes the manifest the site reads
 * (platform/src/config/identity-assets.json). Nothing in the manifest is
 * typed by hand except what a person has to decide — the design's id,
 * collection, style, colours and search words — so a size can never be
 * claimed that the file does not have.
 *
 * It also refuses two designs that are near-identical (a perceptual hash),
 * so the library never pads itself with copies.
 *
 * Masters:
 *   - "sources/…"   committed: the artwork the owner supplied, and nothing else
 *                   that cannot be regenerated.
 *   - "masters/…"   rendered by render.mjs from shaders/ (deterministic, not
 *                   committed — run render.mjs first on a fresh checkout).
 *   - "vector/…"    SVG written by vector.mjs (committed; small).
 *   - "platform/public/art/…"  Yavaya's own photographs, reused in place:
 *                   only a thumbnail is written, the page sizes already exist.
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const platform = path.join(repo, 'platform');
const require = createRequire(path.join(platform, 'package.json'));
const sharp = require('sharp');

const PUBLIC = path.join(platform, 'public');
const MANIFEST = path.join(platform, 'src', 'config', 'identity-assets.json');
const NAMES = path.join(platform, 'src', 'i18n', 'dictionaries', 'identity-assets.ts');

/** Widths a page asks for, by what the design is for. 480 is the gallery thumbnail. */
const WIDTHS = { background: [480, 1280, 1920], cover: [480, 1280, 2560] };
/** Smooth gradients band at low quality; 80 keeps them clean at about a third of the bytes of 90. */
const WEBP = { quality: 80, effort: 6, smartSubsample: true };
const THUMB = { quality: 74, effort: 6, smartSubsample: true };

const briefs = JSON.parse(await readFile(path.join(here, 'briefs.json'), 'utf8'));

function resolveMaster(master) {
  if (master.startsWith('platform/')) return path.join(repo, master);
  return path.join(here, master);
}

/** k-means on a small copy: the few colours a person would name. */
async function palette(file, k = 5) {
  const { data, info } = await sharp(file).flatten({ background: '#000000' }).resize(48, 48, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i < data.length; i += info.channels) pixels.push([data[i], data[i + 1], data[i + 2]]);
  // Deterministic seeds: spread along luminance.
  const byLight = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centres = Array.from({ length: k }, (_, i) => byLight[Math.floor(((i + 0.5) / k) * byLight.length)]);
  for (let round = 0; round < 12; round += 1) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) (bestD = d), (best = i);
      });
      const s = sums[best];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3] += 1;
    }
    centres = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[i]));
  }
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return [...new Set(centres.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2])).map(hex))];
}

/** A 64-bit difference hash: designs a few bits apart are the same picture. */
async function dhash(file) {
  const { data } = await sharp(file).flatten({ background: '#000000' }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
  return bits;
}
const hamming = (a, b) => [...a].reduce((n, bit, i) => n + (bit !== b[i] ? 1 : 0), 0);

/**
 * Each design's name and description, in both languages, written into the
 * dictionaries as identity.asset.<id> and identity.asset.<id>.desc. The
 * English object is typed against the Spanish one, so a design missing a
 * translation is a compile error, as for every other word on the site.
 */
async function writeNames(list) {
  const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const entries = (lang) =>
    list.flatMap((brief) => {
      if (!brief.name?.[lang] || !brief.desc?.[lang]) throw new Error(`${brief.id}: name and desc are needed in ${lang}`);
      return [`  'identity.asset.${brief.id}': ${quote(brief.name[lang])},`, `  'identity.asset.${brief.id}.desc': ${quote(brief.desc[lang])},`];
    });
  const source = [
    '/**',
    " * Names and descriptions of the Identity Studio's designs.",
    ' *',
    ' * Written by tools/identity-assets/build.mjs from its catalogue — change them',
    ' * there and rebuild. Spread into both dictionaries (es.ts, en.ts).',
    ' */',
    'export const identityAssetsEs = {',
    ...entries('es'),
    '} as const;',
    '',
    'export const identityAssetsEn: Record<keyof typeof identityAssetsEs, string> = {',
    ...entries('en'),
    '};',
    '',
  ].join('\n');
  await writeFile(NAMES, source);
}

const assets = [];
const hashes = [];
const report = [];
for (const brief of briefs.assets) {
  const master = resolveMaster(brief.master);
  if (!existsSync(master)) {
    console.error(`missing master for ${brief.id}: ${path.relative(repo, master)} (run render.mjs or vector.mjs first)`);
    process.exitCode = 1;
    continue;
  }
  const outDir = path.join(PUBLIC, 'identity', brief.collection);
  await mkdir(outDir, { recursive: true });
  const meta = await sharp(master).metadata();
  const isVector = master.endsWith('.svg');
  let files;
  let thumb;
  let width = meta.width;
  let height = meta.height;
  if (isVector) {
    const svg = await readFile(master, 'utf8');
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (box) (width = Number(box[1])), (height = Number(box[2]));
    const target = path.join(outDir, `${brief.id}.svg`);
    await copyFile(master, target);
    const url = `/identity/${brief.collection}/${brief.id}.svg`;
    files = [{ width, url }];
    thumb = url;
  } else if (brief.reuse) {
    // Yavaya's own photograph: the page sizes already exist; only the gallery needs a small one.
    const target = path.join(outDir, `${brief.id}-480.webp`);
    await sharp(master).resize({ width: 480, kernel: 'lanczos3' }).webp(THUMB).toFile(target);
    thumb = `/identity/${brief.collection}/${brief.id}-480.webp`;
    files = [{ width: 480, url: thumb }, ...brief.reuse];
  } else {
    const widths = WIDTHS[brief.kind].filter((w, i) => w <= meta.width || i === 0);
    if (meta.width < WIDTHS[brief.kind].at(-1)) widths.push(meta.width);
    files = [];
    for (const w of [...new Set(widths)].sort((a, b) => a - b)) {
      const target = path.join(outDir, `${brief.id}-${w}.webp`);
      const info = await sharp(master).resize({ width: w, withoutEnlargement: true, kernel: 'lanczos3' }).webp(w === 480 ? THUMB : WEBP).toFile(target);
      files.push({ width: info.width, url: `/identity/${brief.collection}/${brief.id}-${w}.webp` });
      report.push(`${brief.id}-${w}.webp ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
    }
    thumb = files[0].url;
  }

  const hash = await dhash(master);
  for (const other of hashes) {
    if (hamming(hash, other.hash) <= 4 && other.kind === brief.kind) {
      console.error(`${brief.id} is nearly identical to ${other.id} — not a new design`);
      process.exitCode = 1;
    }
  }
  hashes.push({ id: brief.id, kind: brief.kind, hash });

  assets.push({
    id: brief.id,
    collection: brief.collection,
    kind: brief.kind,
    style: brief.style,
    colors: brief.colors,
    palette: await palette(master),
    tags: brief.tags ?? [],
    width,
    height,
    format: isVector ? 'svg' : 'webp',
    files,
    thumb,
    transparent: Boolean(meta.hasAlpha) || isVector,
    placement: brief.placement,
    focus: brief.focus ?? { x: 50, y: 50 },
    ...(brief.frameShape ? { frameShape: brief.frameShape } : {}),
    status: brief.status ?? 'published',
    source: brief.source,
  });
}

await writeFile(MANIFEST, JSON.stringify({ generatedBy: 'tools/identity-assets/build.mjs', assets }, null, 2) + '\n');
await writeNames(briefs.assets.filter((brief) => assets.some((asset) => asset.id === brief.id)));
for (const line of report) console.log(line);
const counts = assets.reduce((acc, a) => ((acc[a.collection] = (acc[a.collection] ?? 0) + 1), acc), {});
console.log(`\n${assets.length} designs: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
