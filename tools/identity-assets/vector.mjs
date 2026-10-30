#!/usr/bin/env node
/**
 * Draws the catalogue's vector designs — photo frames and ornaments — as SVG.
 *
 *   cd platform && node ../tools/identity-assets/vector.mjs [id-prefix …]
 *
 * Every design is drawn here from a few shapes — rings, beads, leaves,
 * flowers, stars, rays — in metals made of gradients, so each one is small,
 * sharp at any size, and can be redrawn exactly. Output goes to vector/
 * (committed), which build.mjs copies to the site.
 *
 * Geometry the site relies on (ui/identity/identity.css):
 *   - Frames: a 260×260 box drawn over the photo at 130% of its size, so the
 *     photo is the central 200×200 — a circle of radius 100, or for rounded
 *     frames a square with corners of radius 48. The frame lives in the band
 *     outside it and may overlap its edge by a few units, never cover it.
 *   - Corner ornaments: 160×160, drawn for the top-left corner (the top-right
 *     one is the mirror image).
 *   - Crests: 480×80, centred.
 *   - Trims: one tile 24 high, repeated along the top edge.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNS } from './catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'vector');

// --- Materials ---------------------------------------------------------------------------

/** Metals as gradient stops: shadow, body, light, shine, body, shadow. */
export const METALS = {
  gold: ['#6b4a10', '#b8862b', '#f3d27e', '#fff6d6', '#c9962f', '#7a5512'],
  silver: ['#596069', '#a2abb5', '#e6ebf0', '#ffffff', '#b4bcc5', '#666e77'],
  rose: ['#6e3a2a', '#c27a62', '#f1c0ab', '#fff0e8', '#d39580', '#7a4232'],
  bronze: ['#4f2d12', '#9c6232', '#e0a76b', '#f8d9b0', '#b07240', '#5a3416'],
  platinum: ['#4e5763', '#9aa6b4', '#dfe6ee', '#fbfdff', '#aab5c2', '#5a6470'],
  champagne: ['#6a5326', '#b89d62', '#ecdcae', '#fffaea', '#c9b07a', '#76602e'],
};
const ENAMELS = {
  emerald: ['#06301f', '#0f6b46', '#3fbf86', '#c9f3df'],
  sapphire: ['#081a52', '#1d46b0', '#6f97ff', '#e0e9ff'],
  ruby: ['#4a0612', '#a8132f', '#ff5c7a', '#ffe0e6'],
  leaf: ['#0b3524', '#1d6b47', '#4ea67a', '#bfe5cf'],
  blossom: ['#9e2f57', '#e0688f', '#f59ab6', '#ffd6e3'],
  ivory: ['#8a7a5e', '#d8ccb4', '#f6f0e2', '#ffffff'],
  onyx: ['#000000', '#141416', '#2b2c30', '#55575c'],
  goldleaf: ['#6b4a10', '#c9962f', '#f3d27e', '#fff6d6'],
};

const r2 = (n) => Math.round(n * 100) / 100;

function linear(id, stops, x1, y1, x2, y2) {
  const offsets = [0, 0.22, 0.45, 0.55, 0.78, 1];
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map((c, i) => `<stop offset="${offsets[Math.min(i, offsets.length - 1)]}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;
}
/**
 * A rounded surface lit from the top left: the lightest colour at the centre
 * of the light, the darkest at the rim. Stops are written lightest first, so
 * their offsets climb — SVG clamps an offset lower than the one before it,
 * which would paint the whole shape in the highlight.
 */
function radial(id, stops) {
  const offsets = [0, 0.18, 0.55, 1];
  return `<radialGradient id="${id}" cx="35%" cy="30%" r="75%">${[...stops]
    .reverse()
    .map((c, i) => `<stop offset="${offsets[i] ?? r2(i / (stops.length - 1))}" stop-color="${c}"/>`)
    .join('')}</radialGradient>`;
}
/** A metal for a w×h drawing: lit from the top left, as everything in the library is. */
function metalDefs(metal, w, h, id = 'm') {
  const s = METALS[metal];
  return linear(id, s, 0, 0, w, h) + linear(`${id}s`, [s[5], s[0], s[1], s[0], s[5], s[0]], 0, 0, w, h);
}
function svg(w, h, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>\n`;
}

// --- Shapes ----------------------------------------------------------------------------

const C = 130;
/** A point on a circle around the frame centre; 0° is the top, clockwise. */
function polar(r, deg, cx = C, cy = C) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
}
/** A ring with a bevel: shadow under, metal over, a fine line of light along it. */
function bevelRing(r, w, id = 'm') {
  return (
    `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="url(#${id}s)" stroke-width="${r2(w + 1.4)}"/>` +
    `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}"/>` +
    `<circle cx="${C}" cy="${C}" r="${r2(r - w * 0.22)}" fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="${r2(Math.max(w * 0.16, 0.5))}"/>`
  );
}
function thinRing(r, w, id = 'm') {
  return `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}"/>`;
}
/** A leaf: a pointed oval along its own axis, at (x, y), turned by deg. */
function leaf(x, y, len, width, deg, fill, vein = true) {
  const half = len / 2;
  // A quadratic's curve reaches half way to its control point: the control sits at the full width.
  const d = `M ${-half} 0 Q ${r2(-half * 0.1)} ${r2(-width)} ${half} 0 Q ${r2(-half * 0.1)} ${r2(width)} ${-half} 0 Z`;
  const v = vein ? `<path d="M ${r2(-half * 0.8)} 0 L ${r2(half * 0.85)} 0" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${r2(Math.max(width * 0.12, 0.4))}"/>` : '';
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)})"><path d="${d}" fill="${fill}"/>${v}</g>`;
}
/** A star with n points. */
function star(x, y, outer, inner, points, fill, deg = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((i * 180) / points - 90 + deg) * (Math.PI / 180);
    pts.push(`${r2(x + r * Math.cos(a))},${r2(y + r * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}
/** A pearl or bead: a sphere with its highlight. */
function bead(x, y, r, fill) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><circle cx="${r2(x - r * 0.32)}" cy="${r2(y - r * 0.34)}" r="${r2(r * 0.28)}" fill="#ffffff" fill-opacity="0.75"/>`;
}
/** A five-petal flower. */
function flower(x, y, r, petal, heart, deg = 0) {
  let out = `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)})">`;
  for (let i = 0; i < 5; i += 1) {
    out += `<ellipse cx="0" cy="${r2(-r * 0.55)}" rx="${r2(r * 0.42)}" ry="${r2(r * 0.6)}" transform="rotate(${i * 72})" fill="${petal}"/>`;
  }
  return out + `<circle r="${r2(r * 0.28)}" fill="${heart}"/></g>`;
}
/** A cut gem: a rounded diamond with facets and a glint. */
function gem(x, y, size, id, deg = 0) {
  const s = size;
  return (
    `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)})">` +
    `<path d="M 0 ${-s} L ${s * 0.78} 0 L 0 ${s} L ${-s * 0.78} 0 Z" fill="url(#${id})" stroke="url(#m)" stroke-width="${r2(s * 0.22)}" stroke-linejoin="round"/>` +
    `<path d="M 0 ${-s} L 0 ${s} M ${-s * 0.78} 0 L ${s * 0.78} 0" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${r2(s * 0.08)}"/>` +
    `<circle cx="${r2(-s * 0.22)}" cy="${r2(-s * 0.35)}" r="${r2(s * 0.16)}" fill="#ffffff" fill-opacity="0.85"/></g>`
  );
}

// --- Frames: circle ---------------------------------------------------------------------------

const FRAME = 260;
const circleFrames = {
  ring({ metal, outer = 6, inner = 2, gap = 9 }) {
    return svg(FRAME, FRAME, metalDefs(metal, FRAME, FRAME), bevelRing(103, outer) + thinRing(103 + outer / 2 + gap, inner) + thinRing(103 + outer / 2 + gap + inner + 3, inner * 0.5));
  },
  pearl({ metal, count = 40, size = 4.2 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + radial('p', ENAMELS.ivory);
    let body = bevelRing(102.5, 3.2);
    for (let i = 0; i < count; i += 1) body += bead(...polar(112, (360 / count) * i), size, 'url(#p)');
    return svg(FRAME, FRAME, defs, body + thinRing(120.5, 1.2));
  },
  laurel({ metal, leafColor, leaves = 13, gapDeg = 34 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + (leafColor ? linear('l', [...ENAMELS[leafColor], ENAMELS[leafColor][1], ENAMELS[leafColor][0]], 0, 0, FRAME, FRAME) : '');
    const fill = leafColor ? 'url(#l)' : 'url(#m)';
    let body = bevelRing(102.5, 2.6);
    // Two branches rise from the bottom and stop short of the top; each leaf
    // grows from the branch toward its tip, in pairs, outside and inside.
    const span = 180 - gapDeg / 2;
    for (const side of [-1, 1]) {
      body += `<path d="M ${polar(112, 180).join(' ')} A 112 112 0 0 ${side > 0 ? 0 : 1} ${polar(112, 180 - side * span).join(' ')}" fill="none" stroke="url(#m)" stroke-width="1.6"/>`;
      for (let i = 0; i < leaves; i += 1) {
        const t = (i + 0.5) / leaves;
        const deg = 180 - side * span * t;
        const size = 17 - 6 * t;
        // Direction of growth along the branch, in SVG degrees (0 = +x, clockwise).
        const growth = side > 0 ? deg + 180 : deg;
        for (const out of [1, -1]) {
          const tilt = growth + out * side * 32;
          const [ax, ay] = polar(112, deg);
          const rad = (tilt * Math.PI) / 180;
          body += leaf(ax + (Math.cos(rad) * size) / 2, ay + (Math.sin(rad) * size) / 2, size, size * 0.22, tilt, fill);
        }
      }
    }
    // A small tie where the branches meet.
    body += `<circle cx="${polar(112, 180)[0]}" cy="${polar(112, 180)[1]}" r="4.6" fill="url(#m)"/>`;
    return svg(FRAME, FRAME, defs, body);
  },
  deco({ metal, rays = 60, enamel }) {
    const defs = metalDefs(metal, FRAME, FRAME) + (enamel ? radial('e', ENAMELS[enamel]) : '');
    let body = (enamel ? `<circle cx="${C}" cy="${C}" r="111" fill="none" stroke="url(#e)" stroke-width="16"/>` : '') + bevelRing(103, 4.2);
    for (let i = 0; i < rays; i += 1) {
      const deg = (360 / rays) * i;
      const long = i % 2 === 0;
      const [x1, y1] = polar(108, deg);
      const [x2, y2] = polar(long ? 124 : 117, deg);
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#m)" stroke-width="${long ? 1.6 : 1.1}" stroke-linecap="round"/>`;
    }
    // Stepped diamonds at the four quarters.
    for (const deg of [0, 90, 180, 270]) {
      const [x, y] = polar(116, deg);
      body += `<g transform="translate(${x} ${y}) rotate(${deg})"><path d="M 0 -11 L 7 0 L 0 11 L -7 0 Z" fill="url(#m)" stroke="url(#ms)" stroke-width="0.8"/><path d="M 0 -6 L 3.6 0 L 0 6 L -3.6 0 Z" fill="#ffffff" fill-opacity="0.35"/></g>`;
    }
    return svg(FRAME, FRAME, defs, body + thinRing(127, 1));
  },
  gem({ metal, stone, count = 6, size = 7.5 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + radial('g', ENAMELS[stone]);
    let body = bevelRing(104, 6.5);
    const step = 360 / count;
    for (let i = 0; i < count; i += 1) {
      body += gem(...polar(104, step * i), size, 'g', step * i);
      for (let j = 1; j < 4; j += 1) body += bead(...polar(104, step * i + (step / 4) * j), 2.1, 'url(#m)');
    }
    return svg(FRAME, FRAME, defs, body + thinRing(116, 1.2));
  },
  floral({ metal, petal, count = 8 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + radial('f', ENAMELS[petal]) + linear('l', [...ENAMELS.leaf, ENAMELS.leaf[1], ENAMELS.leaf[0]], 0, 0, FRAME, FRAME);
    let body = thinRing(104, 2.4) + thinRing(118, 1);
    const step = 360 / count;
    for (let i = 0; i < count; i += 1) {
      const deg = step * i;
      for (const side of [-1, 1]) {
        const [x, y] = polar(111, deg + side * 9);
        body += leaf(x, y, 12, 4.2, deg + side * 9, 'url(#l)', false);
      }
      body += flower(...polar(111, deg), 9.5, 'url(#f)', 'url(#m)', deg);
    }
    return svg(FRAME, FRAME, defs, body);
  },
  celestial({ metal, stars = 11 }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    let body = bevelRing(103, 2.8);
    for (let i = 0; i < 72; i += 1) {
      const [x, y] = polar(119, i * 5);
      body += `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.3 : 0.8}" fill="url(#m)"/>`;
    }
    // A crescent at the upper right, stars across the rest.
    const [mx, my] = polar(112, 40);
    body += `<path d="M ${mx - 2} ${my - 13} A 13 13 0 1 0 ${mx - 2} ${my + 13} A 10 10 0 1 1 ${mx - 2} ${my - 13} Z" fill="url(#m)" transform="rotate(30 ${mx} ${my})"/>`;
    for (let i = 0; i < stars; i += 1) {
      const deg = 75 + (300 / stars) * i;
      const big = i % 3 === 0;
      body += star(...polar(big ? 113 : 110 + (i % 2) * 7, deg), big ? 7.5 : 4.2, big ? 2.6 : 1.5, big ? 4 : 5, 'url(#m)', deg);
    }
    return svg(FRAME, FRAME, defs, body);
  },
  rope({ metal, twists = 84 }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    let body = thinRing(101.5, 1.6);
    for (let i = 0; i < twists; i += 1) {
      const deg = (360 / twists) * i;
      const [x, y] = polar(110, deg);
      body += `<ellipse cx="${x}" cy="${y}" rx="3.1" ry="8.4" transform="rotate(${r2(deg + 38)} ${x} ${y})" fill="url(#m)" stroke="url(#ms)" stroke-width="0.6"/>`;
    }
    return svg(FRAME, FRAME, defs, body + thinRing(119, 1.4));
  },
  geometric({ metal, sides = 12 }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    const ring = (r, offset) => Array.from({ length: sides }, (_, i) => polar(r, (360 / sides) * i + offset).join(',')).join(' ');
    let body = `<polygon points="${ring(124, 0)}" fill="none" stroke="url(#m)" stroke-width="2.4" stroke-linejoin="round"/>`;
    body += `<polygon points="${ring(111, 180 / sides)}" fill="none" stroke="url(#m)" stroke-width="1.4" stroke-linejoin="round"/>`;
    for (let i = 0; i < sides; i += 1) {
      const a = polar(124, (360 / sides) * i);
      const b = polar(111, (360 / sides) * i + 180 / sides);
      const c2 = polar(111, (360 / sides) * i - 180 / sides);
      body += `<path d="M ${a.join(' ')} L ${b.join(' ')} M ${a.join(' ')} L ${c2.join(' ')}" stroke="url(#m)" stroke-width="1.1"/>`;
    }
    return svg(FRAME, FRAME, defs, bevelRing(103, 3.4) + body);
  },
  botanical({ metal, leafColor = 'leaf', leaves = 22 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + linear('l', [...ENAMELS[leafColor], ENAMELS[leafColor][1], ENAMELS[leafColor][0]], 0, 0, FRAME, FRAME);
    let body = `<circle cx="${C}" cy="${C}" r="110" fill="none" stroke="url(#l)" stroke-width="2"/>`;
    for (let i = 0; i < leaves; i += 1) {
      const deg = (360 / leaves) * i;
      const out = i % 2 === 0 ? 1 : -1;
      // Clockwise along the vine, turned out or in.
      const tilt = deg + out * 40;
      const size = 18;
      const [ax, ay] = polar(110, deg);
      const rad = (tilt * Math.PI) / 180;
      body += leaf(ax + (Math.cos(rad) * size) / 2, ay + (Math.sin(rad) * size) / 2, size, size * 0.24, tilt, 'url(#l)');
      if (i % 3 === 1) body += `<circle cx="${polar(119, deg + 5)[0]}" cy="${polar(119, deg + 5)[1]}" r="2.2" fill="url(#m)"/>`;
    }
    return svg(FRAME, FRAME, defs, thinRing(102.5, 1.6) + body);
  },
  minimal({ metal, mark = 'diamond' }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    const [x, y] = polar(106, 0);
    const markShape = mark === 'diamond' ? `<path d="M ${x} ${y - 6} L ${x + 4.5} ${y} L ${x} ${y + 6} L ${x - 4.5} ${y} Z" fill="url(#m)"/>` : `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#m)"/>`;
    return svg(FRAME, FRAME, defs, thinRing(106, 1.8) + markShape + thinRing(112, 0.7));
  },
  scalloped({ metal, count = 24 }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    let d = '';
    for (let i = 0; i < count; i += 1) {
      const a = polar(112, (360 / count) * i);
      const b = polar(112, (360 / count) * (i + 1));
      d += `${i === 0 ? `M ${a.join(' ')}` : ''} A ${r2((2 * Math.PI * 112) / count / 2)} ${r2((2 * Math.PI * 112) / count / 2)} 0 0 1 ${b.join(' ')} `;
    }
    return svg(FRAME, FRAME, defs, bevelRing(103, 3.6) + `<path d="${d}Z" fill="none" stroke="url(#m)" stroke-width="2"/>` + thinRing(108.5, 0.8));
  },
};

// --- Frames: rounded ---------------------------------------------------------------------------

/** The rounded photo is the square 30–230 with corners of radius 48; d grows it outward. */
function roundedPath(d) {
  const x0 = 30 - d;
  const x1 = 230 + d;
  const r = 48 + d;
  return `M ${x0 + r} ${x0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${x0 + r} V ${x1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${x1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${x1 - r} V ${x0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${x0} Z`;
}
/** Points evenly along the rounded square grown by d. */
function roundedPoints(d, count) {
  const x0 = 30 - d;
  const side = 200 + 2 * d - 2 * (48 + d);
  const r = 48 + d;
  const arc = (Math.PI / 2) * r;
  const total = 4 * (side + arc);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    let s = (total / count) * i;
    for (let k = 0; k < 4; k += 1) {
      if (s <= side) {
        const t = s;
        const pos = [
          [x0 + r + t, x0],
          [x0 + 2 * r + side, x0 + r + t],
          [x0 + r + side - t, x0 + 2 * r + side],
          [x0, x0 + r + side - t],
        ][k];
        points.push({ x: r2(pos[0]), y: r2(pos[1]), deg: k * 90 });
        break;
      }
      s -= side;
      if (s <= arc) {
        const a = (s / r) + (k * Math.PI) / 2 - Math.PI / 2;
        const centre = [
          [x0 + r + side, x0 + r],
          [x0 + r + side, x0 + r + side],
          [x0 + r, x0 + r + side],
          [x0 + r, x0 + r],
        ][k];
        points.push({ x: r2(centre[0] + r * Math.cos(a)), y: r2(centre[1] + r * Math.sin(a)), deg: r2(k * 90 + (s / arc) * 90) });
        break;
      }
      s -= arc;
    }
  }
  return points;
}
const roundedFrames = {
  ring({ metal }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    return svg(FRAME, FRAME, defs, `<path d="${roundedPath(3)}" fill="none" stroke="url(#ms)" stroke-width="7.6"/><path d="${roundedPath(3)}" fill="none" stroke="url(#m)" stroke-width="6.2"/><path d="${roundedPath(14)}" fill="none" stroke="url(#m)" stroke-width="1.8"/>`);
  },
  deco({ metal }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    let body = `<path d="${roundedPath(3)}" fill="none" stroke="url(#m)" stroke-width="4"/>`;
    // Stepped brackets at the corners.
    for (const [cx, cy, rot] of [[30, 30, 0], [230, 30, 90], [230, 230, 180], [30, 230, 270]]) {
      body += `<g transform="rotate(${rot} ${cx} ${cy}) translate(${cx} ${cy})"><path d="M -14 22 V -6 A 8 8 0 0 1 -6 -14 H 22" fill="none" stroke="url(#m)" stroke-width="2"/><path d="M -20 30 V -12 A 8 8 0 0 1 -12 -20 H 30" fill="none" stroke="url(#m)" stroke-width="1.2"/></g>`;
    }
    for (const [x, y] of [[130, 19], [241, 130], [130, 241], [19, 130]]) body += `<path d="M ${x} ${y - 7} L ${x + 5} ${y} L ${x} ${y + 7} L ${x - 5} ${y} Z" fill="url(#m)"/>`;
    return svg(FRAME, FRAME, defs, body);
  },
  pearl({ metal, count = 44 }) {
    const defs = metalDefs(metal, FRAME, FRAME) + radial('p', ENAMELS.ivory);
    let body = `<path d="${roundedPath(2)}" fill="none" stroke="url(#m)" stroke-width="3"/>`;
    for (const p of roundedPoints(11, count)) body += bead(p.x, p.y, 4, 'url(#p)');
    return svg(FRAME, FRAME, defs, body);
  },
  gem({ metal, stone }) {
    const defs = metalDefs(metal, FRAME, FRAME) + radial('g', ENAMELS[stone]);
    let body = `<path d="${roundedPath(4)}" fill="none" stroke="url(#ms)" stroke-width="7"/><path d="${roundedPath(4)}" fill="none" stroke="url(#m)" stroke-width="5.6"/>`;
    for (const p of roundedPoints(4, 8)) body += gem(p.x, p.y, 7, 'g', p.deg);
    return svg(FRAME, FRAME, defs, body + `<path d="${roundedPath(15)}" fill="none" stroke="url(#m)" stroke-width="1"/>`);
  },
  minimal({ metal }) {
    const defs = metalDefs(metal, FRAME, FRAME);
    return svg(FRAME, FRAME, defs, `<path d="${roundedPath(6)}" fill="none" stroke="url(#m)" stroke-width="1.8"/><circle cx="130" cy="24" r="3.4" fill="url(#m)"/><path d="${roundedPath(12)}" fill="none" stroke="url(#m)" stroke-width="0.7"/>`);
  },
};

// --- Ornaments: corners (top left, 160×160) ---------------------------------------------------

const K = 160;
const corners = {
  deco({ metal, steps = 3 }) {
    const defs = metalDefs(metal, K, K);
    let body = '';
    for (let i = 0; i < steps; i += 1) {
      const o = 8 + i * 9;
      const len = 132 - i * 26;
      body += `<path d="M ${o} ${len} V ${o + 10} A 10 10 0 0 1 ${o + 10} ${o} H ${len}" fill="none" stroke="url(#m)" stroke-width="${i === 0 ? 2.4 : 1.3}"/>`;
    }
    // A quarter fan in the corner.
    for (let r = 14; r <= 44; r += 10) body += `<path d="M ${8 + r} 8 A ${r} ${r} 0 0 1 8 ${8 + r}" transform="translate(${steps * 9} ${steps * 9})" fill="none" stroke="url(#m)" stroke-width="1.1"/>`;
    for (let a = 0; a <= 90; a += 15) {
      const rad = (a * Math.PI) / 180;
      const o = 8 + steps * 9;
      body += `<line x1="${o}" y1="${o}" x2="${r2(o + 44 * Math.cos(rad))}" y2="${r2(o + 44 * Math.sin(rad))}" stroke="url(#m)" stroke-width="0.9"/>`;
    }
    body += `<path d="M 138 8 l 6 -5 l 6 5 l -6 5 Z M 8 138 l -5 6 l 5 6 l 5 -6 Z" fill="url(#m)" transform="translate(0 4)"/>`;
    return svg(K, K, defs, body);
  },
  filigree({ metal, curls = 2 }) {
    const defs = metalDefs(metal, K, K);
    let body = '<path d="M 8 120 C 8 60 20 22 58 12 C 90 4 118 10 142 8" fill="none" stroke="url(#m)" stroke-width="2.2" stroke-linecap="round"/>';
    // Scrolls curling in from both edges toward the corner.
    body += '<path d="M 20 96 C 22 64 34 40 60 32 C 78 27 88 40 78 50 C 70 58 58 50 64 42" fill="none" stroke="url(#m)" stroke-width="1.6" stroke-linecap="round"/>';
    body += '<path d="M 96 22 C 70 22 48 32 40 52 C 35 66 46 74 54 66 C 60 59 54 50 47 55" fill="none" stroke="url(#m)" stroke-width="1.6" stroke-linecap="round"/>';
    if (curls > 2) body += '<path d="M 128 24 C 112 30 104 44 112 52 C 118 58 126 50 120 45" fill="none" stroke="url(#m)" stroke-width="1.2" stroke-linecap="round"/><path d="M 24 128 C 30 112 44 104 52 112 C 58 118 50 126 45 120" fill="none" stroke="url(#m)" stroke-width="1.2" stroke-linecap="round"/>';
    body += bead(142, 8, 2.6, 'url(#m)') + bead(8, 120, 2.6, 'url(#m)') + bead(22, 22, 4, 'url(#m)');
    return svg(K, K, defs, body);
  },
  sprig({ metal, leafColor = 'leaf' }) {
    const defs = metalDefs(metal, K, K) + linear('l', [...ENAMELS[leafColor], ENAMELS[leafColor][1], ENAMELS[leafColor][0]], 0, 0, K, K);
    let body = '<path d="M 14 14 Q 80 20 150 14 M 14 14 Q 20 80 14 150" fill="none" stroke="url(#l)" stroke-width="1.8" stroke-linecap="round"/>';
    for (let i = 0; i < 8; i += 1) {
      const t = 22 + i * 16;
      const size = 20 - i * 1.4;
      const bow = 6 * Math.sin((t / 150) * Math.PI) * 0.6;
      // Along the top edge, growing right; along the left edge, growing down.
      body += leaf(t + size * 0.42, 14 + bow - size * 0.2, size, size * 0.24, -24, 'url(#l)') + leaf(t + size * 0.42, 14 + bow + size * 0.2, size * 0.92, size * 0.22, 24, 'url(#l)');
      body += leaf(14 + bow - size * 0.2, t + size * 0.42, size, size * 0.24, 114, 'url(#l)') + leaf(14 + bow + size * 0.2, t + size * 0.42, size * 0.92, size * 0.22, 66, 'url(#l)');
    }
    return svg(K, K, defs, body + bead(14, 14, 5, 'url(#m)') + bead(150, 14, 2.6, 'url(#m)') + bead(14, 150, 2.6, 'url(#m)'));
  },
  floral({ metal, petal }) {
    const defs = metalDefs(metal, K, K) + radial('f', ENAMELS[petal]) + linear('l', [...ENAMELS.leaf, ENAMELS.leaf[1], ENAMELS.leaf[0]], 0, 0, K, K);
    let body = '<path d="M 6 18 C 50 18 90 22 150 12 M 18 6 C 18 50 22 90 12 150" fill="none" stroke="url(#l)" stroke-width="1.6"/>';
    for (const [x, y, s, deg] of [[60, 18, 11, -10], [100, 17, 8, 20], [136, 12, 6, 0], [18, 60, 11, 100], [17, 100, 8, 80], [12, 136, 6, 90]]) {
      body += leaf(x - 8, y + 5, s * 1.4, s * 0.45, deg + 20, 'url(#l)') + leaf(x + 6, y - 5, s * 1.2, s * 0.42, deg - 25, 'url(#l)');
    }
    body += flower(30, 30, 18, 'url(#f)', 'url(#m)', 10) + flower(66, 24, 10, 'url(#f)', 'url(#m)', 30) + flower(24, 66, 10, 'url(#f)', 'url(#m)', 0);
    return svg(K, K, defs, body);
  },
  celestial({ metal }) {
    const defs = metalDefs(metal, K, K);
    let body = '';
    for (let a = 0; a <= 90; a += 6) {
      const rad = (a * Math.PI) / 180;
      body += `<circle cx="${r2(8 + 92 * Math.cos(rad))}" cy="${r2(8 + 92 * Math.sin(rad))}" r="${a % 18 === 0 ? 1.6 : 0.9}" fill="url(#m)"/>`;
    }
    body += '<path d="M 30 14 A 20 20 0 1 0 50 44 A 16 16 0 1 1 30 14 Z" fill="url(#m)"/>';
    for (const [x, y, s, p] of [[78, 20, 7, 4], [20, 82, 7, 4], [62, 58, 5, 5], [110, 34, 4, 5], [34, 110, 4, 5], [96, 70, 3, 4], [70, 96, 3, 4]]) body += star(x, y, s, s * 0.38, p, 'url(#m)');
    return svg(K, K, defs, body);
  },
  geometric({ metal }) {
    const defs = metalDefs(metal, K, K);
    let body = '';
    for (let i = 0; i < 4; i += 1) {
      const s = 120 - i * 26;
      body += `<path d="M 8 ${8 + s} L 8 8 L ${8 + s} 8" fill="none" stroke="url(#m)" stroke-width="${i === 0 ? 2.2 : 1.1}"/><path d="M 8 ${8 + s} L ${8 + s} 8" fill="none" stroke="url(#m)" stroke-width="0.8" stroke-opacity="0.8"/>`;
    }
    body += '<path d="M 8 8 L 40 8 L 8 40 Z" fill="url(#m)"/>';
    return svg(K, K, defs, body);
  },
  laurel({ metal }) {
    const defs = metalDefs(metal, K, K);
    let body = '<path d="M 10 10 Q 70 14 148 16 M 10 10 Q 14 70 16 148" fill="none" stroke="url(#m)" stroke-width="1.4"/>';
    for (let i = 1; i <= 8; i += 1) {
      const x = 10 + i * 16;
      const size = 15 - i * 0.9;
      body += leaf(x, 9, size, size * 0.34, -20, 'url(#m)') + leaf(x - 3, 19, size, size * 0.34, 22, 'url(#m)');
      body += leaf(9, x, size, size * 0.34, 110, 'url(#m)') + leaf(19, x - 3, size, size * 0.34, 68, 'url(#m)');
    }
    return svg(K, K, defs, body + bead(12, 12, 4.4, 'url(#m)'));
  },
  dotted({ metal }) {
    const defs = metalDefs(metal, K, K);
    let body = '';
    for (const [r, n, s] of [[40, 8, 2.6], [70, 13, 2], [100, 18, 1.6], [130, 23, 1.2]]) {
      for (let i = 0; i <= n; i += 1) {
        const a = ((i / n) * 90 * Math.PI) / 180;
        body += `<circle cx="${r2(6 + r * Math.cos(a))}" cy="${r2(6 + r * Math.sin(a))}" r="${s}" fill="url(#m)"/>`;
      }
    }
    return svg(K, K, defs, body + bead(14, 14, 6, 'url(#m)'));
  },
};

// --- Ornaments: crests (480×80, centred) --------------------------------------------------------

const CW = 480;
const CH = 80;
const mirror = (inner) => `<g>${inner}</g><g transform="translate(${CW} 0) scale(-1 1)">${inner}</g>`;
const crests = {
  decoFan({ metal }) {
    const defs = metalDefs(metal, CW, CH);
    let fan = '';
    for (let a = -80; a <= 80; a += 10) {
      const rad = ((a - 90) * Math.PI) / 180;
      fan += `<line x1="240" y1="70" x2="${r2(240 + 52 * Math.cos(rad))}" y2="${r2(70 + 52 * Math.sin(rad))}" stroke="url(#m)" stroke-width="1.1"/>`;
    }
    for (const r of [22, 38, 54]) fan += `<path d="M ${240 - r} 70 A ${r} ${r} 0 0 1 ${240 + r} 70" fill="none" stroke="url(#m)" stroke-width="${r === 54 ? 2 : 1.2}"/>`;
    const side = '<path d="M 20 70 H 176 M 60 62 H 180 M 120 54 H 184" stroke="url(#m)" stroke-width="1.4"/><path d="M 20 70 l -8 -5 l -8 5 l 8 5 Z" fill="url(#m)"/>';
    return svg(CW, CH, defs, mirror(side) + fan);
  },
  flourish({ metal, loops = 1 }) {
    const defs = metalDefs(metal, CW, CH);
    let side = '<path d="M 40 40 C 90 40 130 30 160 22 C 186 16 200 30 190 40 C 182 48 168 42 174 34" fill="none" stroke="url(#m)" stroke-width="1.8" stroke-linecap="round"/>';
    side += '<path d="M 70 46 C 120 54 160 60 200 48" fill="none" stroke="url(#m)" stroke-width="1.1" stroke-linecap="round"/>';
    if (loops > 1) side += '<path d="M 120 34 C 128 20 146 18 150 28 C 153 36 144 40 140 34" fill="none" stroke="url(#m)" stroke-width="1.1" stroke-linecap="round"/>';
    side += bead(40, 40, 2.6, 'url(#m)');
    const centre = '<path d="M 240 22 L 254 40 L 240 58 L 226 40 Z" fill="url(#m)" stroke="url(#ms)" stroke-width="0.8"/><path d="M 240 30 L 247 40 L 240 50 L 233 40 Z" fill="#ffffff" fill-opacity="0.35"/>';
    return svg(CW, CH, defs, mirror(side) + centre);
  },
  laurel({ metal, leafColor }) {
    const defs = metalDefs(metal, CW, CH) + (leafColor ? linear('l', [...ENAMELS[leafColor], ENAMELS[leafColor][1], ENAMELS[leafColor][0]], 0, 0, CW, CH) : '');
    const fill = leafColor ? 'url(#l)' : 'url(#m)';
    let side = '<path d="M 228 50 Q 160 56 70 36" fill="none" stroke="url(#m)" stroke-width="1.4"/>';
    for (let i = 0; i < 9; i += 1) {
      const x = 216 - i * 16;
      const y = 50 - i * 1.4;
      const size = 18 - i * 1.1;
      side += leaf(x, y - 6, size, size * 0.34, 200, fill) + leaf(x - 2, y + 6, size, size * 0.34, 160, fill);
    }
    return svg(CW, CH, defs, mirror(side) + star(240, 46, 10, 4, 5, 'url(#m)'));
  },
  celestial({ metal }) {
    const defs = metalDefs(metal, CW, CH);
    let body = '';
    for (let i = -10; i <= 10; i += 1) {
      if (i === 0) continue;
      const x = 240 + i * 21;
      const y = 50 - Math.cos((i / 10) * (Math.PI / 2)) * 24;
      body += i % 3 === 0 ? star(x, y, 5, 2, 4, 'url(#m)') : `<circle cx="${r2(x)}" cy="${r2(y)}" r="${Math.abs(i) % 2 ? 1.4 : 2}" fill="url(#m)"/>`;
    }
    return svg(CW, CH, defs, body + star(240, 34, 16, 5, 8, 'url(#m)') + star(240, 34, 8, 3, 4, '#ffffff', 45).replace('fill="#ffffff"', 'fill="#ffffff" fill-opacity="0.4"'));
  },
  garland({ metal, petal }) {
    const defs = metalDefs(metal, CW, CH) + radial('f', ENAMELS[petal]) + linear('l', [...ENAMELS.leaf, ENAMELS.leaf[1], ENAMELS.leaf[0]], 0, 0, CW, CH);
    let side = '<path d="M 226 40 C 180 60 120 20 50 38" fill="none" stroke="url(#l)" stroke-width="1.6"/>';
    for (const [x, y, d] of [[200, 48, 200], [176, 44, 150], [150, 36, 210], [122, 32, 170], [94, 34, 200], [68, 38, 160]]) side += leaf(x, y, 15, 5, d, 'url(#l)');
    side += flower(160, 40, 8, 'url(#f)', 'url(#m)') + flower(100, 33, 6, 'url(#f)', 'url(#m)', 20);
    return svg(CW, CH, defs, mirror(side) + flower(240, 40, 16, 'url(#f)', 'url(#m)'));
  },
  chevrons({ metal }) {
    const defs = metalDefs(metal, CW, CH);
    let body = '';
    for (let i = 0; i < 4; i += 1) body += `<path d="M ${200 - i * 10} ${22 + i * 8} L 240 ${44 + i * 8} L ${280 + i * 10} ${22 + i * 8}" fill="none" stroke="url(#m)" stroke-width="${i === 0 ? 2.2 : 1.2}" stroke-linejoin="miter"/>`;
    const side = '<path d="M 40 40 H 180 M 90 48 H 176" stroke="url(#m)" stroke-width="1.2"/><circle cx="40" cy="40" r="3" fill="url(#m)"/>';
    return svg(CW, CH, defs, mirror(side) + body);
  },
};

// --- Ornaments: trims (tile, 24 high) -------------------------------------------------------------

const trims = {
  greekKey({ metal }) {
    const defs = metalDefs(metal, 24, 24);
    return svg(24, 24, defs, '<path d="M 0 21 H 21 V 3 H 6 V 15 H 15 V 9 H 11" fill="none" stroke="url(#m)" stroke-width="1.8" stroke-linecap="square"/><path d="M 21 21 H 24" stroke="url(#m)" stroke-width="1.8"/>');
  },
  fans({ metal }) {
    const defs = metalDefs(metal, 32, 24);
    let body = '<path d="M 4 22 A 12 12 0 0 1 28 22" fill="none" stroke="url(#m)" stroke-width="1.6"/><path d="M 10 22 A 6 6 0 0 1 22 22" fill="none" stroke="url(#m)" stroke-width="1.1"/>';
    for (const a of [-60, -30, 0, 30, 60]) {
      const rad = ((a - 90) * Math.PI) / 180;
      body += `<line x1="16" y1="22" x2="${r2(16 + 12 * Math.cos(rad))}" y2="${r2(22 + 12 * Math.sin(rad))}" stroke="url(#m)" stroke-width="0.8"/>`;
    }
    return svg(32, 24, defs, body + '<path d="M 0 23 H 32" stroke="url(#m)" stroke-width="1.2"/>');
  },
  waves({ metal }) {
    const defs = metalDefs(metal, 48, 24);
    return svg(48, 24, defs, '<path d="M 0 12 C 8 4 16 4 24 12 S 40 20 48 12" fill="none" stroke="url(#m)" stroke-width="1.8"/><path d="M 0 17 C 8 9 16 9 24 17 S 40 25 48 17" fill="none" stroke="url(#m)" stroke-width="0.9"/>');
  },
  beads({ metal, pearl }) {
    const defs = metalDefs(metal, 18, 24) + radial('p', ENAMELS.ivory);
    return svg(18, 24, defs, `<path d="M 0 12 H 18" stroke="url(#m)" stroke-width="0.8"/>${bead(9, 12, 5, pearl ? 'url(#p)' : 'url(#m)')}<circle cx="0" cy="12" r="1.6" fill="url(#m)"/><circle cx="18" cy="12" r="1.6" fill="url(#m)"/>`);
  },
  vine({ metal, leafColor = 'leaf' }) {
    const defs = metalDefs(metal, 48, 24) + linear('l', [...ENAMELS[leafColor], ENAMELS[leafColor][1], ENAMELS[leafColor][0]], 0, 0, 48, 24);
    return svg(48, 24, defs, `<path d="M 0 12 C 12 4 12 4 24 12 S 36 20 48 12" fill="none" stroke="url(#l)" stroke-width="1.4"/>${leaf(12, 6, 10, 3.6, -25, 'url(#l)')}${leaf(36, 18, 10, 3.6, 25, 'url(#l)')}<circle cx="24" cy="12" r="1.8" fill="url(#m)"/>`);
  },
  stars({ metal }) {
    const defs = metalDefs(metal, 28, 24);
    return svg(28, 24, defs, `${star(9, 12, 6, 2.3, 4, 'url(#m)')}<circle cx="21" cy="12" r="1.4" fill="url(#m)"/><path d="M 0 22 H 28" stroke="url(#m)" stroke-width="0.8"/>`);
  },
};

const GENERATORS = {
  circle: circleFrames,
  rounded: roundedFrames,
  corner: corners,
  crest: crests,
  trim: trims,
};

const prefixes = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
let count = 0;
for (const design of DESIGNS.filter((d) => d.vector && (prefixes.length === 0 || prefixes.some((p) => d.id.startsWith(p))))) {
  const family = GENERATORS[design.vector.family];
  const draw = family?.[design.vector.style];
  if (!draw) throw new Error(`${design.id}: no drawing for ${design.vector.family}/${design.vector.style}`);
  await writeFile(path.join(OUT, `${design.id}.svg`), draw(design.vector.options ?? {}));
  count += 1;
}
console.log(`${count} vector designs written to ${path.relative(process.cwd(), OUT)}`);
