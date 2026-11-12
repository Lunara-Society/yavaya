#!/usr/bin/env node
/**
 * The district marks as outlines a 3D program can read.
 *
 * The marks are drawn once, as SVG, in platform/src/ui/site/home.tsx (GLYPHS,
 * BOARD_GLYPHS). The medallions of the "Distritos en 3D" look are those same
 * marks raised in metal, so this reads them from that file rather than keeping
 * a second copy that could drift: a browser traces every stroke and shape and
 * the result is written as plain lists of points (glyphs.json), with each
 * district's colour from platform/src/app/home.css beside it.
 *
 *   node tools/depth/glyphs.cjs out/glyphs.json
 *
 * Then: blender -b --python tools/depth/medallions.py -- out/glyphs.json out/
 */
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..', 'platform', 'src');
const home = readFileSync(path.join(root, 'ui', 'site', 'home.tsx'), 'utf8');
const css = readFileSync(path.join(root, 'app', 'home.css'), 'utf8');

/** `const NAME: … = { key: '<svg…>', … };` → { key: '<svg…>' } */
function glyphTable(name) {
  const block = home.match(new RegExp(`const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`${name} not found in home.tsx`);
  const table = {};
  for (const [, key, markup] of block[1].matchAll(/(\w+):\s*'([^']*)'/g)) table[key] = markup;
  return table;
}

const glyphs = { ...glyphTable('GLYPHS'), ...glyphTable('BOARD_GLYPHS') };
const accent = (id) => {
  const rule = css.match(new RegExp(`\\.hx-card-${id}\\s*\\{[^}]*--a:\\s*(#[0-9a-fA-F]{6})`));
  if (!rule) throw new Error(`no colour for ${id} in home.css`);
  return rule[1];
};

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('usage: glyphs.cjs <out.json>');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const traced = await page.evaluate((table) => {
    const STEP = 0.04; // of the mark's 24-unit box: finer than anything the render can show
    const result = {};
    for (const [id, markup] of Object.entries(table)) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.innerHTML = markup;
      document.body.append(svg);
      const shapes = [];
      for (const el of svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')) {
        const filled = Boolean(el.closest('[fill="currentColor"]'));
        const length = el.getTotalLength();
        let run = [];
        const flush = () => {
          if (run.length > 1) {
            const [a, b] = [run[0], run[run.length - 1]];
            const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < STEP * 1.5;
            shapes.push({ filled, closed, points: closed ? run.slice(0, -1) : run });
          }
          run = [];
        };
        let last = null;
        const count = Math.ceil(length / STEP);
        for (let i = 0; i <= count; i += 1) {
          const p = el.getPointAtLength(Math.min(length, i * STEP));
          // A path with several parts jumps from the end of one to the start of the next.
          if (last && Math.hypot(p.x - last.x, p.y - last.y) > STEP * 4) flush();
          run.push([Number(p.x.toFixed(4)), Number(p.y.toFixed(4))]);
          last = p;
        }
        flush();
      }
      svg.remove();
      result[id] = shapes;
    }
    return result;
  }, glyphs);
  await browser.close();

  const data = {};
  for (const [id, shapes] of Object.entries(traced)) data[id] = { accent: accent(id), shapes };
  // Santuario's mark is a photograph: its medallion is the rim alone, hung around it.
  data.sanctuary = { accent: accent('sanctuary'), shapes: [] };
  writeFileSync(out, JSON.stringify(data));
  for (const [id, entry] of Object.entries(data)) console.log(`${id}: ${entry.shapes.length} shapes, ${entry.shapes.reduce((n, s) => n + s.points.length, 0)} points, ${entry.accent}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
