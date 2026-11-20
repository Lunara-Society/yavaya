/**
 * The Halo's shape, shared by the live Halo (halo.tsx) and its still mark on
 * the launcher (haloMarkSvg, below): three arcs of a ring of radius R, each ±HALF
 * radians long, HU thick across and HV deep, around the light at CORE.
 */
export const R = 1.0;
export const HALF = 0.87; // ±50°: three arcs of 100° with gaps of 20°
export const HU = 0.12;
export const HV = 0.16;
export const CORE: [number, number, number] = [0, 0.04, 0];
const TAU = Math.PI * 2;
/** The arcs' places on the ring: top, lower left, lower right (the gaps between them point down and to the sides). */
export const BASE = [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + (2 * TAU) / 3];

/** One arc's outline seen from the front, as SVG polygon points. */
export function arcOutline(n: number): string {
  const pts: string[] = [];
  for (let k = 0; k <= n; k++) {
    const t = -HALF + (2 * HALF * k) / n;
    pts.push(`${((R + HU) * Math.cos(t)).toFixed(3)},${((R + HU) * Math.sin(t)).toFixed(3)}`);
  }
  for (let k = n; k >= 0; k--) {
    const t = -HALF + (2 * HALF * k) / n;
    pts.push(`${((R - HU) * Math.cos(t)).toFixed(3)},${((R - HU) * Math.sin(t)).toFixed(3)}`);
  }
  return pts.join(' ');
}

/**
 * The launcher's still mark, as the SVG file public/roxi/halo-mark.svg: the
 * same arcs and golden heart, served as an image so it adds no script to any
 * page. tests/unit/roxi-halo.test.ts checks the file still matches this.
 */
export function haloMarkSvg(): string {
  const outline = arcOutline(16);
  const arcs = BASE.map((phi) => `<polygon points="${outline}" transform="rotate(${((phi * 180) / Math.PI).toFixed(1)})" fill="url(#o)" stroke="#d9b56f" stroke-width="0.05" stroke-linejoin="miter"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.5 -1.5 3 3"><style>@keyframes b{50%{opacity:.72}}.l{animation:b 5.5s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.l{animation:none}}</style><defs><linearGradient id="o" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#040306"/><stop offset=".55" stop-color="#0f0a19"/><stop offset="1" stop-color="#2a1a48"/></linearGradient><radialGradient id="g"><stop offset="0" stop-color="#ffd58a"/><stop offset=".22" stop-color="#a77bff" stop-opacity=".85"/><stop offset=".6" stop-color="#7a4dff" stop-opacity=".2"/><stop offset="1" stop-color="#7a4dff" stop-opacity="0"/></radialGradient></defs><g transform="scale(1,-1)"><circle class="l" cx="${CORE[0]}" cy="${CORE[1]}" r="0.62" fill="url(#g)"/>${arcs}</g></svg>\n`;
}
