import { TRIALS, type Hazard, type Plat, type Point, type Theme, type Trial } from './data';

/**
 * Courses built from pieces (docs/PLAY.md): La Ruta del Día, a new course
 * every day, and the districts' courses, Barrio and Diáspora.
 *
 * Every piece is a stretch of one of the five trials, moved along the course
 * (and sometimes mirrored left for right), with its hazards on the same
 * cycles: nothing is made easier. Each has its own route in the tests
 * (tests/helpers/course-routes.ts), and the tests play many days end to end
 * before a day can be offered, so a course is never impossible.
 *
 * A piece begins where the last one ended: at `oz` along the course, at
 * height `oy`, on the end of a flat stretch at least five metres wide. It
 * ends the same way, `length` further on and `rise` higher.
 */

export type PieceId =
  | 'piedras'
  | 'plataforma'
  | 'pendulos'
  | 'barra_salto'
  | 'fuego'
  | 'barra_movil'
  | 'puertas'
  | 'respiraderos'
  | 'puente'
  | 'atajo'
  | 'viga'
  | 'torre'
  | 'cornisas'
  | 'salto_largo';

export type Piece = {
  id: PieceId;
  length: number;
  rise: number;
  /** The test route's usual time across this piece (the median over two hundred days, tests/unit/play-courses.test.ts): a course's reference, for its medals, is their sum. */
  seconds: number;
  /** Uses fire (left out of courses whose theme has none). */
  fire?: boolean;
  /** `m` is 1, or -1 for the mirror image. */
  build(oz: number, oy: number, m: number): { platforms: Plat[]; hazards: Hazard[]; hint?: string };
};

const P = (kind: Plat['kind'], x: number, y: number, z: number, w: number, d: number, h = 6, extra: Partial<Plat> = {}): Plat => ({ kind, x, y, z, w, d, h, ...extra });

export const PIECES: Record<PieceId, Piece> = {
  // Bronce: three stones at a run's jump apart, to a landing.
  piedras: {
    id: 'piedras',
    length: 22.5,
    rise: 0,
    seconds: 4.0,
    build: (oz, oy, m) => ({
      platforms: [P('stone', 0, oy, oz + 2.6, 2.6, 2.6), P('stone', 1.2 * m, oy, oz + 7.8, 2.6, 2.6), P('stone', -0.6 * m, oy, oz + 13.0, 2.6, 2.6), P('basalt', 0, oy, oz + 19.5, 5, 6)],
      hazards: [],
      hint: 'jump',
    }),
  },
  // Bronce: a platform that crosses the lava, side to side.
  plataforma: {
    id: 'plataforma',
    length: 16.5,
    rise: 0,
    seconds: 2.5,
    build: (oz, oy) => ({
      platforms: [P('obsidian', 0, oy, oz + 4.3, 3, 3.2, 0.5, { move: { axis: 'x', range: 2.6, period: 4.0, phase: 0 } }), P('basalt', 0, oy, oz + 12.5, 5, 8)],
      hazards: [],
      hint: 'moving',
    }),
  },
  // Bronce: up a ledge, and the walk of the two pendulums.
  pendulos: {
    id: 'pendulos',
    length: 25,
    rise: 1.2,
    seconds: 3.3,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy + 1.2, oz + 4.5, 5, 9, 7.2), P('basalt', 0, oy + 1.2, oz + 14, 3.2, 10, 7.2), P('basalt', 0, oy + 1.2, oz + 22, 5, 6, 7.2)],
      hazards: [
        { kind: 'pendulum', x: 0, y: oy + 6.4, z: oz + 11, length: 4.2, amp: 1.0, period: 2.6, phase: 0, axis: 'x', r: 0.6 },
        { kind: 'pendulum', x: 0, y: oy + 6.4, z: oz + 15.5, length: 4.2, amp: 1.0, period: 2.6, phase: Math.PI, axis: 'x', r: 0.6 },
      ],
      hint: 'pendulum',
    }),
  },
  // Plata: a runway, a bar to slide under, and the six-metre gap that needs a sprint.
  barra_salto: {
    id: 'barra_salto',
    length: 32,
    rise: 0,
    seconds: 4.0,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy, oz + 9, 5, 18), P('basalt', 0, oy, oz + 28, 5, 8)],
      hazards: [{ kind: 'bar', x: 0, y: oy + 1.0, z: oz + 13, w: 5.4, h: 0.6, d: 0.5 }],
      hint: 'slide',
    }),
  },
  // Plata: a curtain of fire on a narrow walk; only a roll passes.
  fuego: {
    id: 'fuego',
    length: 18,
    rise: 0,
    seconds: 4.0,
    fire: true,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy, oz + 6.5, 3, 8), P('basalt', 0, oy, oz + 15, 5, 6)],
      hazards: [{ kind: 'curtain', x: 0, y: oy, z: oz + 8.4, w: 3, d: 0.7, h: 2.6 }],
      hint: 'roll',
    }),
  },
  // Plata: a moving bar, a fixed one at the edge, and a seven-metre gap: slide, then jump.
  barra_movil: {
    id: 'barra_movil',
    length: 35,
    rise: 0,
    seconds: 4.3,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy, oz + 11, 5, 22), P('basalt', 0, oy, oz + 32, 5, 6)],
      hazards: [
        { kind: 'bar', x: 0, y: oy + 1.0, z: oz + 11.5, w: 5.4, h: 0.6, d: 0.5, move: { axis: 'z', range: 1.6, period: 3.0, phase: 0 } },
        { kind: 'bar', x: 0, y: oy + 1.0, z: oz + 20.6, w: 5.4, h: 0.6, d: 0.5 },
      ],
      hint: 'slide_jump',
    }),
  },
  // Oro: two gates out of step.
  puertas: {
    id: 'puertas',
    length: 16,
    rise: 0,
    seconds: 4.2,
    build: (oz, oy) => ({
      platforms: [
        P('basalt', 0, oy, oz + 8, 5, 16),
        P('gate', 0, oy + 3.0, oz + 6.5, 5, 0.6, 3.0, { gate: { period: 3.0, open: 1.6, phase: 0 } }),
        P('gate', 0, oy + 3.0, oz + 12.5, 5, 0.6, 3.0, { gate: { period: 3.0, open: 1.6, phase: 1.1 } }),
      ],
      hazards: [],
      hint: 'gates',
    }),
  },
  // Oro: the field of vents, firing in a wave.
  respiraderos: {
    id: 'respiraderos',
    length: 16,
    rise: 0,
    seconds: 4.1,
    fire: true,
    build: (oz, oy) => {
      const hazards: Hazard[] = [];
      for (let row = 0; row < 4; row += 1) for (const x of [-1.6, 0, 1.6]) hazards.push({ kind: 'vent', x, z: oz + 7 + row * 2.4, y: oy, r: 0.75, period: 3.2, on: 1.2, phase: row * 0.8 });
      return { platforms: [P('basalt', 0, oy, oz + 8, 5, 16)], hazards, hint: 'vents' };
    },
  },
  // Oro: the crumbling bridge.
  puente: {
    id: 'puente',
    length: 16.5,
    rise: 0,
    seconds: 2.0,
    build: (oz, oy) => ({
      platforms: [P('crumble', 0, oy, oz + 2, 2.4, 2.4, 0.6), P('crumble', 0, oy, oz + 5.4, 2.4, 2.4, 0.6), P('crumble', 0, oy, oz + 8.8, 2.4, 2.4, 0.6), P('basalt', 0, oy, oz + 13.5, 5, 6)],
      hazards: [],
      hint: 'crumble',
    }),
  },
  // Oro: the shortcut. A narrow runway, a 7.6-metre gap: sprint, jump, dodge in the air.
  atajo: {
    id: 'atajo',
    length: 28.5,
    rise: 0,
    seconds: 3.3,
    build: (oz, oy, m) => ({
      platforms: [P('obsidian', 2.2 * m, oy, oz + 6.45, 2.2, 12.9), P('basalt', 0, oy, oz + 24.5, 6, 8)],
      hazards: [],
      hint: 'air_dodge',
    }),
  },
  // Oro: a round with a low beam turning on it: jump it as it comes.
  viga: {
    id: 'viga',
    length: 15.5,
    rise: 0,
    seconds: 2.4,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy, oz + 4, 8, 8), P('basalt', 0, oy, oz + 12.5, 5, 6)],
      hazards: [{ kind: 'beam', x: 0, z: oz + 4, y: oy + 0.35, length: 3.9, inner: 0.3, speed: 1.9, phase: 0, r: 0.22 }],
      hint: 'beam',
    }),
  },
  // Obsidiana: up the broken tower, ledge by ledge.
  torre: {
    id: 'torre',
    length: 20.4,
    rise: 3.9,
    seconds: 3.6,
    build: (oz, oy, m) => ({
      platforms: [
        P('stone', 1.6 * m, oy + 1.3, oz + 2.2, 2.2, 2.4, 8),
        P('stone', -0.6 * m, oy + 2.6, oz + 6.6, 2.0, 2.4, 9),
        P('stone', 1.4 * m, oy + 3.9, oz + 11.0, 1.8, 2.4, 10),
        P('basalt', 0, oy + 3.9, oz + 17.4, 5, 6, 10),
      ],
      hazards: [],
      hint: 'climb',
    }),
  },
  // Obsidiana: narrow ledges up, a pendulum over each, then two crumbling ones.
  cornisas: {
    id: 'cornisas',
    length: 23.9,
    rise: 3.6,
    seconds: 4.3,
    build: (oz, oy) => ({
      platforms: [
        P('stone', 0, oy + 1.2, oz + 2.5, 1.4, 2.6, 11),
        P('stone', 0, oy + 2.4, oz + 6.9, 1.4, 2.6, 12),
        P('crumble', 0, oy + 2.4, oz + 11.3, 1.6, 2.4, 0.6),
        P('crumble', 0, oy + 2.4, oz + 15.5, 1.6, 2.4, 0.6),
        P('basalt', 0, oy + 3.6, oz + 20.9, 5, 6, 13),
      ],
      hazards: [
        { kind: 'pendulum', x: 0, y: oy + 6.4, z: oz + 2.5, length: 4.2, amp: 0.95, period: 2.4, phase: 0.4, axis: 'x', r: 0.55 },
        { kind: 'pendulum', x: 0, y: oy + 7.6, z: oz + 6.9, length: 4.2, amp: 0.95, period: 2.4, phase: 0.4 + Math.PI, axis: 'x', r: 0.55 },
      ],
      hint: 'pendulum',
    }),
  },
  // Obsidiana: a runway, a bar at sprint speed, then the 7.6-metre gap with a dodge in the air.
  salto_largo: {
    id: 'salto_largo',
    length: 27.6,
    rise: 0,
    seconds: 3.0,
    build: (oz, oy) => ({
      platforms: [P('basalt', 0, oy, oz + 7, 3.2, 14), P('basalt', 0, oy, oz + 24.6, 5, 6)],
      hazards: [{ kind: 'bar', x: 0, y: oy + 1.0, z: oz + 10.9, w: 3.6, h: 0.6, d: 0.5 }],
      hint: 'air_dodge',
    }),
  },
};

export type Placed = { piece: PieceId; oz: number; oy: number; m: number; solidBase: number; hazardBase: number };

/** A course of pieces, in order: the start, each piece, the finish. `placed` says where each one went (the tests' routes need it). */
export function assemble(id: string, kind: 'daily' | 'district', theme: Theme, order: Array<{ piece: PieceId; m: number }>): Trial & { placed: Placed[] } {
  const platforms: Plat[] = [P('basalt', 0, 0, 4, 5, 8)];
  const hazards: Hazard[] = [];
  const checkpoints: Point[] = [{ x: 0, y: 0, z: 2 }];
  const hints: Trial['hints'] = [];
  const placed: Placed[] = [];
  let oz = 8;
  let oy = 0;
  let seconds = 1.2;
  for (const { piece, m } of order) {
    const p = PIECES[piece];
    // A checkpoint on the stretch before every other piece.
    if (placed.length && placed.length % 2 === 0) checkpoints.push({ x: 0, y: oy, z: oz - 1.4 });
    const built = p.build(oz, oy, m);
    placed.push({ piece, oz, oy, m, solidBase: platforms.length, hazardBase: hazards.length });
    platforms.push(...built.platforms);
    hazards.push(...built.hazards);
    if (built.hint && !hints.some((h) => h.key === built.hint)) hints.push({ z: oz - 2, key: built.hint });
    oz += p.length;
    oy += p.rise;
    seconds += p.seconds;
  }
  platforms.push(P('gold', 0, oy, oz + 3.5, 6, 7, oy + 6));
  return {
    id,
    kind,
    theme,
    tier: 0,
    start: { x: 0, y: 0, z: 2 },
    floor: -6,
    platforms,
    hazards,
    checkpoints,
    finish: { x: 0, y: oy, z: oz + 4.5, w: 6, h: 1, d: 4 },
    hints,
    reference: Math.round(seconds * 10) / 10,
    placed,
  };
}

// --- La Ruta del Día -----------------------------------------------------------------------------

/** How many pieces a day's route has: our default, about forty seconds of the trials' hardest stretches. */
export const DAILY_PIECES = 7;

/** A day as `YYYY-MM-DD`, in UTC: the same route for everyone, everywhere, from midnight UTC. */
export function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A small seeded generator (mulberry32): the same day always gives the same course. */
function seeded(text: string) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyCourse(day: string): Trial & { placed: Placed[] } {
  const rand = seeded(`yavaya-ruta-${day}`);
  const pool = Object.keys(PIECES) as PieceId[];
  const order: Array<{ piece: PieceId; m: number }> = [];
  while (order.length < DAILY_PIECES) {
    const piece = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
    order.push({ piece, m: rand() < 0.5 ? -1 : 1 });
  }
  return assemble(`dia-${day}`, 'daily', 'volcan', order);
}

// --- The districts' courses ---------------------------------------------------------------------

export const DISTRICT_COURSES: Array<Trial & { placed: Placed[] }> = [
  // Barrio: rooftops, a cart, swinging signs, shutters, a bridge of loose boards, a climb. No fire.
  assemble('barrio', 'district', 'barrio', [
    { piece: 'piedras', m: 1 },
    { piece: 'plataforma', m: 1 },
    { piece: 'pendulos', m: 1 },
    { piece: 'puertas', m: 1 },
    { piece: 'barra_movil', m: 1 },
    { piece: 'puente', m: 1 },
    { piece: 'torre', m: -1 },
    { piece: 'viga', m: 1 },
  ]),
  // Diáspora: an airport. Belts, barriers, security gates, a luggage arm, long jumps. No fire.
  assemble('diaspora', 'district', 'diaspora', [
    { piece: 'barra_salto', m: 1 },
    { piece: 'plataforma', m: 1 },
    { piece: 'puertas', m: 1 },
    { piece: 'viga', m: 1 },
    { piece: 'atajo', m: -1 },
    { piece: 'salto_largo', m: 1 },
    { piece: 'torre', m: 1 },
    { piece: 'cornisas', m: 1 },
  ]),
];

/** Any course by its id: a trial, a district's course, or a day's route (`dia-YYYY-MM-DD`). */
export function courseById(id: string): Trial | null {
  const trial = TRIALS.find((t) => t.id === id) ?? DISTRICT_COURSES.find((c) => c.id === id);
  if (trial) return trial;
  const day = /^dia-(\d{4}-\d{2}-\d{2})$/.exec(id)?.[1];
  if (day && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && dayOf(new Date(`${day}T00:00:00Z`)) === day) return dailyCourse(day);
  return null;
}
