#!/usr/bin/env node
/**
 * Builds the Identity Studio's design library from its masters.
 *
 *   cd platform && node ../tools/identity-assets/render.mjs   # shader masters (not committed)
 *   cd platform && node ../tools/identity-assets/vector.mjs   # SVG masters (committed)
 *   cd platform && node ../tools/identity-assets/build.mjs
 *
 * For every design in catalog.mjs it opens the master, measures it, writes
 * the sizes a page asks for into platform/public/identity/<collection>/,
 * reads its dominant colours, and writes:
 *   - the manifest the site reads (platform/src/config/identity-assets.json)
 *   - every design's name and description, in both languages
 *     (platform/src/i18n/dictionaries/identity-assets.ts)
 * Nothing in the manifest is typed by hand except what a person decides —
 * the design's id, collection, style, colours and search words — so a size
 * can never be claimed that the file does not have.
 *
 * It refuses two designs that are the same picture (the same structure and
 * the same colours), so the library never pads itself with copies. A design
 * drawn again in another metal or colour is a variant: it stays, and the
 * summary counts the distinct drawings beside the designs.
 *
 * A size already written and newer than its master is measured, not
 * re-encoded; --force writes every size again (after changing quality).
 *
 * Masters:
 *   - sources/…               the artwork the owner supplied (committed)
 *   - masters/<id>.png        rendered by render.mjs from shaders/, 3840×2160
 *   - vector/<id>.svg         drawn by vector.mjs (committed)
 *   - platform/public/art/…   Yavaya's own photographs, reused in place:
 *                             only a thumbnail is written, the sizes exist
 */
import { readFile, writeFile, mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DESIGNS } from './catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const platform = path.join(repo, 'platform');
const sharp = createRequire(path.join(platform, 'package.json'))('sharp');

const PUBLIC = path.join(platform, 'public');
const OUT = path.join(PUBLIC, 'identity');
const MANIFEST = path.join(platform, 'src', 'config', 'identity-assets.json');
const NAMES = path.join(platform, 'src', 'i18n', 'dictionaries', 'identity-assets.ts');

/**
 * Widths a page asks for, by what the design is for: 480 for the gallery,
 * then phone, laptop and large screens, and the native 3840 for 4K displays
 * (the browser takes it only when the screen calls for it).
 */
const WIDTHS = { background: [480, 1280, 1920, 3840], cover: [480, 1280, 2560, 3840] };
/** Smooth gradients band at low quality; 80 keeps them clean at about a third of the bytes of 90. */
const WEBP = { quality: 80, effort: 6, smartSubsample: true };
/** The 4K file is seen on dense screens, where a slightly lower quality is invisible and saves a third. */
const WEBP_4K = { quality: 74, effort: 6, smartSubsample: true };
const THUMB = { quality: 74, effort: 6, smartSubsample: true };
const force = process.argv.includes('--force');

/** True when the file exists and was written after its master changed. */
async function fresh(target, master) {
  if (force || !existsSync(target)) return false;
  return (await stat(target)).mtimeMs >= (await stat(master)).mtimeMs;
}

function masterOf(design) {
  if (design.shader) return path.join(here, 'masters', `${design.id}.png`);
  if (design.vector) return path.join(here, 'vector', `${design.id}.svg`);
  if (design.master.startsWith('platform/')) return path.join(repo, design.master);
  return path.join(here, design.master);
}

/** k-means on a small copy: the few colours a person would name. */
async function palette(file, k = 5) {
  const { data, info } = await sharp(file, { density: 96 }).flatten({ background: '#000000' }).resize(48, 48, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
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

/**
 * A fingerprint of a picture, read through its transparency: a 1024-bit
 * difference hash of its structure (luminance over neutral grey, so empty
 * space is the same in every design) and the colour of each cell of an 8×8
 * grid, weighted by how opaque it is (null where the cell is empty).
 *
 * Averaging colour over the whole picture is not enough: a gold frame and a
 * silver frame are mostly empty space, and their averages are nearly equal.
 * Two designs are the same picture only when their structure matches and no
 * cell differs in colour — the same ring drawn in silver instead of gold
 * differs by more than 50 in every cell the ring crosses, and is a variant.
 */
async function fingerprint(file) {
  const S = 64;
  const { data } = await sharp(file, { density: 144 }).ensureAlpha().resize(S, S, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const lum = new Float64Array(S * S);
  for (let i = 0; i < S * S; i += 1) {
    const a = data[i * 4 + 3] / 255;
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 128 * (1 - a);
  }
  const N = 32;
  const box = (x0, x1, y0, y1) => {
    let sum = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) sum += lum[y * S + x];
    return sum / ((x1 - x0) * (y1 - y0));
  };
  const grid = [];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x <= N; x += 1) {
      const x0 = Math.floor((x * S) / (N + 1));
      grid.push(box(x0, Math.max(x0 + 1, Math.floor(((x + 1) * S) / (N + 1))), (y * S) / N, ((y + 1) * S) / N));
    }
  }
  let bits = '';
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) bits += grid[y * (N + 1) + x] > grid[y * (N + 1) + x + 1] ? '1' : '0';
  const cells = [];
  for (let cy = 0; cy < 8; cy += 1) {
    for (let cx = 0; cx < 8; cx += 1) {
      let r = 0, g = 0, b = 0, w = 0;
      for (let y = cy * 8; y < cy * 8 + 8; y += 1) {
        for (let x = cx * 8; x < cx * 8 + 8; x += 1) {
          const i = (y * S + x) * 4;
          const a = data[i + 3] / 255;
          (r += data[i] * a), (g += data[i + 1] * a), (b += data[i + 2] * a), (w += a);
        }
      }
      cells.push(w > 3 ? [r / w, g / w, b / w] : null);
    }
  }
  return { bits, cells };
}
const hamming = (a, b) => [...a].reduce((n, bit, i) => n + (bit !== b[i] ? 1 : 0), 0);
/** The largest colour difference in any cell; a cell drawn in one and empty in the other differs entirely. */
function colourDistance(a, b) {
  let worst = 0;
  a.forEach((cell, i) => {
    const other = b[i];
    if (!cell && !other) return;
    worst = Math.max(worst, cell && other ? Math.hypot(cell[0] - other[0], cell[1] - other[1], cell[2] - other[2]) : 255);
  });
  return worst;
}
/**
 * Measured on this library: colour variants of one drawing differ by 54 or
 * more in their most different cell; different drawings in one metal differ
 * in 85 or more of the 1024 structure bits. A copy differs in neither.
 */
const SAME_STRUCTURE = 51;
const SAME_COLOUR = 24;

/** Names and descriptions, in both languages, for the dictionaries. */
async function writeNames(list) {
  const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const entries = (lang) =>
    list.flatMap((design) => {
      if (!design.name?.[lang] || !design.desc?.[lang]) throw new Error(`${design.id}: name and desc are needed in ${lang}`);
      return [`  'identity.asset.${design.id}': ${quote(design.name[lang])},`, `  'identity.asset.${design.id}.desc': ${quote(design.desc[lang])},`];
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
const prints = [];
const written = new Set();
let failed = false;
for (const design of DESIGNS) {
  const master = masterOf(design);
  if (!existsSync(master)) {
    console.error(`missing master for ${design.id}: ${path.relative(repo, master)} (run render.mjs or vector.mjs first)`);
    failed = true;
    continue;
  }
  const outDir = path.join(OUT, design.collection);
  await mkdir(outDir, { recursive: true });
  const isVector = master.endsWith('.svg');
  const meta = await sharp(master).metadata();
  let width = meta.width;
  let height = meta.height;
  let files;
  let thumb;
  if (isVector) {
    const svg = await readFile(master, 'utf8');
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (box) (width = Number(box[1])), (height = Number(box[2]));
    const target = path.join(outDir, `${design.id}.svg`);
    await copyFile(master, target);
    written.add(target);
    const url = `/identity/${design.collection}/${design.id}.svg`;
    files = [{ width, url }];
    thumb = url;
  } else if (design.reuse) {
    // Yavaya's own photograph: the page sizes already exist; only the gallery needs a small one.
    const target = path.join(outDir, `${design.id}-480.webp`);
    if (!(await fresh(target, master))) await sharp(master).resize({ width: 480, kernel: 'lanczos3' }).webp(THUMB).toFile(target);
    written.add(target);
    thumb = `/identity/${design.collection}/${design.id}-480.webp`;
    files = [{ width: 480, url: thumb }, ...design.reuse];
  } else {
    // Only sizes the master really has: never enlarged.
    const wanted = WIDTHS[design.kind].filter((w) => w <= meta.width);
    if (!wanted.includes(meta.width) && meta.width < WIDTHS[design.kind].at(-1)) wanted.push(meta.width);
    files = [];
    for (const w of [...new Set(wanted)].sort((a, b) => a - b)) {
      const target = path.join(outDir, `${design.id}-${w}.webp`);
      const options = w === 480 ? THUMB : w >= 3840 ? WEBP_4K : WEBP;
      const info = (await fresh(target, master))
        ? await sharp(target).metadata()
        : await sharp(master).resize({ width: w, withoutEnlargement: true, kernel: 'lanczos3' }).webp(options).toFile(target);
      written.add(target);
      files.push({ width: info.width, url: `/identity/${design.collection}/${design.id}-${w}.webp` });
    }
    thumb = files[0].url;
  }

  const print = await fingerprint(master);
  for (const other of prints) {
    if (other.kind === design.kind && hamming(print.bits, other.bits) <= SAME_STRUCTURE && colourDistance(print.cells, other.cells) < SAME_COLOUR) {
      console.error(`${design.id} is the same picture as ${other.id} — not a new design`);
      failed = true;
    }
  }
  prints.push({ id: design.id, kind: design.kind, ...print });

  assets.push({
    id: design.id,
    collection: design.collection,
    kind: design.kind,
    style: design.style,
    colors: design.colors,
    palette: await palette(master),
    tags: design.tags ?? [],
    width,
    height,
    format: isVector ? 'svg' : 'webp',
    files,
    thumb,
    transparent: Boolean(meta.hasAlpha) || isVector,
    placement: design.placement,
    focus: design.focus ?? { x: 50, y: 50 },
    ...(design.frameShape ? { frameShape: design.frameShape } : {}),
    status: design.status ?? 'published',
    source: design.source,
  });
}

if (failed) {
  console.error('\nnot written: fix the designs above first');
  process.exit(1);
}

// Files left from designs that no longer exist go, so the site serves only what the library holds.
for (const collection of await readdir(OUT)) {
  const dir = path.join(OUT, collection);
  for (const file of await readdir(dir)) {
    if (!written.has(path.join(dir, file))) await rm(path.join(dir, file));
  }
}

await writeFile(MANIFEST, JSON.stringify({ generatedBy: 'tools/identity-assets/build.mjs', assets }, null, 2) + '\n');
await writeNames(DESIGNS);

let bytes = 0;
for (const file of written) bytes += (await stat(file)).size;
const by = (key) => assets.reduce((acc, a) => ((acc[a[key]] = (acc[a[key]] ?? 0) + 1), acc), {});
const native4k = assets.filter((a) => a.width >= 3840 && a.height >= 2160).length;
console.log(`${assets.length} designs`);
console.log('by collection:', by('collection'));
console.log('by source:', by('source'));
console.log(`native 3840×2160 or larger: ${native4k}; vector: ${assets.filter((a) => a.format === 'svg').length}; others measured smaller (see the manifest)`);
console.log(`${written.size} files written, ${(bytes / 1024 / 1024).toFixed(1)} MB`);

// Variants of one drawing (the same structure in another metal or colour) are
// grouped, so the summary says how many different drawings the library holds.
const group = prints.map((_, i) => i);
const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])));
prints.forEach((a, i) => prints.slice(0, i).forEach((b, j) => {
  if (a.kind === b.kind && hamming(a.bits, b.bits) <= SAME_STRUCTURE) group[root(i)] = root(j);
}));
const drawings = new Map();
prints.forEach((p, i) => drawings.set(root(i), [...(drawings.get(root(i)) ?? []), p.id]));
const variantGroups = [...drawings.values()].filter((ids) => ids.length > 1);
console.log(`${drawings.size} distinct drawings; ${variantGroups.length} of them come in more than one metal or colour:`);
for (const ids of variantGroups) console.log(`  ${ids.join(', ')}`);
