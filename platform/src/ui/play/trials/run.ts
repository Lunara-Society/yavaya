import type { MoveInput } from '../engine/moves';
import { medal, type Medal, type Trial } from './data';
import { TrialSim } from './sim';

/**
 * A run, kept as what the thumbs did (docs/PLAY.md, "Verified runs").
 *
 * The game does not send a time to the server: it sends the input, step by
 * step, and the server plays it again on the same course with the same
 * simulation. The time the server sees is the time that counts. A made-up
 * time has no input that produces it, so it cannot be submitted.
 *
 * For that to hold, the game itself plays from these samples (StepInput),
 * not from the raw thumbs: what the player saw and what the server replays
 * are one computation (with engine/dmath.ts, the same on every device).
 */

export const DT = 1 / 120;
/** The stick, in whole steps of 1/127: what is kept, and what both sides play. */
export const Q = 127;
/** A run longer than this is not kept (ten minutes of steps). */
export const MAX_STEPS = 120 * 600;
const JUMP_BUFFER = 0.14;
const DODGE_BUFFER = 0.12;

export type Sample = { x: number; z: number; jump: boolean; dodge: boolean; lift: boolean };

/** The input a TrialSim reads, fed one sample per step. */
export class StepInput implements MoveInput {
  private s: Sample = { x: 0, z: 0, jump: false, dodge: false, lift: false };
  private jumpBuffer = 0;
  private dodgeBuffer = 0;
  private release = { x: 0, z: 0, at: -1e9 };

  /** Before each step: the thumbs at this step, and the simulation's clock (ms). */
  feed(sample: Sample, now: number) {
    // The stick let go: where it pointed, so a jump right after keeps the run.
    if (sample.lift) this.release = { x: this.s.x / Q, z: this.s.z / Q, at: now };
    if (sample.jump) this.jumpBuffer = JUMP_BUFFER;
    if (sample.dodge) this.dodgeBuffer = DODGE_BUFFER;
    this.s = sample;
  }

  axis() {
    let x = this.s.x / Q;
    let z = this.s.z / Q;
    const asked = Math.sqrt(x * x + z * z);
    if (asked > 1) {
      x /= asked;
      z /= asked;
    }
    return { x, z, asked: Math.min(1, asked) };
  }
  jumpWaiting() {
    return this.jumpBuffer > 0;
  }
  useJump() {
    this.jumpBuffer = 0;
  }
  dodgeWaiting() {
    return this.dodgeBuffer > 0;
  }
  useDodge() {
    this.dodgeBuffer = 0;
  }
  tick(dt: number) {
    this.jumpBuffer -= dt;
    this.dodgeBuffer -= dt;
  }
  released() {
    return this.release;
  }
}

/** A sample from any steering (the thumbs, a test's pilot): rounded to what is kept. */
export function sampleOf(axis: { x: number; z: number }, jump: boolean, dodge: boolean, lift: boolean): Sample {
  // `|| 0`: never a negative zero, so equal samples compare equal.
  const clamp = (v: number) => Math.max(-Q, Math.min(Q, Math.round(v * Q))) || 0;
  return { x: clamp(axis.x), z: clamp(axis.z), jump, dodge, lift };
}

// --- Keeping a run small: equal samples in a row are kept once, with a count. ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function fromBase64(text: string): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return bytes;
}

/** Version 1: per run of equal samples, x+128, z+128, flags, then the count as a varint. */
export function encodeRun(samples: Sample[]): string {
  const bytes: number[] = [1];
  let i = 0;
  while (i < samples.length) {
    const s = samples[i]!;
    let n = 1;
    while (i + n < samples.length) {
      const t = samples[i + n]!;
      if (t.x !== s.x || t.z !== s.z || t.jump !== s.jump || t.dodge !== s.dodge || t.lift !== s.lift) break;
      n += 1;
    }
    bytes.push(s.x + 128, s.z + 128, (s.jump ? 1 : 0) | (s.dodge ? 2 : 0) | (s.lift ? 4 : 0));
    let count = n;
    while (count >= 128) {
      bytes.push((count & 127) | 128);
      count >>>= 7;
    }
    bytes.push(count);
    i += n;
  }
  return toBase64(bytes);
}

export function decodeRun(text: string): Sample[] | null {
  if (typeof text !== 'string' || text.length > 400_000) return null;
  const bytes = fromBase64(text);
  if (!bytes || bytes[0] !== 1) return null;
  const out: Sample[] = [];
  let i = 1;
  while (i < bytes.length) {
    if (i + 3 >= bytes.length) return null;
    const x = bytes[i]! - 128;
    const z = bytes[i + 1]! - 128;
    const flags = bytes[i + 2]!;
    if (x < -Q || x > Q || z < -Q || z > Q || flags > 7) return null;
    i += 3;
    let count = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length || shift > 21) return null;
      const b = bytes[i]!;
      i += 1;
      count |= (b & 127) << shift;
      if (b < 128) break;
      shift += 7;
    }
    if (count < 1 || out.length + count > MAX_STEPS) return null;
    const sample = { x, z, jump: (flags & 1) > 0, dodge: (flags & 2) > 0, lift: (flags & 4) > 0 };
    for (let k = 0; k < count; k += 1) out.push(sample);
  }
  return out;
}

export type Replayed = { finished: boolean; seconds: number; fails: number; usedCheckpoint: boolean; medal: Medal | null; steps: number };

/**
 * Plays a run on a course, as the server does to check it. A run counts only
 * if it finishes on its very last sample: nothing left over, nothing missing.
 */
export function replayRun(trial: Trial, samples: Sample[], noCheckpoints: boolean): Replayed {
  const sim = new TrialSim(trial, { noCheckpoints });
  const input = new StepInput();
  let steps = 0;
  for (const sample of samples) {
    const now = sim.time * 1000;
    input.feed(sample, now);
    sim.step(DT, input, now);
    steps += 1;
    if (sim.finished) break;
  }
  const finished = sim.finished && steps === samples.length;
  return { finished, seconds: sim.time, fails: sim.fails, usedCheckpoint: sim.usedCheckpoint, medal: finished ? medal(trial, sim.time, sim.usedCheckpoint) : null, steps };
}

/** Plays a run step by step alongside the player: a ghost. */
export class Ghost {
  readonly sim: TrialSim;
  private readonly input = new StepInput();
  private index = 0;
  constructor(trial: Trial, private readonly samples: Sample[], noCheckpoints: boolean) {
    this.sim = new TrialSim(trial, { noCheckpoints });
  }
  restart() {
    this.sim.restart();
    this.index = 0;
  }
  step() {
    if (this.index >= this.samples.length || this.sim.finished) return;
    const now = this.sim.time * 1000;
    this.input.feed(this.samples[this.index]!, now);
    this.sim.step(DT, this.input, now);
    this.index += 1;
  }
  get done() {
    return this.sim.finished || this.index >= this.samples.length;
  }
}
