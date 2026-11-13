import type { Controls } from './controls';
import { datan2, dexp, dsin } from './dmath';

/**
 * How a player moves among boxes (docs/PLAY.md): gravity, a run, a jump with
 * a little forgiveness, and boxes to stand on and bump into. Every activity
 * uses this, so the character feels the same in the plaza as on the course.
 *
 * Boxes only, on purpose. A physics library would be most of the download
 * and none of the feel; a world of boxes is enough for streets, steps,
 * roofs, carts and walls.
 */

export type Box = {
  /** Centre x, top y, centre z; then width (x), height (y), depth (z). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** A box that slides: along `axis`, `range` metres each way, one cycle every `period` seconds. */
  move?: { axis: 'x' | 'z'; range: number; period: number; phase: number };
};

export type Solid = Box & { minX: number; maxX: number; minZ: number; maxZ: number; baseX: number; baseZ: number; dx: number; dz: number };

export type Body = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  facing: number;
  on: Solid | null;
  coyote: number;
};

export const GRAVITY = 26;
export const JUMP = 9.6;
export const RADIUS = 0.34;
export const HEIGHT = 1.6;

export function solid(box: Box): Solid {
  const made: Solid = { ...box, minX: 0, maxX: 0, minZ: 0, maxZ: 0, baseX: box.x, baseZ: box.z, dx: 0, dz: 0 };
  place(made, 0);
  return made;
}

/** Puts a box where it is at `time` (moving boxes slide), and how far it moved since. */
export function place(box: Solid, time: number) {
  let x = box.baseX;
  let z = box.baseZ;
  if (box.move) {
    const offset = dsin((time / box.move.period) * Math.PI * 2 + box.move.phase) * box.move.range;
    if (box.move.axis === 'x') x += offset;
    else z += offset;
  }
  box.dx = x - box.x;
  box.dz = z - box.z;
  box.x = x;
  box.z = z;
  box.minX = x - box.w / 2;
  box.maxX = x + box.w / 2;
  box.minZ = z - box.d / 2;
  box.maxZ = z + box.d / 2;
}

export function body(x: number, y: number, z: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, facing: 0, on: null, coyote: 0 };
}

/**
 * One step of movement. `frozen` holds the player still (a finish, a menu).
 * Returns whether a jump started this step (for a sound).
 */
export function stepBody(player: Body, solids: Solid[], controls: Controls, dt: number, options: { speed: number; frozen?: boolean }): { jumped: boolean } {
  controls.tick(dt);
  if (player.on?.move) {
    player.x += player.on.dx;
    player.z += player.on.dz;
  }
  let { x: ax, z: az, asked } = options.frozen ? { x: 0, z: 0, asked: 0 } : controls.axis();
  // Quick to answer on the ground, a little looser in the air. In the air
  // with nothing asked the player keeps going: a jump carries its run.
  // Letting go on the ground stops sooner than starting moves, so a thumb
  // lifted near an edge does not slide off it.
  const grip = player.grounded ? (asked > 0.05 ? 18 : 32) : 9;
  const blend = 1 - dexp(-grip * dt);
  if (player.grounded || asked > 0.05) {
    player.vx += (ax * options.speed - player.vx) * blend;
    player.vz += (az * options.speed - player.vz) * blend;
  }
  if (asked > 0.1) {
    const want = datan2(ax, az);
    let turn = want - player.facing;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    player.facing += turn * (1 - dexp(-14 * dt));
  }

  // A jump pressed a moment after running off an edge still counts.
  player.coyote = player.grounded ? 0.15 : player.coyote - dt;
  let jumped = false;
  if (!options.frozen && controls.jumpWaiting() && player.coyote > 0) {
    player.vy = JUMP;
    // A jump within a moment of the thumb leaving the stick takes the run it had.
    const released = controls.released();
    if (asked < 0.05 && performance.now() - released.at < 400) {
      ax = released.x;
      az = released.z;
      player.vx = ax * options.speed;
      player.vz = az * options.speed;
    }
    player.grounded = false;
    player.on = null;
    player.coyote = 0;
    controls.useJump();
    jumped = true;
  }
  player.vy -= GRAVITY * dt;

  const blocks = (box: Solid) => player.y < box.y - 0.3 && player.y + HEIGHT > box.y - box.h;
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
    // Feet may hang a little over an edge: generous by a third of the body.
    const over = RADIUS * 0.65;
    if (player.x + over <= box.minX || player.x - over >= box.maxX || player.z + over <= box.minZ || player.z - over >= box.maxZ) continue;
    if (player.vy <= 0 && before >= box.y - 0.32 && player.y <= box.y) {
      player.y = box.y;
      player.vy = 0;
      player.grounded = true;
      player.on = box;
    } else if (player.vy > 0 && before + HEIGHT <= box.y - box.h && player.y + HEIGHT > box.y - box.h) {
      player.y = box.y - box.h - HEIGHT;
      player.vy = 0;
    }
  }
  return { jumped };
}

/** The highest surface under a point (for a shadow): the ground below if none. */
export function floorUnder(solids: Solid[], x: number, z: number, y: number, ground: number): number {
  let floor = ground;
  for (const box of solids) {
    if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ && box.y <= y + 0.05 && box.y > floor) floor = box.y;
  }
  return floor;
}
