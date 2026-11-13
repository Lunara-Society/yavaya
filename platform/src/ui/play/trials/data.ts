import type { Box } from '../engine/body';

/**
 * Pruebas de Maestría (docs/PLAY.md): five short trials, Bronce to Guardián.
 * Plain numbers, in metres, +z forward, played by trials/sim.ts.
 *
 * Every trial teaches, tests, then combines:
 *   I   Bronce    — jumping and timing: stones, a moving platform, pendulums.
 *   II  Plata     — the moveset: slide under bars, roll through fire, a sprint gap, slide → jump.
 *   III Oro       — reading patterns: timed gates, a field of vents, a crumbling bridge,
 *                   a choice between the long safe way and a shortcut that needs an air dodge.
 *   IV  Obsidiana — all of it, upward: a broken tower of narrow ledges.
 *   V   Guardián  — the Centinela de Obsidiana, a guardian beaten by movement alone.
 *
 * The rules that keep it fair: every hazard is on a fixed cycle that starts
 * with the attempt (nothing random, nothing aimed at the player); every
 * danger glows before it acts; every gap is one of three published sizes
 * (a run, a sprint, a sprint with an air dodge); and each trial is played to
 * the end in a test, with the moveset, before it ships.
 */

export type Kind = 'stone' | 'basalt' | 'obsidian' | 'gold' | 'crumble' | 'gate';

export type Plat = Box & {
  kind: Kind;
  /** A gate: a wall that sinks into the floor (`open` seconds) and rises again, every `period`. */
  gate?: { period: number; open: number; phase: number };
};

export type Hazard =
  /** A stone weight on a chain, swinging across the path (`axis` x) or along it (z). */
  | { kind: 'pendulum'; x: number; y: number; z: number; length: number; amp: number; period: number; phase: number; axis: 'x' | 'z'; r: number }
  /** A bar turning around a centre at a height: low ones are jumped, high ones slid under. */
  | { kind: 'beam'; x: number; z: number; y: number; length: number; inner: number; speed: number; phase: number; r: number }
  /** A bar across the path; `y` is its bottom. Low (bottom above 0.9 m over the floor): slide under it. */
  | { kind: 'bar'; x: number; y: number; z: number; w: number; h: number; d: number; move?: { axis: 'x' | 'z'; range: number; period: number; phase: number } }
  /** A vent of fire: off, a warning glow (WARN seconds), then on, every `period`. A roll passes through it. */
  | { kind: 'vent'; x: number; z: number; y: number; r: number; period: number; on: number; phase: number }
  /** A curtain of fire that never stops: only a roll passes. */
  | { kind: 'curtain'; x: number; y: number; z: number; w: number; d: number; h: number };

export type Point = { x: number; y: number; z: number };

export type Boss = {
  centre: { x: number; z: number; y: number };
  /** Each phase: plates to step on, and the hazards that guard them. */
  phases: Array<{ plates: Array<{ x: number; z: number }>; hazards: Hazard[] }>;
  /** Platforms that rise when the last phase is won, up to the finish. */
  exit: Plat[];
};

export type TrialId = 'bronce' | 'plata' | 'oro' | 'obsidiana' | 'guardian';

/** What a course is, for the screen: a numbered trial, the day's route, or a district's course. */
export type CourseKind = 'trial' | 'daily' | 'district';
/** How it is drawn (modes/trial.ts): the volcano of the trials, a barrio's rooftops, an airport. */
export type Theme = 'volcan' | 'barrio' | 'diaspora';

export type Trial = {
  /** A trial's id, `dia-YYYY-MM-DD` for a day's route, or a district course's id (trials/courses.ts). */
  id: string;
  kind?: CourseKind;
  theme?: Theme;
  /** I to V for the trials; 0 for the other courses. */
  tier: number;
  start: Point;
  platforms: Plat[];
  hazards: Hazard[];
  checkpoints: Point[];
  /** Reaching this box, standing, finishes the trial. */
  finish: Box;
  /** Hints shown the first time the player reaches z (i18n keys `play.trials.hint.*`). */
  hints: Array<{ z: number; key: string }>;
  /** Below this the player has fallen. */
  floor: number;
  /** The test route's time, in seconds: what the medals are measured against (`medal`); tests/unit/play-trials.test.ts keeps it honest. */
  reference: number;
  boss?: Boss;
};

/** How long a vent glows before it fires, and a gate before it closes. */
export const WARN = 0.7;

const P = (kind: Kind, x: number, y: number, z: number, w: number, d: number, h = 6, extra: Partial<Plat> = {}): Plat => ({ kind, x, y, z, w, d, h, ...extra });

// --- I. Bronce: Las Gradas del Volcán --------------------------------------------------
const bronce: Trial = {
  id: 'bronce',
  kind: 'trial',
  tier: 1,
  start: { x: 0, y: 0, z: 2 },
  floor: -6,
  platforms: [
    P('basalt', 0, 0, 4, 6, 10),
    // Stones: run jumps.
    P('stone', 0, 0, 11.6, 2.6, 2.6),
    P('stone', 1.2, 0, 16.8, 2.6, 2.6),
    P('stone', -0.6, 0, 22.0, 2.6, 2.6),
    P('basalt', 0, 0, 28.5, 5, 6),
    // A platform crossing the lava.
    P('obsidian', 0, 0, 35.8, 3, 3.2, 0.5, { move: { axis: 'x', range: 2.6, period: 4.0, phase: 0 } }),
    P('basalt', 0, 0, 44.0, 5, 8),
    // Up a ledge, then the walk of the pendulums.
    P('basalt', 0, 1.2, 52.5, 5, 9, 7.2),
    P('basalt', 0, 1.2, 62.0, 3.2, 10, 7.2),
    P('gold', 0, 1.2, 70.5, 6, 7, 7.2),
  ],
  hazards: [
    { kind: 'pendulum', x: 0, y: 6.4, z: 59.0, length: 4.2, amp: 1.0, period: 2.6, phase: 0, axis: 'x', r: 0.6 },
    { kind: 'pendulum', x: 0, y: 6.4, z: 63.5, length: 4.2, amp: 1.0, period: 2.6, phase: Math.PI, axis: 'x', r: 0.6 },
  ],
  checkpoints: [
    { x: 0, y: 0, z: 2 },
    { x: 0, y: 0, z: 27 },
    { x: 0, y: 0, z: 43 },
  ],
  finish: { x: 0, y: 1.2, z: 71.5, w: 6, h: 1, d: 4 },
  hints: [
    { z: 4, key: 'jump' },
    { z: 30, key: 'moving' },
    { z: 52, key: 'pendulum' },
  ],
  reference: 11.9,
};

// --- II. Plata: El Paso Quebrado ---------------------------------------------------------
const plata: Trial = {
  id: 'plata',
  kind: 'trial',
  tier: 2,
  start: { x: 0, y: 0, z: 2 },
  floor: -6,
  platforms: [
    // A long runway: build momentum, then slide under the bar.
    P('basalt', 0, 0, 9, 5, 18),
    // The sprint gap (6 m): only a run with momentum makes it.
    P('basalt', 0, 0, 28, 5, 8),
    // The curtain of fire on a narrow walk: roll through it.
    P('basalt', 0, 0, 38.5, 3, 8),
    // Bars that move: time the slide.
    P('basalt', 0, 0, 55, 5, 22),
    // Slide → jump: a bar right at the edge of a long gap (7 m).
    P('gold', 0, 0, 76.5, 6, 7),
  ],
  hazards: [
    { kind: 'bar', x: 0, y: 1.0, z: 13, w: 5.4, h: 0.6, d: 0.5 },
    { kind: 'curtain', x: 0, y: 0, z: 40.4, w: 3, d: 0.7, h: 2.6 },
    { kind: 'bar', x: 0, y: 1.0, z: 55.5, w: 5.4, h: 0.6, d: 0.5, move: { axis: 'z', range: 1.6, period: 3.0, phase: 0 } },
    { kind: 'bar', x: 0, y: 1.0, z: 64.6, w: 5.4, h: 0.6, d: 0.5 },
  ],
  checkpoints: [
    { x: 0, y: 0, z: 2 },
    { x: 0, y: 0, z: 26 },
    { x: 0, y: 0, z: 46 },
  ],
  finish: { x: 0, y: 0, z: 77.5, w: 6, h: 1, d: 4 },
  hints: [
    { z: 4, key: 'slide' },
    { z: 25, key: 'sprint' },
    { z: 33, key: 'roll' },
    { z: 53, key: 'slide_jump' },
  ],
  reference: 13.0,
};

// --- III. Oro: El Templo de Obsidiana ------------------------------------------------------
const oroVents: Hazard[] = [];
for (let row = 0; row < 4; row += 1) {
  for (const x of [-1.6, 0, 1.6]) oroVents.push({ kind: 'vent', x, z: 23 + row * 2.4, y: 0, r: 0.75, period: 3.2, on: 1.2, phase: row * 0.8 });
}
const oro: Trial = {
  id: 'oro',
  kind: 'trial',
  tier: 3,
  start: { x: 0, y: 0, z: 2 },
  floor: -6,
  platforms: [
    P('basalt', 0, 0, 8, 5, 16),
    // Two gates in a row, out of step: walk the rhythm.
    P('gate', 0, 3.0, 6.5, 5, 0.6, 3.0, { gate: { period: 3.0, open: 1.6, phase: 0 } }),
    P('gate', 0, 3.0, 12.5, 5, 0.6, 3.0, { gate: { period: 3.0, open: 1.6, phase: 1.1 } }),
    // The field of vents: they fire in a wave, row after row.
    P('basalt', 0, 0, 24, 5, 16),
    // The crumbling bridge: keep moving.
    P('crumble', 0, 0, 34.0, 2.4, 2.4, 0.6),
    P('crumble', 0, 0, 37.4, 2.4, 2.4, 0.6),
    P('crumble', 0, 0, 40.8, 2.4, 2.4, 0.6),
    P('basalt', 0, 0, 45.5, 6, 6),
    // The choice. Left: the long way, four run jumps round the side.
    P('stone', -3.6, 0, 51.9, 2.4, 2.4),
    P('stone', -4.2, 0, 56.9, 2.4, 2.4),
    P('stone', -3.6, 0, 61.9, 2.4, 2.4),
    P('stone', -1.8, 0, 66.7, 2.4, 2.4),
    // Right: a runway and one long gap (7.6 m): sprint, jump, dodge in the air.
    P('obsidian', 2.2, 0, 54.95, 2.2, 12.9),
    // Both meet at the beam's round.
    P('basalt', 0, 0, 73, 8, 8),
    P('gold', 0, 0, 82, 6, 5),
  ],
  hazards: [
    ...oroVents,
    { kind: 'beam', x: 0, z: 73, y: 0.35, length: 3.9, inner: 0.3, speed: 1.9, phase: 0, r: 0.22 },
  ],
  checkpoints: [
    { x: 0, y: 0, z: 2 },
    { x: 0, y: 0, z: 18 },
    { x: 0, y: 0, z: 44 },
  ],
  finish: { x: 0, y: 0, z: 82.5, w: 6, h: 1, d: 3 },
  hints: [
    { z: 2, key: 'gates' },
    { z: 20, key: 'vents' },
    { z: 32, key: 'crumble' },
    { z: 45, key: 'choice' },
    { z: 69, key: 'beam' },
  ],
  reference: 16.9,
};

// --- IV. Obsidiana: La Torre Rota ----------------------------------------------------------
const obsidiana: Trial = {
  id: 'obsidiana',
  kind: 'trial',
  tier: 4,
  start: { x: 0, y: 0, z: 2 },
  floor: -8,
  platforms: [
    P('basalt', 0, 0, 4, 5, 8),
    // The climb: ledges up the broken tower.
    P('stone', 1.6, 1.3, 10.2, 2.2, 2.4, 8),
    P('stone', -0.6, 2.6, 14.6, 2.0, 2.4, 9),
    P('stone', 1.4, 3.9, 19.0, 1.8, 2.4, 10),
    P('obsidian', 0, 3.9, 25.6, 3, 2.6, 0.5, { move: { axis: 'x', range: 2.2, period: 3.4, phase: 0.6 } }),
    P('basalt', 0, 3.9, 33, 5, 7, 10),
    // A landing guarded by a turning low beam, then a runway to the long gap.
    P('basalt', 0, 3.9, 45.5, 3.2, 14, 10),
    P('basalt', 0, 3.9, 63.1, 4, 6, 10),
    // Narrow ledges with a pendulum each, upward.
    P('stone', 0, 5.1, 68.6, 1.4, 2.6, 11),
    P('stone', 0, 6.3, 73.0, 1.4, 2.6, 12),
    P('crumble', 0, 6.3, 77.4, 1.6, 2.4, 0.6),
    P('crumble', 0, 6.3, 81.6, 1.6, 2.4, 0.6),
    P('gold', 0, 7.5, 87, 6, 6, 13),
  ],
  hazards: [
    { kind: 'beam', x: 0, z: 34, y: 4.25, length: 2.6, inner: 0.3, speed: 2.2, phase: 1.0, r: 0.22 },
    { kind: 'bar', x: 0, y: 4.9, z: 49.4, w: 3.6, h: 0.6, d: 0.5 },
    { kind: 'pendulum', x: 0, y: 10.3, z: 68.6, length: 4.2, amp: 0.95, period: 2.4, phase: 0.4, axis: 'x', r: 0.55 },
    { kind: 'pendulum', x: 0, y: 11.5, z: 73.0, length: 4.2, amp: 0.95, period: 2.4, phase: 0.4 + Math.PI, axis: 'x', r: 0.55 },
  ],
  checkpoints: [
    { x: 0, y: 0, z: 2 },
    { x: 0, y: 3.9, z: 30.2 },
    { x: 0, y: 3.9, z: 62 },
  ],
  finish: { x: 0, y: 7.5, z: 87.5, w: 6, h: 1, d: 4 },
  hints: [
    { z: 4, key: 'climb' },
    { z: 31, key: 'beam' },
    { z: 40, key: 'air_dodge' },
  ],
  reference: 13.3,
};

// --- V. Guardián: El Centinela de Obsidiana ------------------------------------------------
const C = { x: 0, z: 22, y: 0 };
const guardian: Trial = {
  id: 'guardian',
  kind: 'trial',
  tier: 5,
  start: { x: 0, y: 0, z: 2 },
  floor: -6,
  platforms: [
    P('basalt', 0, 0, 5, 5, 8),
    // The arena, and the Centinela at its heart (a pillar: solid, not to be touched by its arms).
    P('obsidian', 0, 0, 22, 18, 18),
    P('obsidian', 0, 4.5, 22, 2.2, 2.2, 4.5),
  ],
  hazards: [],
  checkpoints: [{ x: 0, y: 0, z: 2 }],
  finish: { x: 0, y: 4.8, z: 40, w: 4, h: 1, d: 3 },
  hints: [
    { z: 4, key: 'guardian_1' },
  ],
  reference: 18.0,
  boss: {
    centre: C,
    phases: [
      // I: one low arm sweeping: jump it while lighting three plates.
      {
        plates: [{ x: -6, z: 16 }, { x: 6, z: 16 }, { x: 0, z: 29.5 }],
        hazards: [{ kind: 'beam', x: C.x, z: C.z, y: 0.35, length: 8.6, inner: 1.2, speed: 1.15, phase: 0, r: 0.24 }],
      },
      // II: a low arm and a high arm, turning against each other.
      {
        plates: [{ x: -6.5, z: 28 }, { x: 6.5, z: 28 }, { x: 0, z: 15 }],
        hazards: [
          { kind: 'beam', x: C.x, z: C.z, y: 0.35, length: 8.6, inner: 1.2, speed: 1.2, phase: 0, r: 0.24 },
          { kind: 'beam', x: C.x, z: C.z, y: 1.3, length: 8.6, inner: 1.2, speed: -0.9, phase: Math.PI / 2, r: 0.26 },
        ],
      },
      // III: the arms speed up and the corners breathe fire: the last three plates.
      {
        plates: [{ x: -6.5, z: 15 }, { x: 6.5, z: 29 }, { x: 0, z: 30 }],
        hazards: [
          { kind: 'beam', x: C.x, z: C.z, y: 0.35, length: 8.6, inner: 1.2, speed: 1.45, phase: 0, r: 0.24 },
          { kind: 'beam', x: C.x, z: C.z, y: 1.3, length: 8.6, inner: 1.2, speed: -1.1, phase: Math.PI, r: 0.26 },
          { kind: 'vent', x: -6.5, z: 29, y: 0, r: 1.1, period: 3.0, on: 1.1, phase: 0 },
          { kind: 'vent', x: 6.5, z: 15, y: 0, r: 1.1, period: 3.0, on: 1.1, phase: 1.5 },
        ],
      },
    ],
    exit: [
      P('basalt', 0, 1.6, 32.4, 3, 2, 1.6),
      P('basalt', 0, 3.2, 35.2, 3, 2, 3.2),
      P('gold', 0, 4.8, 39.5, 5, 5, 4.8),
    ],
  },
};

export const TRIALS: Trial[] = [bronce, plata, oro, obsidiana, guardian];

export const MEDALS = ['completado', 'bronce', 'plata', 'oro', 'obsidiana', 'guardian'] as const;
export type Medal = (typeof MEDALS)[number];

/**
 * The medal a time earns, measured against the route the tests play
 * (`reference`). Provisional multiples, ours, to be retuned from real
 * players' times (docs/CONFIGURATION.md). Guardián also asks for a run with
 * no checkpoint.
 */
export function medal(trial: Trial, seconds: number, usedCheckpoint: boolean): Medal {
  const ref = trial.reference || 1e9;
  if (!usedCheckpoint && seconds <= ref * 1.06) return 'guardian';
  if (seconds <= ref * 1.15) return 'obsidiana';
  if (seconds <= ref * 1.35) return 'oro';
  if (seconds <= ref * 1.7) return 'plata';
  if (seconds <= ref * 2.3) return 'bronce';
  return 'completado';
}
