// Renders Roxi's reconstruction off the phone, with the same shader source the
// app compiles and Skia's own compiler (CanvasKit), so a change to the look can
// be checked by eye before it goes into a build.
//
//   node tools/synapse/render-frames.mjs <out-dir> [width height]
//
// Writes one PNG per stage (progress 0 … 1, then dissolving) and a contact sheet.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECONSTRUCT_SKSL, figureBox, heartOf, cellSize } from '../../src/synapse/reconstruct.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const [outDir, w = '412', h = '892'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node tools/synapse/render-frames.mjs <out-dir> [width height]');
  process.exit(2);
}
// A phone in CSS pixels at 2.625 density, like a mid-range Samsung.
const DENSITY = 2.625;
const W = Math.round(Number(w) * DENSITY);
const H = Math.round(Number(h) * DENSITY);

const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const CK = await CanvasKitInit({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });

const effect = CK.RuntimeEffect.Make(RECONSTRUCT_SKSL, (err) => console.error('SkSL error:', err));
if (!effect) process.exit(1);

function load(path) {
  const img = CK.MakeImageFromEncoded(readFileSync(join(root, path)));
  if (!img) throw new Error(`cannot decode ${path}`);
  return img;
}
const figure = load('assets/roxi/roxi.webp');
const depth = load('assets/roxi/roxi-depth.webp');

const box = figureBox(W, H);
const heart = heartOf(box);
// The same mapping as an ImageShader with fit "contain" in the figure's box.
function contain(img) {
  const s = Math.min(box.width / img.width(), box.height / img.height());
  const dx = box.x + (box.width - img.width() * s) / 2;
  const dy = box.y + (box.height - img.height() * s) / 2;
  return CK.Matrix.multiply(CK.Matrix.translated(dx, dy), CK.Matrix.scaled(s, s));
}
const imageShader = figure.makeShaderOptions(CK.TileMode.Decal, CK.TileMode.Decal, CK.FilterMode.Linear, CK.MipmapMode.None, contain(figure));
const depthShader = depth.makeShaderOptions(CK.TileMode.Decal, CK.TileMode.Decal, CK.FilterMode.Linear, CK.MipmapMode.None, contain(depth));

const stages = [
  { name: '01-progress-000', progress: 0.0, dissolve: 0, time: 0.4 },
  { name: '02-progress-020', progress: 0.2, dissolve: 0, time: 1.1 },
  { name: '03-progress-040', progress: 0.4, dissolve: 0, time: 1.8 },
  { name: '04-progress-060', progress: 0.6, dissolve: 0, time: 2.5 },
  { name: '05-progress-080', progress: 0.8, dissolve: 0, time: 3.2 },
  { name: '06-progress-100', progress: 1.0, dissolve: 0, time: 3.9 },
  { name: '07-tilt', progress: 1.0, dissolve: 0, time: 4.2, tilt: [-14 * DENSITY, -6 * DENSITY] },
  { name: '08-dissolve-040', progress: 1.0, dissolve: 0.4, time: 4.6 },
  { name: '09-dissolve-080', progress: 1.0, dissolve: 0.8, time: 5.0 },
];

// STAGES=04,06 renders only those stages (each takes ~18 s on the CPU rasteriser).
const only = process.env.STAGES?.split(',');
const chosen = only ? stages.filter((s) => only.some((o) => s.name.startsWith(o))) : stages;
mkdirSync(outDir, { recursive: true });
const surface = CK.MakeSurface(W, H);
const canvas = surface.getCanvas();
const paint = new CK.Paint();
const shots = [];
for (const s of chosen) {
  const [tx, ty] = s.tilt ?? [0, 0];
  // Uniform order: box(4) heart(2) cell(1) progress(1) dissolve(1) time(1) tilt(2) motes(1)
  const uniforms = [box.x, box.y, box.width, box.height, heart.x, heart.y, cellSize(DENSITY), s.progress, s.dissolve, s.time, tx, ty, 1];
  const shader = effect.makeShaderWithChildren(uniforms, [imageShader, depthShader]);
  canvas.clear(CK.Color(11, 10, 16, 1));
  paint.setShader(shader);
  const t0 = performance.now();
  canvas.drawRect(CK.LTRBRect(0, 0, W, H), paint);
  surface.flush();
  const ms = performance.now() - t0;
  const snap = surface.makeImageSnapshot();
  const png = snap.encodeToBytes();
  const file = join(outDir, `${s.name}.png`);
  writeFileSync(file, png);
  shots.push(file);
  console.log(`${s.name}: ${ms.toFixed(0)} ms on the CPU rasteriser`);
  snap.delete();
  shader.delete();
}
console.log(JSON.stringify({ shots }));
