/**
 * Yavaya Rush, course one: "La Calle del Mercado".
 *
 * Plain data, in metres, with +z forward: a street, stepping stones across a
 * fountain pool, swinging market signs, rooftop steps, moving carts and a
 * narrow wall to the finish arch. The engine (game.ts) builds and plays it;
 * a server can read the same numbers to judge whether a submitted time is
 * possible (the shortest honest run is the length over the top speed).
 *
 * Tuned to the jump in game.ts (about 1.7 m high, 5 m long at a run): no gap
 * on the main path is wider than 2.8 m, so a miss is a mistake, not a trap.
 */
export type Box = {
  /** Centre x, top y, centre z; then width (x), height (y), depth (z). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
  /** A platform that slides: along `axis`, `range` metres each way, one cycle every `period` seconds. */
  move?: { axis: 'x' | 'z'; range: number; period: number; phase: number };
};

export const COLORS = {
  stone: 0xd9c9a8,
  stoneDark: 0xb9a888,
  volcanic: 0x4a4650,
  roof: 0xc0603c,
  cart: 0x2f8f83,
  wall: 0xe7dcc4,
  gold: 0xd8b25a,
  water: 0x2f7fa3,
} as const;

export const SPEED = 7;
export const COURSE_LENGTH = 116;
/** Nobody finishes faster than a straight sprint with no stops; less than this is not a run. */
export const MINIMUM_SECONDS = Math.floor((COURSE_LENGTH / SPEED) * 0.9);

export const PLATFORMS: Box[] = [
  // 1. The street.
  { x: 0, y: 0, z: 7, w: 8, h: 3, d: 14, color: COLORS.stone },
  // 2. Stepping stones across the fountain pool.
  { x: -1.5, y: 0, z: 16.6, w: 1.9, h: 3, d: 1.9, color: COLORS.volcanic },
  { x: 1.0, y: 0, z: 19.4, w: 1.9, h: 3, d: 1.9, color: COLORS.volcanic },
  { x: -0.6, y: 0, z: 22.3, w: 1.9, h: 3, d: 1.9, color: COLORS.volcanic },
  { x: 1.7, y: 0, z: 25.1, w: 1.9, h: 3, d: 1.9, color: COLORS.volcanic },
  { x: -0.9, y: 0, z: 27.9, w: 1.9, h: 3, d: 1.9, color: COLORS.volcanic },
  // 3. The market street, under the swinging signs.
  { x: 0, y: 0, z: 38, w: 7, h: 3, d: 16, color: COLORS.stone },
  // 4. Steps up to the roofs.
  { x: 0, y: 0.9, z: 47.2, w: 5, h: 3.9, d: 2.4, color: COLORS.stoneDark },
  { x: 0, y: 1.8, z: 49.6, w: 5, h: 4.8, d: 2.4, color: COLORS.stone },
  { x: 0, y: 2.7, z: 52.0, w: 5, h: 5.7, d: 2.4, color: COLORS.stoneDark },
  { x: 0, y: 3.6, z: 54.4, w: 5, h: 6.6, d: 2.4, color: COLORS.stone },
  { x: 0, y: 3.6, z: 61, w: 6, h: 6.6, d: 10.8, color: COLORS.roof },
  // 5. Carts crossing the gap between two roofs.
  { x: 0, y: 3.6, z: 69.6, w: 3, h: 0.5, d: 3, color: COLORS.cart, move: { axis: 'x', range: 2.4, period: 4.2, phase: 0 } },
  { x: 0, y: 3.6, z: 74.8, w: 3, h: 0.5, d: 3, color: COLORS.cart, move: { axis: 'x', range: 2.4, period: 3.6, phase: 1.6 } },
  { x: 0, y: 3.6, z: 79.4, w: 2.4, h: 0.5, d: 2.2, color: COLORS.gold },
  { x: 0, y: 3.6, z: 86, w: 6, h: 6.6, d: 8, color: COLORS.roof },
  // 6. The wall: wide and safe, or narrow and golden.
  { x: -0.9, y: 3.6, z: 99, w: 1.1, h: 6.6, d: 18, color: COLORS.wall },
  { x: 1.6, y: 3.6, z: 99, w: 0.55, h: 6.6, d: 18, color: COLORS.gold },
  // The finish terrace.
  { x: 0, y: 3.6, z: 113, w: 8, h: 6.6, d: 10, color: COLORS.stone },
];

/** Where a fall or a knock puts the player back: the start, then one after each hard part. */
export const CHECKPOINTS: Array<{ x: number; y: number; z: number }> = [
  { x: 0, y: 0, z: 2 },
  { x: 0, y: 0, z: 31.5 },
  { x: 0, y: 3.6, z: 57 },
  { x: 0, y: 3.6, z: 83.5 },
];

/** Market signs on chains, swinging across the street. */
export const SIGNS: Array<{ z: number; phase: number; speed: number; color: number }> = [
  { z: 35.5, phase: 0, speed: 1.7, color: 0xec4d73 },
  { z: 39.5, phase: 1.9, speed: 2.0, color: 0x36bbe6 },
  { z: 43.5, phase: 0.8, speed: 1.8, color: 0xa77bff },
];

export const FINISH_Z = 114;

const row = (x: number, y: number, from: number, to: number, step: number) => {
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let z = from; z <= to; z += step) out.push({ x, y, z });
  return out;
};

/** Coins: a trail along the way, and a richer one along the narrow golden wall. */
export const COINS: Array<{ x: number; y: number; z: number }> = [
  ...row(0, 1, 5, 11, 3),
  { x: -1.5, y: 1.1, z: 16.6 },
  { x: -0.6, y: 1.1, z: 22.3 },
  { x: -0.9, y: 1.1, z: 27.9 },
  { x: 2.4, y: 1, z: 37.5 },
  { x: -2.4, y: 1, z: 41.5 },
  { x: 0, y: 3.0, z: 49.6 },
  { x: 0, y: 4.7, z: 60 },
  { x: 0, y: 4.9, z: 72.2 },
  { x: 0, y: 4.7, z: 79.4 },
  ...row(1.6, 4.6, 92, 106, 2),
];
