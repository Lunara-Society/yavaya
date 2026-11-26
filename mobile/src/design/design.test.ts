import { test } from 'node:test';
import assert from 'node:assert/strict';
import { color, contrast, districtAccent, type as typeScale, touch } from './tokens.ts';
import { DISTRICTS } from '../districts/registry.ts';

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
