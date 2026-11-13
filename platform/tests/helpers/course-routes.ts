import type { Trial } from '@/ui/play/trials/data';
import { TrialSim } from '@/ui/play/trials/sim';
import { DT, StepInput, sampleOf } from '@/ui/play/trials/run';
import type { PieceId, Placed } from '@/ui/play/trials/courses';
import { air, at, edge, fallingAfter, platformX, type Leg } from './play-routes';

/**
 * The route across each piece of a built course (trials/courses.ts): the
 * trial route it was cut from, moved to where the piece was put. A course's
 * route is its pieces' routes in order, then the finish.
 */

const grounded = (s: TrialSim) => s.player.grounded;

/** A copy of a trial as it stands, to try a move on without making it. */
function cloneSim(s: TrialSim): TrialSim {
  const copy = new TrialSim(s.trial, { noCheckpoints: s.noCheckpoints });
  const from = s as unknown as Record<string, unknown>;
  const to = copy as unknown as Record<string, unknown>;
  for (const key of ['time', 'phaseTime', 'phase', 'checkpoint', 'usedCheckpoint', 'fails', 'finished', 'hold', 'exitUp']) to[key] = from[key];
  copy.plates = [...s.plates];
  s.solids.forEach((solid, i) => Object.assign(copy.solids[i]!, { ...solid, plat: solid.plat }));
  Object.assign(copy.player, { ...s.player, on: s.player.on ? copy.solids[s.solids.indexOf(s.player.on as never)] ?? null : null });
  return copy;
}

/**
 * Would the route get through if it went now? Plays the legs from here on a
 * copy for `seconds` (a wait met along the way counts as met): true if
 * nothing is touched.
 */
function goesThrough(s: TrialSim, legs: Leg[], seconds: number, delay = 0, only = false): boolean {
  const sim = cloneSim(s);
  const input = new StepInput();
  const end = sim.time + seconds;
  let leg = 0;
  let lastJump = -1;
  let lastDodge = -1;
  const hold = sim.time + delay;
  while (sim.time < end + delay && leg < legs.length && !sim.finished) {
    const l = legs[leg]!;
    if (l.done(sim)) {
      if (only) return true;
      leg += 1;
      continue;
    }
    if (sim.time < hold) {
      // Standing still a moment longer first: a go that only works to the step is not a go.
      const now = sim.time * 1000;
      input.feed(sampleOf({ x: 0, z: 0 }, false, false, false), now);
      if (sim.step(DT, input, now).failed) return false;
      continue;
    }
    const p = sim.player;
    let x = 0;
    let z = 0;
    if (l.to) {
      const target = typeof l.to === 'function' ? l.to(sim) : l.to;
      const d = Math.hypot(target[0] - p.x, target[1] - p.z) || 1;
      x = (target[0] - p.x) / d;
      z = (target[1] - p.z) / d;
    }
    let jump = false;
    let dodge = false;
    if (l.jump?.(sim) && sim.time - lastJump > 0.15) {
      jump = true;
      lastJump = sim.time;
    }
    if (l.dodge?.(sim) && sim.time - lastDodge > 0.5) {
      dodge = true;
      lastDodge = sim.time;
    }
    const now = sim.time * 1000;
    input.feed(sampleOf({ x, z }, jump, dodge, false), now);
    if (sim.step(DT, input, now).failed) return false;
  }
  return true;
}

/** Marks a leg whose wait is "go when a try ahead gets through": filled in by courseRoute, which knows the legs that follow. */
const LOOK = Symbol('look');
type Looking = Leg & { [LOOK]?: { seconds: number; only: boolean } };
const look = (leg: Leg, seconds: number, only = false): Looking => Object.assign(leg, { [LOOK]: { seconds, only } });
const once = (from: number, to: number) => (s: TrialSim) => s.player.z >= from && s.player.z < to;


/** The turning beam has just passed the side the player stands on (its angle measured as the game's: atan2(x, z) from its centre). */
function beamJustPassed(s: TrialSim, index: number) {
  const h = s.hazards()[index]!;
  if (h.kind !== 'beam') return true;
  const twoPi = Math.PI * 2;
  const behind = Math.atan2(s.player.x - h.x, s.player.z - h.z);
  const since = (((s.beamAngle(h, s.clockOf(h)) - behind) % twoPi) + twoPi) % twoPi;
  return since > 0.05 && since < 0.3;
}

function piece(id: PieceId, p: Placed): Leg[] {
  const { oz, oy, m, solidBase: sb, hazardBase: hb } = p;
  switch (id) {
    case 'piedras':
      return [
        { to: [0, oz + 2.6], jump: edge(oz - 0.4), done: (s) => grounded(s) && s.player.z > oz + 1.5 },
        { to: [1.2 * m, oz + 7.8], jump: edge(oz + 3.6), done: (s) => grounded(s) && s.player.z > oz + 6.6 },
        { to: [-0.6 * m, oz + 13.0], jump: edge(oz + 8.8), done: (s) => grounded(s) && s.player.z > oz + 11.8 },
        { to: [0, oz + 19], jump: edge(oz + 14.0), done: (s) => grounded(s) && s.player.z > oz + 16.6 },
        { to: [0, oz + 21], done: at(oz + 20.5) },
      ];
    case 'plataforma':
      return [
        {
          to: (s) => (s.player.z < oz - 0.3 ? [0, oz - 0.1] : [platformX(s, sb, 0.1), oz + 4.3]),
          wait: (s) => s.player.z < oz - 0.9 || s.player.z > oz - 0.2 || Math.abs(platformX(s, sb, 0.7)) < 0.8,
          jump: (s) => edge(oz - 0.5)(s) && Math.abs(platformX(s, sb, 0.7)) < 0.8,
          done: (s) => grounded(s) && s.player.z > oz + 2.5,
        },
        { to: [0, oz + 12.5], jump: (s) => grounded(s) && s.player.z > oz + 5.3, done: (s) => grounded(s) && s.player.z > oz + 9 },
        { to: [0, oz + 15.5], done: at(oz + 15) },
      ];
    case 'pendulos':
      return [
        { to: [0, oz + 4], jump: edge(oz - 0.8), done: (s) => grounded(s) && s.player.y > oy + 1 },
        { to: [0, oz + 8], done: at(oz + 7.6) },
        // Go when both will be wide as the player reaches each (judged at the speed of a start from rest).
        look({ to: [0, oz + 18], done: at(oz + 16.5) }, 2.6),
        { to: [0, oz + 24], done: at(oz + 23.5) },
      ];
    case 'barra_salto':
      return [
        { to: [0, oz + 14], dodge: once(oz + 11.2, oz + 12.2), done: at(oz + 14.5) },
        { to: [0, oz + 28], jump: edge(oz + 17.6), done: (s) => grounded(s) && s.player.z > oz + 25 },
        { to: [0, oz + 31], done: at(oz + 30.5) },
      ];
    case 'fuego':
      return [
        { to: [0, oz + 7.2], jump: edge(oz - 0.4), done: (s) => grounded(s) && s.player.z > oz + 6.6 && Math.hypot(s.player.vx, s.player.vz) < 0.4 },
        { to: [0, oz + 9.5], dodge: (s) => grounded(s) && s.player.z > oz + 6.9, done: at(oz + 9.5) },
        { to: [0, oz + 14], jump: edge(oz + 10.2), done: (s) => grounded(s) && s.player.z > oz + 12.5 },
        { to: [0, oz + 17], done: at(oz + 16.5) },
      ];
    case 'barra_movil':
      return [
        {
          to: [0, oz + 6],
          wait: (s) => {
            const h = s.hazards()[hb]!;
            return h.kind === 'bar' && s.barPosition(h, s.time).z > oz + 12.6;
          },
          done: at(oz + 4.4),
        },
        { to: [0, oz + 16], dodge: once(oz + 8.4, oz + 9.4), done: at(oz + 13) },
        { to: [0, oz + 22], dodge: once(oz + 19.5, oz + 20.5), jump: edge(oz + 21.7), done: (s) => air(s) && s.player.z > oz + 21 },
        { to: [0, oz + 33], done: (s) => grounded(s) && s.player.z > oz + 31 },
        { to: [0, oz + 34], done: at(oz + 33.5) },
      ];
    case 'puertas': {
      const open = (index: number) => (s: TrialSim) => s.gateRise(s.solids[index]!.plat, s.time) === 0 && s.gateRise(s.solids[index]!.plat, s.time + 0.4) === 0;
      return [
        { to: [0, oz + 5.4], done: at(oz + 5.2) },
        { to: [0, oz + 8], wait: open(sb + 1), done: at(oz + 7.6) },
        { to: [0, oz + 11.4], done: at(oz + 11.2) },
        { to: [0, oz + 14], wait: open(sb + 2), done: at(oz + 13.6) },
        { to: [0, oz + 15.6], done: at(oz + 15.2) },
      ];
    }
    case 'respiraderos':
      return [
        { to: [0, oz + 5.6], done: at(oz + 5.4) },
        ...[0, 1, 2, 3].map((row): Leg => look({ to: [0, oz + 7 + row * 2.4 + 1.2], done: at(oz + 7 + row * 2.4 + 1.0) }, 1.2, true)),
        { to: [0, oz + 15.6], done: at(oz + 15.4) },
      ];
    case 'puente':
      return [
        {
          to: [0, oz + 13],
          jump: (s) => {
            const z = s.player.z;
            return grounded(s) && ((z > oz - 0.4 && z < oz + 0.3) || (z > oz + 3.0 && z < oz + 3.6) || (z > oz + 6.4 && z < oz + 7.0) || (z > oz + 9.8 && z < oz + 10.4));
          },
          done: (s) => grounded(s) && s.player.z > oz + 12,
        },
        { to: [0, oz + 15.8], done: at(oz + 15.4) },
      ];
    case 'atajo':
      return [
        { to: [2.2 * m, oz + 0.5], done: at(oz + 0.3) },
        { to: [2.2 * m, oz + 21.5], jump: edge(oz + 12.5), dodge: fallingAfter(oz + 13.5), done: (s) => grounded(s) && s.player.z > oz + 20.4 },
        { to: [0, oz + 26], done: at(oz + 25.5) },
      ];
    case 'viga':
      return [
        // The beam always passes the round's centre, so the centre is crossed in the air. Stop outside its reach,
        // and go when a try ahead shows the run in, the jump and the landing all miss it.
        { to: [0, oz - 1.4], done: at(oz - 1.6) },
        look({ to: [0, oz + 6.8], jump: (s) => grounded(s) && s.player.z > oz + 1.8 && s.player.z < oz + 2.6, done: (s) => grounded(s) && s.player.z > oz + 5 }, 2.6),
        { to: [0, oz + 13], jump: edge(oz + 7.7), done: (s) => grounded(s) && s.player.z > oz + 11 },
        { to: [0, oz + 15], done: at(oz + 14.6) },
      ];
    case 'torre':
      return [
        { to: [1.6 * m, oz + 1.4], jump: edge(oz - 1.0), done: (s) => grounded(s) && s.player.y > oy + 1 },
        { to: [-0.6 * m, oz + 6.2], jump: edge(oz + 2.6), done: (s) => grounded(s) && s.player.y > oy + 2.4 },
        { to: [1.4 * m, oz + 10.6], jump: edge(oz + 7.0), done: (s) => grounded(s) && s.player.y > oy + 3.7 },
        { to: [0, oz + 16], jump: edge(oz + 11.9), done: (s) => grounded(s) && s.player.z > oz + 15 },
        { to: [0, oz + 19.6], done: at(oz + 19.2) },
      ];
    case 'cornisas':
      return [
        { to: [0, oz - 3], done: at(oz - 3.2) },
        { to: [0, oz - 1.2], done: at(oz - 1.4) },
        look({ to: [0, oz + 3.3], jump: edge(oz - 0.5), done: (s) => grounded(s) && s.player.y > oy + 1.1 }, 3.2),
        { to: [0, oz + 6.9], jump: (s) => grounded(s) && s.player.y > oy + 1.1 && s.player.z > oz + 2.1, done: (s) => grounded(s) && s.player.y > oy + 2.3 },
        { to: [0, oz + 11.3], jump: edge(oz + 7.8), done: (s) => grounded(s) && s.player.z > oz + 10.2 },
        { to: [0, oz + 15.5], jump: edge(oz + 12.1), done: (s) => grounded(s) && s.player.z > oz + 14.4 },
        { to: [0, oz + 21.9], jump: edge(oz + 16.4), done: (s) => grounded(s) && s.player.z > oz + 19 },
        { to: [0, oz + 23.2], done: at(oz + 22.8) },
      ];
    case 'salto_largo':
      return [
        { to: [0, oz + 14.5], dodge: once(oz + 9.3, oz + 10.5), jump: edge(oz + 13.6), done: (s) => air(s) && s.player.z > oz + 13 },
        { to: [0, oz + 23.5], dodge: fallingAfter(oz + 15), done: (s) => grounded(s) && s.player.z > oz + 22.5 },
        { to: [0, oz + 27], done: at(oz + 26.6) },
      ];
  }
}

export function courseRoute(course: Trial & { placed: Placed[] }): Leg[] {
  const legs: Looking[] = course.placed.flatMap((p) => piece(p.piece, p));
  legs.push({ to: [0, course.finish.z + 1], done: (s) => s.finished });
  legs.forEach((leg, i) => {
    const spec = leg[LOOK];
    if (!spec) return;
    const ahead = [{ ...leg, wait: undefined }, ...legs.slice(i + 1).map((l) => ({ ...l, wait: undefined }))];
    // Judged a few times a second (each judgement plays seconds ahead), and only a go that would also work a moment later.
    let at = -1;
    let answer = false;
    // Once gone, gone: a go is not taken back halfway (until the time it was judged for has passed, as after a fall).
    let goneUntil = -1;
    leg.wait = (s) => {
      if (s.time < goneUntil) return true;
      const key = Math.floor(s.time * 24);
      if (key !== at) {
        at = key;
        answer = goesThrough(s, ahead, spec.seconds, 0, spec.only) && goesThrough(s, ahead, spec.seconds, 0.08, spec.only);
        if (answer) goneUntil = s.time + spec.seconds;
      }
      return answer;
    };
    // No jump or dodge while still waiting (the pilot would hop on the spot).
    const { jump, dodge } = leg;
    if (jump) leg.jump = (s) => leg.wait!(s) && jump(s);
    if (dodge) leg.dodge = (s) => leg.wait!(s) && dodge(s);
  });
  return legs;
}

/** Which piece a leg belongs to, to say where a route went wrong. */
export function pieceAt(course: Trial & { placed: Placed[] }, z: number): string {
  let name = 'start';
  for (const p of course.placed) if (z >= p.oz - 1) name = `${p.piece}@${p.oz}`;
  return name;
}
