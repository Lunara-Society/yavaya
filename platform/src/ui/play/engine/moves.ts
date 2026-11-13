import { GRAVITY, JUMP, RADIUS, type Body, type Solid } from './body';

/**
 * The mastery moveset (docs/PLAY.md, "Pruebas de Maestría"): the run of
 * Yavaya Rush plus momentum, a slide, a dodge roll and one dodge in the air.
 *
 * Easy to enter, hard to master:
 * - Momentum. Running straight builds it, over about a second, from a run
 *   (6.5 m/s) to a sprint (9.2 m/s); turning hard or stopping spends it, and
 *   the air keeps whatever the jump began with. A jump at a sprint carries
 *   about 6.8 m against 4.8 at a run, so a long gap asks for a clean line
 *   up to it, not a faster finger.
 * - One button, "Esquivar", read in context: running on the ground it is a
 *   slide (low enough to pass under a bar, keeping the speed); standing or
 *   walking on the ground it is a roll (a short burst, untouchable while it lasts, then
 *   a moment of recovery); in the air it is a dodge, once per jump, that
 *   adds up to two metres, the later in the jump the more.
 * - The combinations are the skill ceiling: sprint → jump → air dodge for
 *   the longest gaps; slide → jump for a jump that keeps the slide's speed.
 *
 * Everything is a fixed, published number and the same on every phone: the
 * simulation runs at a fixed step (runtime.ts), and nothing here is random.
 *
 * Pure logic, no drawing: the trials are proven completable by playing them
 * here, in Node, with no browser (tests/unit/play-trials.test.ts).
 */

export const RUN = 6.5;
export const SPRINT = 9.2;
/** Seconds of a clean straight run from a standing run to a full sprint. */
const BUILD = 1.0;
const DODGE_SPEED = 11;
const DODGE_TIME = 0.26;
const DODGE_RECOVER = 0.2;
const SLIDE_TIME = 0.6;
const SLIDE_MIN_SPEED = 0.85;
const AIR_DODGE_SPEED = 11.5;
const AIR_DODGE_TIME = 0.15;
const SLIDE_JUMP_BOOST = 1.2;
const AIR_DODGE_CATCH = -1.5;
export const STAND_HEIGHT = 1.6;
export const LOW_HEIGHT = 0.85;

export type Action = 'roll' | 'slide' | 'airdodge' | null;

export type Mover = Body & {
  momentum: number;
  action: Action;
  actionTime: number;
  dirX: number;
  dirZ: number;
  airDodged: boolean;
  /** Untouchable by hazards (the roll's burst). */
  untouchable: boolean;
  /** Bent low (a slide): the body's height is LOW_HEIGHT. */
  low: boolean;
};

/** What the moveset needs from the thumbs; the real controls and the tests' scripted ones both provide it. */
export type MoveInput = {
  axis(): { x: number; z: number; asked: number };
  jumpWaiting(): boolean;
  useJump(): void;
  dodgeWaiting(): boolean;
  useDodge(): void;
  tick(dt: number): void;
  released(): { x: number; z: number; at: number };
};

export function mover(x: number, y: number, z: number): Mover {
  return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, facing: 0, on: null, coyote: 0, momentum: 0, action: null, actionTime: 0, dirX: 0, dirZ: 1, airDodged: false, untouchable: false, low: false };
}

export type MoveEvents = { jumped: boolean; dodged: Action; landed: boolean };

/**
 * One fixed step of movement among `solids`. `now` is a clock in
 * milliseconds, the same one the input's `released().at` reads (the page's
 * in a browser, the simulation's own headless).
 */
export function stepMover(player: Mover, solids: Solid[], input: MoveInput, dt: number, now: number, frozen = false): MoveEvents {
  input.tick(dt);
  const events: MoveEvents = { jumped: false, dodged: null, landed: false };
  if (player.on?.move) {
    player.x += player.on.dx;
    player.z += player.on.dz;
  }
  const { x: ax, z: az, asked } = frozen ? { x: 0, z: 0, asked: 0 } : input.axis();
  const speed = Math.hypot(player.vx, player.vz);

  // --- Starting an action ---
  if (!frozen && input.dodgeWaiting() && player.action === null) {
    const dir = asked > 0.1 ? norm(ax, az) : speed > 0.5 ? norm(player.vx, player.vz) : { x: Math.sin(player.facing), z: Math.cos(player.facing) };
    if (player.grounded) {
      // Running (stick held, near a run's speed): a slide. Otherwise: a roll.
      player.action = asked > 0.5 && speed >= RUN * SLIDE_MIN_SPEED ? 'slide' : 'roll';
      if (player.action === 'slide') {
        const along = norm(player.vx, player.vz);
        player.dirX = along.x;
        player.dirZ = along.z;
      } else {
        player.dirX = dir.x;
        player.dirZ = dir.z;
        player.momentum = 0;
      }
      player.actionTime = 0;
      input.useDodge();
      events.dodged = player.action;
    } else if (!player.airDodged) {
      player.action = 'airdodge';
      player.actionTime = 0;
      player.dirX = dir.x;
      player.dirZ = dir.z;
      player.airDodged = true;
      input.useDodge();
      events.dodged = 'airdodge';
    }
  }

  // --- Moving ---
  player.untouchable = false;
  if (player.action === 'roll') {
    player.actionTime += dt;
    if (player.actionTime < DODGE_TIME) {
      player.untouchable = true;
      player.vx = player.dirX * DODGE_SPEED;
      player.vz = player.dirZ * DODGE_SPEED;
    } else {
      // Recovery: the body is slowing and steers only a little.
      const blend = 1 - Math.exp(-6 * dt);
      player.vx += (ax * RUN - player.vx) * blend;
      player.vz += (az * RUN - player.vz) * blend;
      if (player.actionTime >= DODGE_TIME + DODGE_RECOVER) player.action = null;
    }
  } else if (player.action === 'slide') {
    player.actionTime += dt;
    // The slide keeps its speed, losing a little, and steers only a little.
    const keep = Math.max(RUN * 0.8, Math.hypot(player.vx, player.vz) - 1.8 * dt);
    const steer = 1 - Math.exp(-2.5 * dt);
    if (asked > 0.1) {
      player.dirX += (ax - player.dirX) * steer;
      player.dirZ += (az - player.dirZ) * steer;
      const d = norm(player.dirX, player.dirZ);
      player.dirX = d.x;
      player.dirZ = d.z;
    }
    player.vx = player.dirX * keep;
    player.vz = player.dirZ * keep;
    player.low = true;
    // A slide ends on time, but never with something low overhead.
    if (player.actionTime >= SLIDE_TIME && headroom(player, solids)) {
      player.action = null;
      player.low = false;
    }
    if (!player.grounded) {
      player.action = null;
      player.low = false;
    }
  } else if (player.action === 'airdodge') {
    player.actionTime += dt;
    if (player.actionTime < AIR_DODGE_TIME) {
      player.vx = player.dirX * AIR_DODGE_SPEED;
      player.vz = player.dirZ * AIR_DODGE_SPEED;
      // A brief check of the fall, not a second jump.
      player.vy = Math.max(player.vy, AIR_DODGE_CATCH);
    } else {
      // Out of the dodge at the speed the run had, or a sprint's if it was faster.
      const out = Math.max(RUN, Math.min(SPRINT, speed));
      player.vx = player.dirX * out;
      player.vz = player.dirZ * out;
      player.action = null;
    }
  } else if (player.grounded || asked > 0.05) {
    // Momentum: built by a clean straight run, spent by a hard turn or a stop.
    if (player.grounded) {
      const want = asked > 0.1 ? norm(ax, az) : null;
      const along = speed > 0.5 ? norm(player.vx, player.vz) : null;
      const aligned = want && along ? want.x * along.x + want.z * along.z : 0;
      if (want && asked > 0.5 && aligned > 0.94 && speed > RUN * 0.85) player.momentum = Math.min(1, player.momentum + dt / BUILD);
      else player.momentum = Math.max(0, player.momentum - dt * (aligned < 0.7 ? 4 : 2.5));
    }
    const top = RUN + (SPRINT - RUN) * player.momentum;
    // In the air a speed above the run's (a slide jump, a dodge) is kept while
    // the stick holds the line: the air steers, it does not brake.
    const aligned = speed > 0.5 && asked > 0.1 ? (ax * player.vx + az * player.vz) / (speed * Math.hypot(ax, az)) : 0;
    const keep = !player.grounded && speed > top && aligned > 0.9 ? speed : top;
    const grip = player.grounded ? (asked > 0.05 ? 16 : 30) : 8;
    const blend = 1 - Math.exp(-grip * dt);
    player.vx += (ax * keep - player.vx) * blend;
    player.vz += (az * keep - player.vz) * blend;
  }
  if (asked > 0.1 && player.action !== 'roll' && player.action !== 'slide') {
    const want = Math.atan2(ax, az);
    let turn = want - player.facing;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    player.facing += turn * (1 - Math.exp(-14 * dt));
  } else if (player.action === 'roll' || player.action === 'slide') {
    player.facing = Math.atan2(player.dirX, player.dirZ);
  }

  // --- Jumping ---
  player.coyote = player.grounded ? 0.15 : player.coyote - dt;
  if (!frozen && input.jumpWaiting() && player.coyote > 0 && player.action !== 'roll') {
    player.vy = JUMP;
    const released = input.released();
    if (asked < 0.05 && player.action === null && now - released.at < 400) {
      const top = RUN + (SPRINT - RUN) * player.momentum;
      player.vx = released.x * top;
      player.vz = released.z * top;
    }
    if (player.action === 'slide') {
      // Slide → jump: the jump keeps the slide's speed, and a little more.
      const d = norm(player.vx, player.vz);
      const s = Math.hypot(player.vx, player.vz) + SLIDE_JUMP_BOOST;
      player.vx = d.x * s;
      player.vz = d.z * s;
      player.action = null;
      player.low = false;
    }
    player.grounded = false;
    player.on = null;
    player.coyote = 0;
    input.useJump();
    events.jumped = true;
  }
  player.vy -= GRAVITY * dt;

  // --- Colliding ---
  const wasGrounded = player.grounded;
  collide(player, solids, dt, player.low ? LOW_HEIGHT : STAND_HEIGHT);
  if (player.grounded) {
    player.airDodged = false;
    if (!wasGrounded) events.landed = true;
  }
  return events;
}

function norm(x: number, z: number) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

/** Nothing low over the player: standing up would not hit it. */
function headroom(player: Mover, solids: Solid[]) {
  for (const box of solids) {
    if (player.x + RADIUS <= box.minX || player.x - RADIUS >= box.maxX || player.z + RADIUS <= box.minZ || player.z - RADIUS >= box.maxZ) continue;
    const bottom = box.y - box.h;
    if (bottom > player.y + LOW_HEIGHT - 0.05 && bottom < player.y + STAND_HEIGHT) return false;
  }
  return true;
}

/** Boxes to stand on and bump into: the same rules as engine/body.ts, with the body's height given. */
export function collide(player: Body, solids: Solid[], dt: number, height: number) {
  const blocks = (box: Solid) => player.y < box.y - 0.3 && player.y + height > box.y - box.h;
  player.x += player.vx * dt;
  for (const box of solids) {
    if (!blocks(box) || player.z + RADIUS <= box.minZ || player.z - RADIUS >= box.maxZ) continue;
    if (player.x + RADIUS > box.minX && player.x - RADIUS < box.maxX) {
      player.x = player.x < box.x ? box.minX - RADIUS : box.maxX + RADIUS;
      player.vx = 0;
    }
  }
  player.z += player.vz * dt;
  for (const box of solids) {
    if (!blocks(box) || player.x + RADIUS <= box.minX || player.x - RADIUS >= box.maxX) continue;
    if (player.z + RADIUS > box.minZ && player.z - RADIUS < box.maxZ) {
      player.z = player.z < box.z ? box.minZ - RADIUS : box.maxZ + RADIUS;
      player.vz = 0;
    }
  }
  const before = player.y;
  player.y += player.vy * dt;
  player.grounded = false;
  player.on = null;
  for (const box of solids) {
    const over = RADIUS * 0.65;
    if (player.x + over <= box.minX || player.x - over >= box.maxX || player.z + over <= box.minZ || player.z - over >= box.maxZ) continue;
    if (player.vy <= 0 && before >= box.y - 0.32 && player.y <= box.y) {
      player.y = box.y;
      player.vy = 0;
      player.grounded = true;
      player.on = box;
    } else if (player.vy > 0 && before + height <= box.y - box.h && player.y + height > box.y - box.h) {
      player.y = box.y - box.h - height;
      player.vy = 0;
    }
  }
}
