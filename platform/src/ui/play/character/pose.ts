import type { Emote, MotionState } from './build';

/**
 * How the character moves (docs/PLAY.md), apart from what it is made of: from
 * the player's state, the angle of every joint, eased toward where it should
 * be so one pose flows into the next (idle, walk and run, jump and fall, a
 * squash on landing, a cheer, two emotes, the mastery moves) and the face
 * (a blink, a grin). Both characters wear the same moves: the drawn one
 * (build.ts) turns its pivots by these angles, Genesis (genesis/character.ts)
 * its bones.
 *
 * Angles in radians in the character's own axes (x across, y up, z forward):
 * an arm's x swings it forward (negative) and back, its z raises it sideways;
 * a knee's x folds it back.
 */
export type Pose = {
  /** The whole body turning about its middle: a forward roll (x) and an air-dodge spin (y). */
  tumbleX: number;
  tumbleY: number;
  /** Up and down, metres. */
  bob: number;
  spineX: number;
  spineY: number;
  spineZ: number;
  pelvisZ: number;
  headX: number;
  headY: number;
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  elbowL: number;
  elbowR: number;
  legLX: number;
  legRX: number;
  legLZ: number;
  legRZ: number;
  kneeL: number;
  kneeR: number;
  face: 'normal' | 'blink' | 'happy';
};

const STILL: MotionState = { speed: 0, air: false, vy: 0, cheer: 0, emote: null };

export function createPoser(): (dt: number, state?: MotionState) => Pose {
  /** Where each angle is now; every frame it eases toward where it should be. */
  const now: Record<string, number> = {};
  const ease = (key: string, target: number, rate: number, dt: number) => {
    const current = now[key] ?? target;
    const value = current + (target - current) * (1 - Math.exp(-rate * dt));
    now[key] = value;
    return value;
  };
  let clock = 0;
  let stride = 0;
  let wasAir = false;
  let land = 0;
  let blinkIn = 2 + Math.random() * 3;
  let emoteTime = 0;
  let lastEmote: Emote | null = null;
  let face: Pose['face'] = 'normal';
  const setFace = (next: Pose['face']) => {
    face = next;
  };

  return function pose(dt: number, state: MotionState = STILL): Pose {
    clock += dt;
    const speed = Math.min(1, Math.max(0, state.speed));
    // Strides come faster as the run gets faster, and the phase only moves with the feet.
    stride += dt * (6 + speed * 7.5) * Math.min(1, speed * 4);
    if (wasAir && !state.air) land = 1;
    wasAir = state.air;
    land = Math.max(0, land - dt * 4.5);
    if (state.emote !== lastEmote) emoteTime = 0;
    lastEmote = state.emote;
    emoteTime += dt;

    // Pose targets.
    let lean = 0;
    let bob = 0;
    let yaw = 0;
    let headX = 0;
    let headY = 0;
    let armLX = 0, armLZ = 0.12, armRX = 0, armRZ = -0.12, elbowLX = -0.25, elbowRX = -0.25;
    let legLX = 0, legRX = 0, legLZ = 0, legRZ = 0, kneeLX = 0.05, kneeRX = 0.05;
    let pelvisRoll = 0;
    let rate = 14;

    const k = state.actionK ?? 0;
    let spin = 0;
    let roll = 0;
    if (state.action === 'roll') {
      // Tucked tight, over once.
      roll = k * Math.PI * 2;
      kneeLX = kneeRX = 2.0;
      legLX = legRX = -1.6;
      armLX = armRX = -1.4;
      elbowLX = elbowRX = -1.6;
      lean = 0.6;
      headX = 0.4;
      rate = 30;
    } else if (state.action === 'slide') {
      // Leaning back, feet first.
      lean = -0.95;
      legLX = -1.35;
      kneeLX = 0.15;
      legRX = -0.9;
      kneeRX = 1.1;
      armLX = 0.6;
      armRX = -0.6;
      armLZ = 0.9;
      armRZ = -0.9;
      bob = -0.42;
      headX = 0.5;
      rate = 24;
    } else if (state.action === 'airdodge') {
      // A quick turn in the air, tucked.
      spin = k * Math.PI * 2;
      kneeLX = kneeRX = 1.3;
      legLX = legRX = -0.9;
      armLX = armRX = -0.4;
      armLZ = 1.2;
      armRZ = -1.2;
      rate = 30;
    } else if (state.cheer > 0) {
      const t = clock * 7;
      bob = Math.abs(Math.sin(t * 0.85)) * 0.2 * state.cheer;
      armLX = -2.9;
      armRX = -2.9;
      armLZ = 0.35 + Math.sin(t) * 0.25;
      armRZ = -0.35 - Math.sin(t) * 0.25;
      elbowLX = elbowRX = -0.2;
      kneeLX = kneeRX = 0.3 * (1 - bob * 4);
      yaw = Math.sin(clock * 2.6) * 0.5;
      rate = 12;
    } else if (state.air) {
      if (state.vy > 1) {
        // Rising: one knee up, arms forward and up.
        legLX = -1.0;
        kneeLX = 1.3;
        legRX = 0.35;
        kneeRX = 0.4;
        armLX = -2.3;
        armRX = -1.3;
        armLZ = 0.3;
        armRZ = -0.3;
        elbowLX = elbowRX = -0.5;
        lean = 0.1;
      } else {
        // Falling: arms out for balance, legs reaching for the ground.
        legLX = -0.45;
        kneeLX = 0.6;
        legRX = -0.1;
        kneeRX = 0.25;
        armLX = -1.1;
        armRX = -1.1;
        armLZ = 0.9;
        armRZ = -0.9;
        elbowLX = elbowRX = -0.3;
        lean = -0.05;
      }
      rate = 16;
    } else if (speed > 0.02) {
      // Walk and run: thighs and arms swing opposite; the back knee folds; a lean and a bob.
      const s = Math.sin(stride);
      const c = Math.cos(stride);
      const run = Math.min(1, speed * 1.3);
      legLX = s * (0.45 + 0.5 * run);
      legRX = -s * (0.45 + 0.5 * run);
      kneeLX = Math.max(0, -c) * (0.4 + 1.1 * run) + 0.08;
      kneeRX = Math.max(0, c) * (0.4 + 1.1 * run) + 0.08;
      armLX = -s * (0.35 + 0.65 * run);
      armRX = s * (0.35 + 0.65 * run);
      elbowLX = elbowRX = -(0.35 + 1.05 * run);
      armLZ = 0.1;
      armRZ = -0.1;
      const sprint = state.sprint ?? 0;
      lean = 0.06 + 0.18 * run + 0.16 * sprint;
      armLX *= 1 + 0.35 * sprint;
      armRX *= 1 + 0.35 * sprint;
      bob = Math.abs(c) * (0.025 + 0.05 * run);
      yaw = s * 0.12 * run;
      headX = -lean * 0.6;
      rate = 20;
    } else if (state.emote === 'saludo' && emoteTime < 2.4) {
      armLX = -0.3;
      armLZ = 2.6 + Math.sin(emoteTime * 11) * 0.35;
      elbowLX = -0.4;
      headY = 0.15;
      headX = -0.08;
    } else if (state.emote === 'baile' && emoteTime < 3.6) {
      const t = emoteTime * 6.5;
      pelvisRoll = Math.sin(t) * 0.14;
      yaw = Math.sin(t * 0.5) * 0.4;
      armLX = -1.6 + Math.sin(t) * 1.2;
      armRX = -1.6 - Math.sin(t) * 1.2;
      armLZ = 0.4;
      armRZ = -0.4;
      elbowLX = elbowRX = -1.2;
      kneeLX = 0.25 + Math.max(0, Math.sin(t)) * 0.35;
      kneeRX = 0.25 + Math.max(0, -Math.sin(t)) * 0.35;
      legLX = -kneeLX * 0.5;
      legRX = -kneeRX * 0.5;
      bob = -Math.abs(Math.sin(t)) * 0.05;
      headY = Math.sin(t) * 0.2;
    } else {
      // Idle: breathing, a slow shift of weight, a glance now and then.
      const breathe = Math.sin(clock * 2.1);
      armLZ = 0.12 + breathe * 0.02;
      armRZ = -0.12 - breathe * 0.02;
      pelvisRoll = Math.sin(clock * 0.7) * 0.035;
      headY = Math.sin(clock * 0.45) * 0.25 * Math.max(0, Math.sin(clock * 0.21));
      headX = Math.sin(clock * 0.9) * 0.03;
      bob = breathe * 0.006;
      rate = 8;
    }
    // Landing: the knees take it.
    if (land > 0 && !state.air) {
      bob -= land * 0.1;
      kneeLX += land * 0.7;
      kneeRX += land * 0.7;
      legLX -= land * 0.35;
      legRX -= land * 0.35;
      lean += land * 0.15;
    }

    const pelvisZ = ease('roll', pelvisRoll, rate, dt);
    const out: Pose = {
      tumbleX: state.action === 'roll' ? roll : ease('tumble', 0, 20, dt),
      tumbleY: state.action === 'airdodge' ? spin : 0,
      bob: ease('bob', bob, rate * 1.5, dt),
      spineX: ease('lean', lean, rate, dt),
      spineY: ease('yaw', yaw, rate, dt),
      spineZ: -pelvisZ * 0.6,
      pelvisZ,
      headX: ease('headX', headX, 10, dt),
      headY: ease('headY', headY, 6, dt),
      armLX: ease('aLX', armLX, rate, dt),
      armLZ: ease('aLZ', armLZ, rate, dt),
      armRX: ease('aRX', armRX, rate, dt),
      armRZ: ease('aRZ', armRZ, rate, dt),
      elbowL: ease('eL', elbowLX, rate, dt),
      elbowR: ease('eR', elbowRX, rate, dt),
      legLX: ease('lLX', legLX, rate, dt),
      legRX: ease('lRX', legRX, rate, dt),
      legLZ: ease('lLZ', legLZ, rate, dt),
      legRZ: ease('lRZ', legRZ, rate, dt),
      kneeL: ease('kL', kneeLX, rate, dt),
      kneeR: ease('kR', kneeRX, rate, dt),
      face,
    };

    // The face: a blink every few seconds, a grin for a cheer or a dance.
    blinkIn -= dt;
    if (state.cheer > 0 || (state.emote === 'baile' && emoteTime < 3.6)) setFace('happy');
    else if (blinkIn < 0) {
      setFace('blink');
      if (blinkIn < -0.12) blinkIn = 2 + Math.random() * 3.5;
    } else setFace('normal');
    out.face = face;
    return out;
  };
}
