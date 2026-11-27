import { test } from 'node:test';
import assert from 'node:assert/strict';
import { color, contrast, districtAccent, type as typeScale, touch } from './tokens.ts';
import { DISTRICTS } from '../districts/registry.ts';
import { aether, BLUR_MAX, LEVELS, levelFor, MATERIALS } from './aether.ts';
import { AETHER, SYNAPSE } from './palettes.ts';

function lab(hex: string): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const accents = Object.entries(districtAccent);

test('every district has exactly one accent and the registry matches the website count', () => {
  assert.equal(DISTRICTS.length, 15);
  assert.equal(new Set(DISTRICTS.map((d) => d.id)).size, 15);
  for (const d of DISTRICTS) assert.equal(d.accent, districtAccent[d.id]);
});

test('district accents read on absolute black at 7:1 or more', () => {
  for (const [id, hex] of accents) assert.ok(contrast(hex, color.void) >= 7, `${id} ${contrast(hex, color.void).toFixed(1)}`);
});

test('district accents are distinguishable from each other (ΔE ≥ 20)', () => {
  for (let i = 0; i < accents.length; i += 1)
    for (let j = i + 1; j < accents.length; j += 1)
      assert.ok(deltaE(accents[i][1], accents[j][1]) >= 20, `${accents[i][0]} vs ${accents[j][0]}`);
});

test('system lights (Roxi, signal, metal) stay apart from every district (ΔE ≥ 14)', () => {
  for (const sys of [color.roxi, color.signal, color.metal])
    for (const [id, hex] of accents) assert.ok(deltaE(sys, hex) >= 14, `${sys} vs ${id}`);
});

test('text contrast meets WCAG AA on the darkest and the glass surfaces', () => {
  assert.ok(contrast(color.text, color.void) >= 15);
  assert.ok(contrast(color.text, color.deep) >= 15);
});

test('no text style is smaller than 12 px and touch targets are 48 dp', () => {
  for (const [name, s] of Object.entries(typeScale)) assert.ok(s.fontSize >= 12, name);
  assert.equal(touch.minTarget, 48);
});

// Aether, the AX-04 look (docs/aether/VISUAL_LANGUAGE.md §2 and §6).
const PRIMARY_TEXT_MIN = 15;
const SECONDARY_TEXT_MIN = 11;
const BODY_TEXT_MIN = 4.5;
const LIGHT_MIN = 7;
const MATERIAL_COUNT = 10;
const MAX_REFRACTION = 0.2;
const MAX_MICRO = 0.08;
const LITE_LEVEL = 2;

test('the Synapse palette is exactly today\'s tokens, so the default look does not change', () => {
  assert.equal(SYNAPSE.void, color.void);
  assert.equal(SYNAPSE.deep, color.deep);
  assert.equal(SYNAPSE.glass, color.glass);
  assert.equal(SYNAPSE.glassRaised, color.glassRaised);
  assert.equal(SYNAPSE.hairline, color.hairline);
  assert.equal(SYNAPSE.hairlineStrong, color.hairlineStrong);
  assert.equal(SYNAPSE.text, color.text);
  assert.equal(SYNAPSE.textSecondary, color.textSecondary);
  assert.equal(SYNAPSE.textTertiary, color.textTertiary);
  assert.equal(SYNAPSE.focus, color.signal);
  assert.equal(SYNAPSE.link, color.signal);
  assert.equal(SYNAPSE.metal, color.metal);
  assert.equal(SYNAPSE.roxi, color.roxi);
});

test('Aether words and lights read on absolute black and on obsidian (T-COLOUR-01)', () => {
  for (const ground of [aether.void, aether.obsidian3]) {
    assert.ok(contrast(AETHER.text, ground) >= PRIMARY_TEXT_MIN, `text on ${ground}`);
    assert.ok(contrast(AETHER.link, ground) >= PRIMARY_TEXT_MIN, `link on ${ground}`);
    assert.ok(contrast(AETHER.textSecondary, ground) >= SECONDARY_TEXT_MIN, `secondary on ${ground}`);
    assert.ok(contrast(AETHER.textTertiary, ground) >= BODY_TEXT_MIN, `tertiary on ${ground}`);
    assert.ok(contrast(AETHER.metal, ground) >= LIGHT_MIN, `champagne on ${ground}`);
    assert.ok(contrast(AETHER.focus, ground) >= LIGHT_MIN, `lit champagne on ${ground}`);
  }
});

test('Aether never puts words in champagne shadow or dark titanium, and never uses violet light', () => {
  for (const words of [AETHER.text, AETHER.textSecondary, AETHER.textTertiary, AETHER.link, AETHER.metal, AETHER.focus]) {
    assert.notEqual(words, aether.champagneDeep);
    assert.notEqual(words, aether.titaniumDark);
  }
  assert.equal(AETHER.roxi, aether.champagneLit);
  assert.notEqual(AETHER.roxi, color.roxi);
});

test('the ten materials have every level, keep blur within each level and need no shader on lite levels', () => {
  assert.equal(Object.keys(MATERIALS).length, MATERIAL_COUNT);
  for (const [name, levels] of Object.entries(MATERIALS)) {
    for (const level of LEVELS) {
      const v = levels[level];
      assert.ok(v.blur <= BLUR_MAX[level], `${name} L${level} blur ${v.blur}`);
      assert.ok(v.refraction >= 0 && v.refraction <= MAX_REFRACTION, `${name} L${level} refraction`);
      assert.ok(v.micro >= 0 && v.micro <= MAX_MICRO, `${name} L${level} micro`);
      assert.notEqual(v.tint, aether.champagneHot, `${name} L${level}: hot champagne is never a resting colour`);
      if (level <= LITE_LEVEL) assert.notEqual(v.draw, 'shader', `${name} L${level} needs a shader`);
    }
  }
});

test('the device tier sets the starting level: high L4, mid L3, low L2', () => {
  assert.deepEqual([levelFor('high'), levelFor('mid'), levelFor('low')], [LEVELS[0], LEVELS[1], LEVELS[LITE_LEVEL]]);
});

