import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISTRICT_IDS } from '@/ui/site/blocks';

/**
 * The colour worlds in worlds.css must stay readable. Each world's text, its
 * accent (eyebrows, links) and its heading tint are checked against every
 * surface of that world, and each button's ink against every stop of its
 * gradient — WCAG AA: 4.5:1 for text, 7:1 for body text on the page.
 */
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'worlds.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const body = CSS.slice(start + selector.length + 2, CSS.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a six-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1]!.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const worlds = DISTRICT_IDS.flatMap((id) => [
  { name: `${id} (dark)`, vars: block(`.site[data-tone="${id}"]`) },
  { name: `${id} (light)`, vars: block(`:root[data-theme="light"] .site[data-tone="${id}"]`) },
]);

describe('colour worlds', () => {
  it('gives every district a world of its own, in both themes', () => {
    const dark = DISTRICT_IDS.map((id) => block(`.site[data-tone="${id}"]`).bg);
    const light = DISTRICT_IDS.map((id) => block(`:root[data-theme="light"] .site[data-tone="${id}"]`).bg);
    expect(new Set(dark).size).toBe(DISTRICT_IDS.length);
    expect(new Set(light).size).toBe(DISTRICT_IDS.length);
  });

  it.each(worlds)('keeps $name readable', ({ vars }) => {
    const surfaces = [vars.bg!, vars.surface!, vars['surface-2']!];
    const failures: string[] = [];
    const check = (label: string, fg: string, backgrounds: string[], min: number) => {
      for (const bg of backgrounds) {
        const ratio = contrast(fg, bg);
        if (ratio < min) failures.push(`${label} ${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      }
    };
    check('text', vars.text!, surfaces, 7);
    check('text-2', vars['text-2']!, surfaces, 4.5);
    check('text-3', vars['text-3']!, surfaces, 4.5);
    check('accent', vars.accent!, surfaces, 4.5);
    check('head', vars.head!, [vars.bg!], 4.5);
    check('button ink', vars['btn-ink']!, [vars['btn-hi']!, vars['btn-mid']!, vars['btn-lo']!], 4.5);
    expect(failures).toEqual([]);
  });

  it('keeps the shared night and day readable', () => {
    const night = block(':root:not([data-theme="light"])');
    const day = block(':root[data-theme="light"]');
    for (const theme of [night, day]) {
      for (const surface of [theme.bg!, theme.surface!, theme['surface-2']!]) {
        expect(contrast(theme.text!, surface)).toBeGreaterThanOrEqual(7);
        expect(contrast(theme['text-2']!, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme['text-3']!, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(day.accent!, day.bg!)).toBeGreaterThanOrEqual(4.5);
  });
});
