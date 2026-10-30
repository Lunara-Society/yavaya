#!/usr/bin/env node
/**
 * Renders the catalogue's shader designs into masters, at their full size.
 *
 *   cd platform && node ../tools/identity-assets/render.mjs [--preview] [--sheet] [id-prefix …]
 *
 * Each design is a fragment shader (shaders/<program>.glsl, after
 * shaders/common.glsl) with its own palette, parameters and seed, drawn by
 * headless Chromium's WebGL2 at 3840×2160 — natively, never enlarged — in
 * tiles, so no single draw runs long. The result is written losslessly to
 * masters/<id>.png, which build.mjs turns into the sizes the site serves.
 * The same catalogue always draws the same pictures, so masters are not
 * committed: run this, then build.mjs, on a fresh checkout.
 *
 *   --preview   960 px wide, into previews/ — for judging a design quickly
 *   --sheet     also writes previews/sheet-<program>.jpg, every design of a
 *               program side by side, which is how each one was reviewed
 *
 * Needs Playwright with its Chromium (the same one the browser checks use).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DESIGNS } from './catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.join(here, '..', '..', 'platform');
const { chromium } = createRequire(import.meta.url)('playwright');
const sharp = createRequire(path.join(platform, 'package.json'))('sharp');

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const sheet = args.includes('--sheet');
const prefixes = args.filter((arg) => !arg.startsWith('--'));
const outDir = path.join(here, preview ? 'previews' : 'masters');
await mkdir(outDir, { recursive: true });

const common = await readFile(path.join(here, 'shaders', 'common.glsl'), 'utf8');
const programs = new Map();
async function program(name) {
  if (!programs.has(name)) {
    const body = await readFile(path.join(here, 'shaders', `${name}.glsl`), 'utf8');
    const source = `#version 300 es\n${common}\n${body}`;
    // A design with a column pass is compiled twice: once for that pass, once for the picture.
    const columns = body.includes('#ifdef COLUMNS_PASS') ? `#version 300 es\n#define COLUMNS_PASS\n${common}\n${body}` : null;
    programs.set(name, { source, columns });
  }
  return programs.get(name);
}

/** sRGB hex to linear RGB: designs are lit in linear light. */
function linear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

/**
 * Runs in the page: draws one design tile by tile and returns a PNG data URL.
 * One WebGL context serves the whole run and every program is compiled once
 * and kept — compiling is the slow part on a software GPU, drawing is not.
 */
async function draw({ source, columnsSource, width, height, palette, params, seed, tile }) {
  const state = (window.__identity ??= (() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('no WebGL2');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One triangle covering the whole canvas.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    return { canvas, gl, programs: new Map() };
  })());
  const { canvas, gl } = state;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const compile = (type, text) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
    return shader;
  };
  const use = (fragment) => {
    let prog = state.programs.get(fragment);
    if (!prog) {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }'));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
      state.programs.set(fragment, prog);
    }
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), width, height);
    gl.uniform2f(gl.getUniformLocation(prog, 'uOffset'), 0, 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'uSeed'), seed);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uC'), new Float32Array(palette.flat()));
    gl.uniform4fv(gl.getUniformLocation(prog, 'uP'), new Float32Array(params.flat()));
    return prog;
  };
  gl.disable(gl.SCISSOR_TEST);
  if (columnsSource) {
    // First pass: what depends only on the column, computed once per column
    // into a float texture three texels high, instead of once per pixel.
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 3, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    use(columnsSource);
    gl.viewport(0, 0, width, 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    state.columns && gl.deleteTexture(state.columns);
    state.columns = texture;
  }
  const prog = use(source);
  if (columnsSource) gl.uniform1i(gl.getUniformLocation(prog, 'uColumns'), 0);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.SCISSOR_TEST);
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      gl.scissor(x, y, Math.min(tile, width - x), Math.min(tile, height - y));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      // Let the page breathe between tiles so no single task runs long.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return canvas.toDataURL('image/png');
}

const wanted = DESIGNS.filter((d) => d.shader && (prefixes.length === 0 || prefixes.some((p) => d.id.startsWith(p))));
if (wanted.length === 0) {
  console.error('no shader designs match');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const rendered = [];
for (const design of wanted) {
  const [fullW, fullH] = design.size ?? [3840, 2160];
  const width = preview ? 960 : fullW;
  const height = preview ? Math.round((960 * fullH) / fullW) : fullH;
  const palette = Array.from({ length: 6 }, (_, i) => linear(design.palette[i] ?? design.palette[design.palette.length - 1]));
  const params = Array.from({ length: 4 }, (_, i) => [...(design.params?.[i] ?? []), 0, 0, 0, 0].slice(0, 4));
  const started = Date.now();
  const { source, columns } = await program(design.shader);
  const url = await page.evaluate(draw, { source, columnsSource: columns, width, height, palette, params, seed: design.seed ?? 1, tile: 512 });
  const file = path.join(outDir, `${design.id}.png`);
  await writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  rendered.push({ design, file });
  console.log(`${design.id}  ${width}×${height}  ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
await browser.close();

if (sheet) {
  // One sheet per program: every design of it, labelled, for review.
  const byProgram = new Map();
  for (const item of rendered) byProgram.set(item.design.shader, [...(byProgram.get(item.design.shader) ?? []), item]);
  for (const [name, items] of byProgram) {
    const cell = 480;
    const cellH = 270;
    const cols = Math.min(5, items.length);
    const rows = Math.ceil(items.length / cols);
    const composite = [];
    for (const [i, item] of items.entries()) {
      const left = (i % cols) * (cell + 8);
      const top = Math.floor(i / cols) * (cellH + 28);
      composite.push({ input: await sharp(item.file).resize(cell, cellH, { fit: 'cover' }).toBuffer(), left, top });
      const label = Buffer.from(`<svg width="${cell}" height="24" xmlns="http://www.w3.org/2000/svg"><text x="2" y="17" font-family="sans-serif" font-size="15" fill="#111">${item.design.id}</text></svg>`);
      composite.push({ input: label, left, top: top + cellH + 2 });
    }
    const target = path.join(here, 'previews', `sheet-${name}.jpg`);
    await mkdir(path.dirname(target), { recursive: true });
    await sharp({ create: { width: cols * (cell + 8), height: rows * (cellH + 28), channels: 3, background: '#ffffff' } })
      .composite(composite)
      .jpeg({ quality: 86 })
      .toFile(target);
    console.log(`sheet: ${path.relative(here, target)}`);
  }
}
