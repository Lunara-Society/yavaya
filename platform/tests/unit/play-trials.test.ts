import { describe, expect, it } from 'vitest';
import { TRIALS, medal, type Trial } from '@/ui/play/trials/data';
import { TrialSim } from '@/ui/play/trials/sim';
import type { MoveInput } from '@/ui/play/engine/moves';

/**
 * Every Prueba de Maestría is played to the end, here, with the moveset a
 * player has (the stick, Saltar, Esquivar) and nothing else, before it
 * ships. A route is a list of legs: where to steer, what to wait for, when
 * to jump or dodge. The route's time is each trial's `reference`, the
 * measure its medals are cut from (data.ts, `medal`).
 *
 * The routes read the hazards' clocks the way a player reads them on the
 * screen (where the pendulum is, whether a vent glows), never anything a
 * player could not see.
 */

const DT = 1 / 120;

type Leg = {
  /** Steer toward this point (null: let go of the stick). */
  to: [number, number] | ((s: TrialSim) => [number, number]) | null;
  /** Hold still until this is true (the stick let go). */
  wait?: (s: TrialSim) => boolean;
  /** Press Saltar when this is true. */
  jump?: (s: TrialSim) => boolean;
  /** Press Esquivar when this is true. */
  dodge?: (s: TrialSim) => boolean;
  /** This leg is over when this is true. */
  done: (s: TrialSim) => boolean;
};

class Pilot implements MoveInput {
  x = 0;
  z = 0;
  jump = false;
  dodgeOn = false;
  axis() {
    return { x: this.x, z: this.z, asked: Math.hypot(this.x, this.z) };
  }
  jumpWaiting() {
    return this.jump;
  }
  useJump() {
    this.jump = false;
  }
  dodgeWaiting() {
    return this.dodgeOn;
  }
  useDodge() {
    this.dodgeOn = false;
  }
  tick() {}
  released() {
    return { x: 0, z: 0, at: -1e9 };
  }
}

export function fly(trial: Trial, legs: Leg[], options: { noCheckpoints?: boolean; limit?: number } = {}) {
  const sim = new TrialSim(trial, { noCheckpoints: options.noCheckpoints });
  const pilot = new Pilot();
  let leg = 0;
  const fails: string[] = [];
  let lastJump = -1;
  let lastDodge = -1;
  while (!sim.finished && sim.time < (options.limit ?? 120) && leg < legs.length) {
    const l = legs[leg]!;
    const p = sim.player;
    if (l.done(sim)) {
      leg += 1;
      continue;
    }
    if (l.wait && !l.wait(sim)) {
      pilot.x = pilot.z = 0;
    } else if (l.to) {
      const to = typeof l.to === 'function' ? l.to(sim) : l.to;
      const dx = to[0] - p.x;
      const dz = to[1] - p.z;
      const d = Math.hypot(dx, dz) || 1;
      pilot.x = dx / d;
      pilot.z = dz / d;
    } else {
      pilot.x = pilot.z = 0;
    }
    if (l.jump?.(sim) && sim.time - lastJump > 0.15) {
      pilot.jump = true;
      lastJump = sim.time;
    }
    if (l.dodge?.(sim) && sim.time - lastDodge > 0.5) {
      pilot.dodgeOn = true;
      lastDodge = sim.time;
    }
    const before = `x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} z ${p.z.toFixed(2)} vy ${p.vy.toFixed(1)} low ${p.low}`;
    const e = sim.step(DT, pilot);
    if (e.failed) {
      fails.push(`${e.failed} leg ${leg} at ${before} t ${sim.time.toFixed(2)}`);
      break;
    }
  }
  return { sim, fails, time: sim.time, leg };
}

// Helpers a route is written with.
const at = (z: number) => (s: TrialSim) => s.player.z >= z;
const edge = (z: number) => (s: TrialSim) => s.player.grounded && s.player.z >= z;
const air = (s: TrialSim) => !s.player.grounded;
const fallingAfter = (z: number) => (s: TrialSim) => !s.player.grounded && s.player.vy < -2.5 && s.player.z > z;
/** Where a moving platform will be in `ahead` seconds. */
function platformX(s: TrialSim, index: number, ahead: number) {
  const plat = s.solids[index]!.plat;
  if (!plat.move) return plat.x;
  return plat.x + Math.sin(((s.time + ahead) / plat.move.period) * Math.PI * 2 + plat.move.phase) * plat.move.range;
}
const CHECK: Array<(s: TrialSim) => boolean> = [() => false, (s) => s.checkpoint >= 1, (s) => s.checkpoint >= 2, (s) => s.checkpoint >= 3];

/** The turning beam will sweep through the player in [from, to] seconds. */
function beamSoon(s: TrialSim, index: number, from = 0.0, to = 0.3) {
  const h = s.hazards()[index]!;
  if (h.kind !== 'beam') return false;
  // Where the player will be in a moment: the beam is judged against that.
  const rx = s.player.x + s.player.vx * 0.15 - h.x;
  const rz = s.player.z + s.player.vz * 0.15 - h.z;
  const r = Math.hypot(rx, rz);
  if (r > h.length + 0.6 || r < h.inner - 0.4) return false;
  const a = s.beamAngle(h, s.clockOf(h));
  const target = Math.atan2(rx, rz);
  const twoPi = Math.PI * 2;
  const gap = h.speed > 0 ? (((target - a) % twoPi) + twoPi) % twoPi : (((a - target) % twoPi) + twoPi) % twoPi;
  const eta = gap / Math.abs(h.speed);
  return eta >= from && eta <= to;
}

/** The pendulum will be clear of the path when the player reaches it (judged at a steady speed), and a little either side. */
function pendulumClearOnArrival(s: TrialSim, index: number, margin: number, speed = 6.5) {
  const h = s.hazards()[index]!;
  if (h.kind !== 'pendulum') return true;
  const eta = Math.max(0, (h.z - s.player.z) / speed);
  for (const d of [-0.25, 0, 0.25, 0.45]) {
    const a = s.pendulumAngle(h, s.clockOf(h) + eta + d);
    if (Math.abs(Math.sin(a) * h.length) < margin) return false;
  }
  return true;
}

function pendulumClear(s: TrialSim, index: number, margin = 2.4) {
  const h = s.hazards()[index]!;
  if (h.kind !== 'pendulum') return true;
  const a = s.pendulumAngle(h, s.clockOf(h));
  return Math.abs(Math.sin(a) * h.length) > margin;
}

const ROUTES: Record<Trial['id'], Leg[]> = {
  bronce: [
    { to: [0, 11.6], jump: edge(8.6), done: (s) => s.player.grounded && s.player.z > 10.5 },
    { to: [1.2, 16.8], jump: edge(12.6), done: (s) => s.player.grounded && s.player.z > 15.6 },
    { to: [-0.6, 22], jump: edge(17.8), done: (s) => s.player.grounded && s.player.z > 20.8 },
    { to: [0, 28], jump: edge(23.0), done: (s) => s.player.grounded && s.player.z > 25.6 },
    { to: [0, 31], done: CHECK[1]! },
    // The moving platform: wait for it to come to the middle, jump, ride it, jump off.
    { to: (s) => (s.player.z < 31.2 ? [0, 31.4] : [platformX(s, 5, 0.1), 35.8]), wait: (s) => s.player.z < 30.6 || s.player.z > 31.3 || Math.abs(platformX(s, 5, 0.7)) < 0.8, jump: (s) => edge(31.0)(s) && Math.abs(platformX(s, 5, 0.7)) < 0.8, done: (s) => s.player.grounded && s.player.z > 34 },
    { to: [0, 44], jump: (s) => s.player.grounded && s.player.z > 36.8, done: (s) => s.player.grounded && s.player.z > 40.5 },
    { to: [0, 46], done: CHECK[2]! },
    { to: [0, 52], jump: edge(47.2), done: (s) => s.player.grounded && s.player.y > 1 },
    // The pendulums: wait at their edge until both swing wide, then run.
    { to: [0, 56], done: at(55.6) },
    { to: [0, 66], wait: (s) => pendulumClear(s, 0, 3.0) && pendulumClear(s, 1, 3.0), done: at(64.5) },
    { to: [0, 72], done: (s) => s.finished },
  ],
  plata: [
    { to: [0, 14], dodge: at(11.2), done: at(14.5) },
    { to: [0, 28], jump: edge(17.6), done: (s) => s.player.grounded && s.player.z > 25 },
    { to: [0, 30], done: CHECK[1]! },
    { to: [0, 39.2], jump: edge(31.6), done: (s) => s.player.grounded && s.player.z > 38.6 && Math.hypot(s.player.vx, s.player.vz) < 0.4 },
    { to: [0, 41.5], dodge: (s) => s.player.grounded && s.player.z > 38.9, done: at(41.5) },
    { to: [0, 46], jump: edge(42.2), done: (s) => s.player.grounded && s.player.z > 44.5 },
    { to: [0, 46.5], done: CHECK[2]! },
    // The moving bar: start the slide as it moves away.
    { to: [0, 50], wait: (s) => { const h = s.hazards()[2]!; return h.kind === 'bar' && s.barPosition(h, s.time).z > 56.6; }, done: at(48.4) },
    { to: [0, 60], dodge: at(52.4), done: at(57) },
    { to: [0, 66], dodge: at(63.5), jump: edge(65.7), done: (s) => air(s) && s.player.z > 65 },
    { to: [0, 78], done: (s) => s.finished },
  ],
  oro: [
    // The gates: wait for the first to open, go; wait at the second.
    { to: [0, 5.4], done: at(5.2) },
    { to: [0, 8], wait: (s) => s.gateRise(s.solids[1]!.plat, s.time) === 0 && s.gateRise(s.solids[1]!.plat, s.time + 0.4) === 0, done: at(7.6) },
    { to: [0, 11.4], done: at(11.2) },
    { to: [0, 14], wait: (s) => s.gateRise(s.solids[2]!.plat, s.time) === 0 && s.gateRise(s.solids[2]!.plat, s.time + 0.4) === 0, done: at(13.6) },
    { to: [0, 20], done: CHECK[1]! },
    // The vents: each row fires 0.8 s after the one before; cross a row just after it goes out.
    ...[0, 1, 2, 3].map((row): Leg => ({
      to: [0, 23 + row * 2.4 + 1.2],
      wait: (s) => {
        const h = s.hazards()[row * 3 + 1]!;
        if (h.kind !== 'vent') return true;
        const v = s.ventState(h, s.time);
        const next = s.ventState(h, s.time + 0.45);
        return v.state === 'off' && next.state === 'off';
      },
      done: at(23 + row * 2.4 + 1.0),
    })),
    { to: [0, 31.6], done: at(31.4) },
    { to: [0, 45], jump: (s) => s.player.grounded && (s.player.z > 31.6 && s.player.z < 32.3 || s.player.z > 35.0 && s.player.z < 35.6 || s.player.z > 38.4 && s.player.z < 39.0 || s.player.z > 41.8 && s.player.z < 42.4), done: CHECK[2]! },
    // The shortcut: onto the runway, sprint, jump at its end, dodge late in the air.
    { to: [2.2, 49], done: at(48.8) },
    { to: [2.2, 70], jump: edge(61.0), dodge: fallingAfter(62), done: (s) => s.player.grounded && s.player.z > 68.9 },
    // The beam: jump it as it comes.
    { to: [0, 77], jump: (s) => s.player.grounded && beamSoon(s, 12), done: at(76.6) },
    { to: [0, 82.5], jump: edge(76.7), done: (s) => s.finished },
  ],
  obsidiana: [
    { to: [1.6, 9.4], jump: edge(7.0), done: (s) => s.player.grounded && s.player.y > 1 },
    { to: [-0.6, 14.2], jump: (s) => edge(10.6)(s), done: (s) => s.player.grounded && s.player.y > 2.4 },
    { to: [1.4, 18.6], jump: edge(15.0), done: (s) => s.player.grounded && s.player.y > 3.7 },
    // The moving platform: jump when it will be under the landing.
    { to: (s) => (s.player.z < 20 ? [1.4, 20.6] : [platformX(s, 4, 0.2), 25.6]), wait: (s) => s.player.z < 19.4 || s.player.z > 20 || Math.abs(platformX(s, 4, 0.8) - 1.0) < 0.8, jump: (s) => edge(19.7)(s) && Math.abs(platformX(s, 4, 0.8) - 1.0) < 0.8, done: (s) => s.player.grounded && s.player.z > 24 },
    { to: [0, 30.5], jump: (s) => s.player.grounded && s.player.z > 26.5, done: CHECK[1]! },
    { to: [1.3, 37], jump: (s) => s.player.grounded && beamSoon(s, 0), done: at(37) },
    { to: [0, 53], dodge: at(47.8), jump: edge(52.1), done: (s) => air(s) && s.player.z > 51.5 },
    { to: [0, 62], dodge: fallingAfter(53.5), done: CHECK[2]! },
    { to: [0, 65.6], done: at(65.4) },
    { to: [0, 69.4], wait: (s) => pendulumClearOnArrival(s, 2, 1.7, 5) && pendulumClearOnArrival(s, 3, 1.7, 4), jump: edge(65.6), done: (s) => s.player.grounded && s.player.y > 5 },
    // Both pendulums swing wide together: cross the two ledges in one breath, no stop between.
    { to: [0, 73], jump: (s) => s.player.grounded && s.player.y > 5 && s.player.z > 68.2, done: (s) => s.player.grounded && s.player.y > 6.2 },
    { to: [0, 77.4], jump: edge(73.9), done: (s) => s.player.grounded && s.player.z > 76.3 },
    { to: [0, 81.6], jump: edge(78.2), done: (s) => s.player.grounded && s.player.z > 80.5 },
    { to: [0, 88], jump: edge(82.5), done: (s) => s.finished },
  ],
  guardian: guardianRoute(),
};

/** The Centinela: run plate to plate, jumping the low arm and sliding under the high one as they come. */
function guardianRoute(): Leg[] {
  const evadeJump = (s: TrialSim) => s.player.grounded && s.hazards().some((h, i) => h.kind === 'beam' && h.y < 0.8 && beamSoon(s, i, 0.0, 0.3));
  const evadeSlide = (s: TrialSim) => s.player.grounded && s.hazards().some((h, i) => h.kind === 'beam' && h.y > 0.8 && beamSoon(s, i, 0.0, 0.25));
  const go = (x: number, z: number, done: (s: TrialSim) => boolean): Leg => ({ to: [x, z], jump: evadeJump, dodge: evadeSlide, done });
  const near = (x: number, z: number, r = 0.9) => (s: TrialSim) => Math.hypot(s.player.x - x, s.player.z - z) < r;
  const plate = (phase: number, i: number) => (s: TrialSim) => s.phase > phase || (s.phase === phase && s.plates[i] === true);
  return [
    { to: [0, 14], jump: edge(8.6), done: (s) => s.player.grounded && s.player.z > 12.5 },
    // I.
    go(-6, 16, plate(0, 0)),
    go(-5.5, 25, near(-5.5, 25)),
    go(0, 29.5, plate(0, 2)),
    go(5.5, 25, near(5.5, 25)),
    go(6, 16, plate(0, 1)),
    // II.
    go(0, 15, plate(1, 2)),
    go(-6, 19, near(-6, 19)),
    go(-6.5, 28, plate(1, 0)),
    go(0, 30.5, near(0, 30.5)),
    go(6.5, 28, plate(1, 1)),
    // III: around the fire, plate to plate.
    go(0, 30, plate(2, 2)),
    go(6.5, 29, plate(2, 1)),
    go(5.5, 21, near(5.5, 21)),
    go(2, 15.5, near(2, 15.5)),
    go(-6.5, 15, plate(2, 0)),
    // The way out rises: up the steps to the finish.
    { to: [0, 30.4], wait: (s) => s.phase >= 3, done: near(0, 30.4) },
    { to: [0, 33], wait: (s) => s.solids.every((x) => !s.trial.boss!.exit.includes(x.plat) || x.risen >= 1), jump: edge(30.6), done: (s) => s.player.grounded && s.player.y > 1.5 },
    { to: [0, 35.6], jump: edge(32.9), done: (s) => s.player.grounded && s.player.y > 3.1 },
    { to: [0, 40], jump: edge(35.7), done: (s) => s.finished },
  ];
}

describe('Pruebas de Maestría', () => {
  for (const trial of TRIALS.filter((t) => ROUTES[t.id].length)) {
    it(`${trial.id} can be finished with the moveset`, () => {
      const run = fly(trial, ROUTES[trial.id]);
      expect(run.fails).toEqual([]);
      expect(run.sim.finished).toBe(true);
      // The reference the medals are cut from is the route's real time.
      expect(Math.abs(run.time - trial.reference)).toBeLessThan(0.3);
    });
  }

  it('can be won without a single checkpoint, as the Guardián medal asks', () => {
    for (const trial of TRIALS) {
      const run = fly(trial, ROUTES[trial.id], { noCheckpoints: true });
      expect(run.sim.finished, trial.id).toBe(true);
      expect(run.sim.usedCheckpoint, trial.id).toBe(false);
    }
  });

  it('cuts medals from the reference', () => {
    const t = { ...TRIALS[0]!, reference: 40 };
    expect(medal(t, 41, false)).toBe('guardian');
    expect(medal(t, 41, true)).toBe('obsidiana');
    expect(medal(t, 53, true)).toBe('oro');
    expect(medal(t, 200, true)).toBe('completado');
  });
});
