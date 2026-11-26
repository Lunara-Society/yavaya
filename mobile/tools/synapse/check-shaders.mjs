// Compiles every SYNAPSE shader with Skia's own compiler (CanvasKit) and renders
// reference frames, so a shader error is found here and never on a phone.
//   node tools/synapse/check-shaders.mjs <out-dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHADERS } from '../../src/render/shaders.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'out');
mkdirSync(out, { recursive: true });
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const CK = await CanvasKitInit({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });

let failed = 0;
const effects = {};
for (const [name, src] of Object.entries(SHADERS)) {
  let err = '';
  const e = CK.RuntimeEffect.Make(src, (m) => (err += m));
  if (!e) { failed += 1; console.log(`FAIL ${name}\n${err}`); } else { effects[name] = e; console.log(`ok   ${name}`); }
}
if (failed) process.exit(1);

const W = 360, H = 360;
function render(name, effect, uniforms, child) {
  const surface = CK.MakeSurface(W, H);
  const canvas = surface.getCanvas();
  canvas.clear(CK.BLACK);
  const shader = child ? effect.makeShaderWithChildren(uniforms, [child]) : effect.makeShader(uniforms);
  const paint = new CK.Paint(); paint.setShader(shader);
  canvas.drawRect(CK.LTRBRect(0, 0, W, H), paint);
  const img = surface.makeImageSnapshot();
  writeFileSync(join(out, `${name}.png`), img.encodeToBytes());
  surface.delete();
}
const accent = [0.25, 0.84, 0.61];
render('atmosphere', effects.ATMOSPHERE_SKSL, [W, H, 3.0, ...accent, 0.4, 0.2, -0.1, 0.1, 1]);
render('edge', effects.EDGE_SKSL, [W, H, 18, 0.3, -0.2, ...accent, 1, 0.5, 0]);
render('object', effects.OBJECT_SKSL, [W, H, 1.0, 0.6, 0.35, ...accent, 1, 72, 0.25]);
render('awaken', effects.AWAKEN_SKSL, [W, H, 2.0, 0.8, 0.7, 0.72, 0.64, 1.0]);
const roxi = CK.MakeImageFromEncoded(readFileSync(join(here, '../../assets/roxi/roxi-face.webp')));
const child = roxi
  ? roxi.makeShaderOptions(CK.TileMode.Decal, CK.TileMode.Decal, CK.FilterMode.Linear, CK.MipmapMode.None, CK.Matrix.scaled(W / roxi.width(), H / roxi.height()))
  : null;
const names = ['particles', 'data', 'fragments', 'light', 'mesh', 'wave', 'molecular'];
for (let t = 0; t < 7; t += 1) for (const p of [0.35, 0.7]) {
  render(`recon-${t}-${names[t]}-${Math.round(p * 100)}`, effects.RECON_SKSL, [W, H, p, t, 1.2, 4, 0.5, 0.5, ...accent, 1], child);
}
console.log(`frames in ${out}`);
