import { RADIUS, solid, place, type Solid } from '../engine/body';
import { LOW_HEIGHT, STAND_HEIGHT, mover, stepMover, type MoveEvents, type MoveInput, type Mover } from '../engine/moves';
import { WARN, type Hazard, type Plat, type Point, type Trial } from './data';

/**
 * A trial, played (docs/PLAY.md): the platforms, the hazards on their
 * cycles, checkpoints, the guardian's phases and the finish. Pure logic, the
 * same in the game and in the tests, which play every trial to the end in
 * Node before it ships.
 *
 * Time is the attempt's own (`time`), reset by a restart, so every hazard is
 * in the same place at the same second of every attempt: a pattern learned
 * is a pattern kept. A fall or a touch puts the player back at the last
 * checkpoint at once; the clock runs on.
 */

export type Fail = 'fall' | 'pendulum' | 'beam' | 'bar' | 'fire' | 'gate';

export type SimSolid = Solid & { plat: Plat; crumbleAt: number | null; dropped: number; risen: number };

export type Events = MoveEvents & {
  failed: Fail | null;
  checkpoint: number | null;
  plate: number | null;
  phase: number | null;
  finished: boolean;
};

export class TrialSim {
  readonly trial: Trial;
  readonly player: Mover;
  readonly solids: SimSolid[] = [];
  time = 0;
  /** Seconds since the guardian's current phase began (hazards of a phase run on this clock). */
  phaseTime = 0;
  phase = 0;
  plates: boolean[] = [];
  checkpoint = 0;
  usedCheckpoint = false;
  fails = 0;
  finished = false;
  noCheckpoints: boolean;
  /** A short pause after a fall, so the reset reads as one (the player stands still, the clock runs). */
  private hold = 0;
  private exitUp = false;

  constructor(trial: Trial, options: { noCheckpoints?: boolean } = {}) {
    this.trial = trial;
    this.noCheckpoints = options.noCheckpoints ?? false;
    this.player = mover(trial.start.x, trial.start.y, trial.start.z);
    for (const plat of trial.platforms) this.solids.push(this.makeSolid(plat));
    if (trial.boss) {
      for (const plat of trial.boss.exit) this.solids.push(this.makeSolid(plat, true));
      this.plates = trial.boss.phases[0]!.plates.map(() => false);
    }
    this.restart();
  }

  private makeSolid(plat: Plat, hidden = false): SimSolid {
    const s = solid(plat) as SimSolid;
    s.plat = plat;
    s.crumbleAt = null;
    s.dropped = 0;
    // An exit step waits below the floor until the guardian falls.
    s.risen = hidden ? 0 : 1;
    if (hidden) s.y = plat.y - plat.h - 2;
    return s;
  }

  /** The hazards in play now: the trial's, and the current guardian phase's. */
  hazards(): Hazard[] {
    const boss = this.trial.boss;
    if (!boss || this.phase >= boss.phases.length) return this.trial.hazards;
    return [...this.trial.hazards, ...boss.phases[this.phase]!.hazards];
  }

  /** The clock a hazard runs on. */
  clockOf(hazard: Hazard): number {
    return this.trial.boss && !this.trial.hazards.includes(hazard) ? this.phaseTime : this.time;
  }

  restart() {
    this.time = 0;
    this.phaseTime = 0;
    this.phase = 0;
    this.checkpoint = 0;
    this.usedCheckpoint = false;
    this.fails = 0;
    this.finished = false;
    this.exitUp = false;
    if (this.trial.boss) this.plates = this.trial.boss.phases[0]!.plates.map(() => false);
    for (const s of this.solids) {
      if (this.trial.boss?.exit.includes(s.plat)) {
        s.risen = 0;
        s.y = s.plat.y - s.plat.h - 2;
      }
    }
    this.respawn(this.trial.start);
  }

  private respawn(point: Point) {
    const p = this.player;
    p.x = point.x;
    p.y = point.y + 0.02;
    p.z = point.z;
    p.vx = p.vy = p.vz = 0;
    p.on = null;
    p.momentum = 0;
    p.action = null;
    p.low = false;
    p.facing = 0;
    for (const s of this.solids) {
      s.crumbleAt = null;
      s.dropped = 0;
    }
    this.hold = 0.25;
  }

  /** Where a gate's wall stands at `time`: 0 sunk (open), 1 risen (closed). */
  gateRise(plat: Plat, time: number): number {
    const g = plat.gate!;
    const t = (((time + g.phase) % g.period) + g.period) % g.period;
    // Open for `open` seconds, then rising over 0.35 s, closed, sinking over 0.35 s.
    if (t < g.open) return 0;
    if (t < g.open + 0.35) return (t - g.open) / 0.35;
    if (t > g.period - 0.35) return (g.period - t) / 0.35;
    return 1;
  }

  /** A gate about to close glows: 0…1 over the WARN seconds before it rises. */
  gateWarn(plat: Plat, time: number): number {
    const g = plat.gate!;
    const t = (((time + g.phase) % g.period) + g.period) % g.period;
    return t < g.open && t > g.open - WARN ? (t - (g.open - WARN)) / WARN : this.gateRise(plat, time) > 0 ? 1 : 0;
  }

  /** A vent: 'off', 'warn' (glowing, harmless) or 'on'. */
  ventState(h: Extract<Hazard, { kind: 'vent' }>, time: number): { state: 'off' | 'warn' | 'on'; k: number } {
    const t = (((time + h.phase) % h.period) + h.period) % h.period;
    const onAt = h.period - h.on;
    if (t >= onAt) return { state: 'on', k: 1 };
    if (t >= onAt - WARN) return { state: 'warn', k: (t - (onAt - WARN)) / WARN };
    return { state: 'off', k: 0 };
  }

  pendulumAngle(h: Extract<Hazard, { kind: 'pendulum' }>, time: number) {
    return Math.sin((time / h.period) * Math.PI * 2 + h.phase) * h.amp;
  }

  beamAngle(h: Extract<Hazard, { kind: 'beam' }>, time: number) {
    return time * h.speed + h.phase;
  }

  barPosition(h: Extract<Hazard, { kind: 'bar' }>, time: number) {
    if (!h.move) return { x: h.x, z: h.z };
    const o = Math.sin((time / h.move.period) * Math.PI * 2 + h.move.phase) * h.move.range;
    return h.move.axis === 'x' ? { x: h.x + o, z: h.z } : { x: h.x, z: h.z + o };
  }

  /**
   * One fixed step. `now` is the clock the input's `released()` uses (the
   * page's, in a browser); headless, the simulation's own.
   */
  step(dt: number, input: MoveInput, now = this.time * 1000): Events {
    this.time += dt;
    this.phaseTime += dt;
    const p = this.player;
    // The world moves.
    for (const s of this.solids) {
      if (s.plat.move) place(s, this.time);
      if (s.plat.gate) {
        const rise = this.gateRise(s.plat, this.time);
        s.y = s.plat.y - (1 - rise) * (s.plat.h + 0.1);
      }
      if (s.crumbleAt !== null && this.time - s.crumbleAt > 0.45) {
        s.dropped += dt * (2 + (this.time - s.crumbleAt) * 14);
        s.y = s.plat.y - s.dropped;
      }
      if (this.trial.boss?.exit.includes(s.plat) && this.exitUp && s.risen < 1) {
        s.risen = Math.min(1, s.risen + dt / 1.2);
        s.y = s.plat.y - (1 - s.risen) * (s.plat.h + 2);
      }
    }
    // Fallen crumbling tiles are no longer there to stand on.
    const live = this.solids.filter((s) => s.dropped < 0.6 && !(s.plat.gate && this.gateRise(s.plat, this.time) <= 0.02));

    const events: Events = { jumped: false, dodged: null, landed: false, failed: null, checkpoint: null, plate: null, phase: null, finished: false };
    if (this.finished) {
      p.vx = p.vz = 0;
      input.tick(dt);
      return events;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      input.tick(dt);
      return events;
    }
    // A gate rising through the player is a fail before it is a push.
    if (this.crushed(live)) {
      events.failed = 'gate';
      this.fails += 1;
      if (this.noCheckpoints) this.restart();
      else this.respawn(this.trial.checkpoints[this.checkpoint]!);
      return events;
    }
    Object.assign(events, stepMover(p, live, input, dt, now));
    // A tile begins to crumble the moment it is stood on.
    if (p.grounded && p.on) {
      const on = p.on as SimSolid;
      if (on.plat?.kind === 'crumble' && on.crumbleAt === null) on.crumbleAt = this.time;
    }

    // Failing.
    const fail = p.y < this.trial.floor ? 'fall' : this.touched(live);
    if (fail) {
      events.failed = fail;
      this.fails += 1;
      if (this.noCheckpoints) this.restart();
      else this.respawn(this.trial.checkpoints[this.checkpoint]!);
      return events;
    }

    // Checkpoints: reached standing on them, never given back. In a run with
    // no checkpoints they are still passed (the screen shows progress), but a
    // fall goes back to the start.
    for (let i = this.checkpoint + 1; i < this.trial.checkpoints.length; i += 1) {
      const c = this.trial.checkpoints[i]!;
      if (p.grounded && p.z >= c.z && Math.abs(p.y - c.y) < 0.3) {
        this.checkpoint = i;
        if (!this.noCheckpoints) this.usedCheckpoint = true;
        events.checkpoint = i;
      }
    }

    // The guardian: plates, phases, the way out.
    const boss = this.trial.boss;
    if (boss && this.phase < boss.phases.length && p.grounded) {
      boss.phases[this.phase]!.plates.forEach((plate, i) => {
        if (!this.plates[i] && Math.hypot(p.x - plate.x, p.z - plate.z) < 1.1) {
          this.plates[i] = true;
          events.plate = i;
        }
      });
      if (this.plates.every(Boolean)) {
        this.phase += 1;
        this.phaseTime = 0;
        events.phase = this.phase;
        if (this.phase < boss.phases.length) this.plates = boss.phases[this.phase]!.plates.map(() => false);
        else this.exitUp = true;
      }
    }

    // The finish.
    const f = this.trial.finish;
    const bossDone = !boss || this.phase >= boss.phases.length;
    if (bossDone && p.grounded && Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.z - f.z) < f.d / 2 && Math.abs(p.y - f.y) < 0.3) {
      this.finished = true;
      events.finished = true;
    }
    return events;
  }

  /** What, if anything, the player is touching that hurts. */
  private touched(live: SimSolid[]): Fail | null {
    const p = this.player;
    const height = p.low ? LOW_HEIGHT : STAND_HEIGHT;
    const bottom = p.y + 0.05;
    const top = p.y + height;
    for (const h of this.hazards()) {
      const time = this.clockOf(h);
      switch (h.kind) {
        case 'pendulum': {
          const a = this.pendulumAngle(h, time);
          const bx = h.axis === 'x' ? h.x + Math.sin(a) * h.length : h.x;
          const bz = h.axis === 'z' ? h.z + Math.sin(a) * h.length : h.z;
          const by = h.y - Math.cos(a) * h.length;
          const dy = by < bottom ? bottom - by : by > top ? by - top : 0;
          if (Math.hypot(p.x - bx, p.z - bz, dy) < h.r + RADIUS) return 'pendulum';
          break;
        }
        case 'beam': {
          if (h.y + h.r < bottom || h.y - h.r > top) break;
          const a = this.beamAngle(h, time);
          const dx = Math.sin(a);
          const dz = Math.cos(a);
          // Distance from the player to the bar (a segment from inner to length along the angle).
          const rx = p.x - h.x;
          const rz = p.z - h.z;
          const along = Math.max(h.inner, Math.min(h.length, rx * dx + rz * dz));
          if (Math.hypot(rx - dx * along, rz - dz * along) < h.r + RADIUS * 0.8) return 'beam';
          break;
        }
        case 'bar': {
          const c = this.barPosition(h, time);
          if (Math.abs(p.x - c.x) < h.w / 2 + RADIUS && Math.abs(p.z - c.z) < h.d / 2 + RADIUS * 0.7 && top > h.y && bottom < h.y + h.h) return 'bar';
          break;
        }
        case 'vent': {
          if (p.untouchable) break;
          if (this.ventState(h, time).state === 'on' && Math.hypot(p.x - h.x, p.z - h.z) < h.r + RADIUS * 0.5 && bottom < h.y + 2.6) return 'fire';
          break;
        }
        case 'curtain': {
          if (p.untouchable) break;
          if (Math.abs(p.x - h.x) < h.w / 2 + RADIUS && Math.abs(p.z - h.z) < h.d / 2 + RADIUS * 0.6 && bottom < h.y + h.h) return 'fire';
          break;
        }
      }
    }
    return null;
  }

  /** A gate's wall rising where the player stands. */
  private crushed(live: SimSolid[]): boolean {
    const p = this.player;
    for (const s of live) {
      if (!s.plat.gate) continue;
      if (p.x + RADIUS > s.minX && p.x - RADIUS < s.maxX && p.z + RADIUS * 0.8 > s.minZ && p.z - RADIUS * 0.8 < s.maxZ && s.y > p.y + 0.3 && s.y - s.h < p.y + 0.3) return true;
    }
    return false;
  }
}
