import * as THREE from 'three';
import { buildCharacter } from './character';
import { CHECKPOINTS, COINS, COLORS, FINISH_Z, PLATFORMS, SIGNS, SPEED, type Box } from './course';
import { sound, soundWanted } from '@/ui/first-light/sound';

/**
 * Yavaya Rush, the first playable (docs/PLAY.md).
 *
 * One file on purpose while it is one game: the loop, the movement, the
 * camera and the controls are read together when something feels wrong, and
 * "feels wrong" is the only bug that matters here.
 *
 * - Movement is this file's own: boxes to stand on and bump into, gravity,
 *   a jump with a little forgiveness at ledges (coyote time) and for an early
 *   press (buffering). A physics library would be most of the download and
 *   none of the feel.
 * - The camera sits behind and above and never turns, so "up" on the stick
 *   is always forward: nothing to learn, nothing to make anyone dizzy.
 * - A fixed step for the simulation, so the jump is the same on a slow phone
 *   as on a fast one; drawing happens as often as the phone can.
 * - Loaded only on /play, and only after its page has painted (loader.tsx).
 */

export type GameLabels = {
  time: string;
  best: string;
  coins: string;
  start: string;
  finished: string;
  record: string;
  again: string;
  jump: string;
};

const GRAVITY = 26;
const JUMP = 9.6;
const RADIUS = 0.34;
const HEIGHT = 1.6;
const STEP = 1 / 120;
const BEST_KEY = 'yavaya.play.rush1.best';
const FALL_Y = -5;

type Solid = Box & { minX: number; maxX: number; minZ: number; maxZ: number; baseX: number; baseZ: number; dx: number; dz: number; mesh: THREE.Mesh };

const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export function startGame(host: HTMLElement, labels: GameLabels): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
  // 1.5 is sharp on a phone and draws half the pixels of 2 or 3.
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.domElement.className = 'yp-canvas';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xf6c58f);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 45, 120);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a5a66, 1.15));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.5);
  sun.position.set(-6, 12, -4);
  scene.add(sun);

  // --- The course ---------------------------------------------------------------
  const flat = (color: number) => new THREE.MeshLambertMaterial({ color });
  const solids: Solid[] = PLATFORMS.map((box) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), flat(box.color));
    mesh.position.set(box.x, box.y - box.h / 2, box.z);
    scene.add(mesh);
    // A lighter cap, so the edge you may stand on reads at a glance.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(box.w + 0.06, 0.08, box.d + 0.06), flat(new THREE.Color(box.color).lerp(new THREE.Color(0xffffff), 0.22).getHex()));
    cap.position.y = box.h / 2;
    mesh.add(cap);
    return { ...box, minX: 0, maxX: 0, minZ: 0, maxZ: 0, baseX: box.x, baseZ: box.z, dx: 0, dz: 0, mesh };
  });
  const place = (solid: Solid, time: number) => {
    let x = solid.baseX;
    let z = solid.baseZ;
    if (solid.move) {
      const offset = Math.sin((time / solid.move.period) * Math.PI * 2 + solid.move.phase) * solid.move.range;
      if (solid.move.axis === 'x') x += offset;
      else z += offset;
    }
    solid.dx = x - solid.x;
    solid.dz = z - solid.z;
    solid.x = x;
    solid.z = z;
    solid.minX = x - solid.w / 2;
    solid.maxX = x + solid.w / 2;
    solid.minZ = z - solid.d / 2;
    solid.maxZ = z + solid.d / 2;
    solid.mesh.position.x = x;
    solid.mesh.position.z = z;
  };
  solids.forEach((solid) => place(solid, 0));

  // Water under the stones, and a far ground so a fall is into somewhere.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 27), new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.3, 25.7);
  scene.add(water);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), flat(0xb98f5e));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -3.2, 60);
  scene.add(ground);

  // The town on both sides: painted houses with tiled roofs, and the volcano beyond.
  const paints = [0xf2a65a, 0xe86f68, 0x6fb7c9, 0xf3d27a, 0xa9c98a, 0xd98fb8, 0xf5efe0];
  const houses = new THREE.Group();
  for (let i = 0; i < 30; i += 1) {
    const side = i % 2 ? 1 : -1;
    const z = (i >> 1) * 9 + 2;
    const w = 5 + ((i * 7) % 3);
    const h = 4.5 + ((i * 5) % 4) * 1.4;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h + 3.2, 7.5), flat(paints[i % paints.length]!));
    house.position.set(side * (8.2 + w / 2 + ((i * 3) % 2)), h / 2 - 1.6, z);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, 8), flat(COLORS.roof));
    roof.position.y = (h + 3.2) / 2 + 0.17;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 1.1), flat(0x5a3a26));
    door.position.set(-side * (w / 2 + 0.02), -(h + 3.2) / 2 + 3.2 + 1.05, 0.6);
    house.add(roof, door);
    houses.add(house);
  }
  scene.add(houses);
  const volcano = new THREE.Mesh(new THREE.ConeGeometry(46, 40, 24, 1, true), flat(0x7c6f8c));
  volcano.position.set(-18, 14, 205);
  scene.add(volcano);

  // Checkpoint flags, the finish arch, coins and the swinging signs.
  const flags = CHECKPOINTS.slice(1).map((point) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), flat(0x6b5a48));
    pole.position.set(point.x - 2.2, point.y + 1.1, point.z);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.04), flat(0x8a8378));
    cloth.position.set(0.38, 0.85, 0);
    pole.add(cloth);
    scene.add(pole);
    return cloth;
  });
  const arch = new THREE.Group();
  for (const x of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.4, 0.6), flat(COLORS.wall));
    post.position.set(x, 2.2, 0);
    arch.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.7), flat(COLORS.gold));
  lintel.position.y = 4.6;
  arch.add(lintel);
  arch.position.set(0, 3.6, FINISH_Z);
  scene.add(arch);

  const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14);
  const coinMaterial = new THREE.MeshLambertMaterial({ color: 0xf3c94f, emissive: 0x6b4a00 });
  const coins = COINS.map((at) => {
    const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(at.x, at.y, at.z);
    scene.add(mesh);
    return { mesh, taken: false };
  });

  const SIGN_PIVOT = 5.3;
  const SIGN_ROPE = 4.2;
  const signs = SIGNS.map((sign) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, SIGN_PIVOT, sign.z);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, SIGN_ROPE, 5), flat(0x4a3b2c));
    rope.position.y = -SIGN_ROPE / 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.16), flat(sign.color));
    board.position.y = -SIGN_ROPE;
    pivot.add(rope, board);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 0.18, 0.18), flat(0x4a3b2c));
    beam.position.set(0, SIGN_PIVOT, sign.z);
    scene.add(pivot, beam);
    return { ...sign, pivot, x: 0, y: 0 };
  });

  // --- The player ---------------------------------------------------------------
  const hero = buildCharacter();
  scene.add(hero.group);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const player = { x: 0, y: 0, z: 2, vx: 0, vy: 0, vz: 0, grounded: true, facing: 0, on: null as Solid | null };
  let checkpoint = 0;
  let coyote = 0;
  let buffered = 0;
  let started = false;
  let finished = false;
  let elapsed = 0;
  let collected = 0;
  let cheer = 0;
  let simTime = 0;

  const input = { x: 0, z: 0 };
  const keys = new Set<string>();

  // --- The screen over the game ---------------------------------------------------
  const el = (className: string, text = '') => {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  };
  const hud = el('yp-hud');
  const timeText = el('yp-time', clock(0));
  const coinText = el('yp-coins', `${labels.coins} 0/${COINS.length}`);
  const bestText = el('yp-best');
  hud.append(timeText, coinText, bestText);
  const hint = el('yp-hint', labels.start);
  const stick = el('yp-stick');
  const knob = el('yp-knob');
  stick.append(knob);
  const jumpButton = document.createElement('button');
  jumpButton.type = 'button';
  jumpButton.className = 'yp-jump';
  jumpButton.textContent = labels.jump;
  const panel = el('yp-panel');
  panel.hidden = true;
  const panelTitle = el('yp-panel-title');
  const panelTime = el('yp-panel-time');
  const panelNote = el('yp-panel-note');
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'yp-again';
  again.textContent = labels.again;
  panel.append(panelTitle, panelTime, panelNote, again);
  host.append(hud, hint, stick, jumpButton, panel);
  // ?debug on the address shows how the phone is doing: frames a second,
  // the run asked of the stick, the speed. Numbers only, for a report.
  const debug = new URLSearchParams(window.location.search).has('debug') ? el('yp-debug') : null;
  if (debug) host.append(debug);

  const readBest = () => {
    try {
      const value = Number(window.localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  };
  let best = readBest();
  const showBest = () => {
    bestText.textContent = best ? `${labels.best} ${clock(best)}` : '';
  };
  showBest();

  const cue = (name: 'success' | 'portal' | 'door') => {
    if (soundWanted()) sound().play(name, { force: true });
  };

  // --- Controls -----------------------------------------------------------------
  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) => {
    target.addEventListener(type, handler as EventListener, options);
    off.push(() => target.removeEventListener(type, handler as EventListener, options));
  };
  const pressJump = () => {
    buffered = 0.14;
  };
  const releaseJump = () => {
  };
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'KeyK') {
      event.preventDefault();
      pressJump();
    }
    if (event.code === 'KeyR') restart();
  }) as (event: never) => void);
  listen(window, 'keyup', ((event: KeyboardEvent) => {
    keys.delete(event.code);
    if (event.code === 'Space' || event.code === 'KeyK') releaseJump();
  }) as (event: never) => void);

  // The stick. It waits, always visible, at the bottom left, and a thumb
  // pressed on its upper part runs forward at once: the owner's runs on a real
  // phone pressed "forward" on a stick that only appeared under the thumb, so
  // every press was its centre and the run a crawl. A thumb that lands
  // elsewhere on the left half brings the stick to it, as before.
  //
  // It is a direction, not a throttle: past a small dead middle the player
  // runs at full speed. A course of jumps needs the run, never a walk.
  let stickId = -1;
  let stickX = 0;
  let stickY = 0;
  // Where the stick last pointed, for a thumb that leaves it to press jump.
  let released = { x: 0, z: 0, at: -1e9 };
  const STICK_REACH = 52;
  const STICK_DEAD = 9;
  const STICK_HOME_GRAB = 100;
  const home = () => {
    const box = host.getBoundingClientRect();
    return { x: box.left + 26 + 62, y: box.bottom - 40 - 62 };
  };
  const showStickAt = (x: number, y: number) => {
    const box = host.getBoundingClientRect();
    stick.style.left = `${x - box.left}px`;
    stick.style.top = `${y - box.top}px`;
  };
  const parkStick = () => {
    const spot = home();
    showStickAt(spot.x, spot.y);
    knob.style.transform = 'translate(-50%, -50%)';
    stick.classList.remove('is-on');
  };
  const steer = (clientX: number, clientY: number) => {
    let dx = clientX - stickX;
    let dy = clientY - stickY;
    const length = Math.hypot(dx, dy);
    if (length > STICK_REACH) {
      dx = (dx / length) * STICK_REACH;
      dy = (dy / length) * STICK_REACH;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const run = length < STICK_DEAD ? 0 : 1 / length;
    // Screen-right is −x: the camera looks along +z.
    input.x = -(clientX - stickX) * run;
    input.z = -(clientY - stickY) * run;
    // A thumb is never exactly above the middle. Near enough to straight
    // ahead (about 20°) is straight ahead, or every run drifts off the side.
    if (input.z > 0.94) {
      input.x = 0;
      input.z = 1;
    }
  };
  listen(
    host,
    'pointerdown',
    ((event: PointerEvent) => {
      if ((event.target as Element).closest('button, a')) return;
      if (event.pointerType === 'mouse') return;
      const box = host.getBoundingClientRect();
      if (event.clientX - box.left < box.width * 0.55 && stickId === -1) {
        stickId = event.pointerId;
        const spot = home();
        if (Math.hypot(event.clientX - spot.x, event.clientY - spot.y) < STICK_HOME_GRAB) {
          stickX = spot.x;
          stickY = spot.y;
        } else {
          stickX = event.clientX;
          stickY = event.clientY;
        }
        showStickAt(stickX, stickY);
        stick.classList.add('is-on');
        steer(event.clientX, event.clientY);
      } else if (event.clientX - box.left >= box.width * 0.55) {
        pressJump();
      }
    }) as (event: never) => void,
    { passive: true },
  );
  listen(
    host,
    'pointermove',
    ((event: PointerEvent) => {
      if (event.pointerId === stickId) steer(event.clientX, event.clientY);
    }) as (event: never) => void,
    { passive: true },
  );
  const lift = (event: PointerEvent) => {
    if (event.pointerId === stickId) {
      stickId = -1;
      released = { x: input.x, z: input.z, at: performance.now() };
      input.x = 0;
      input.z = 0;
      parkStick();
    } else {
      releaseJump();
    }
  };
  listen(host, 'pointerup', lift as (event: never) => void);
  listen(host, 'pointercancel', lift as (event: never) => void);
  listen(jumpButton, 'pointerdown', ((event: PointerEvent) => {
    event.stopPropagation();
    pressJump();
  }) as (event: never) => void);
  listen(jumpButton, 'pointerup', releaseJump as (event: never) => void);
  listen(again, 'click', (() => restart()) as (event: never) => void);

  // --- The rules ----------------------------------------------------------------
  function respawn() {
    const point = CHECKPOINTS[checkpoint]!;
    player.x = point.x;
    player.y = point.y + 0.05;
    player.z = point.z;
    player.vx = player.vy = player.vz = 0;
    player.on = null;
    host.classList.add('yp-flash');
    window.setTimeout(() => host.classList.remove('yp-flash'), 220);
  }

  function restart() {
    checkpoint = 0;
    started = false;
    finished = false;
    elapsed = 0;
    collected = 0;
    cheer = 0;
    for (const coin of coins) {
      coin.taken = false;
      coin.mesh.visible = true;
    }
    flags.forEach((flag) => (flag.material as THREE.MeshLambertMaterial).color.setHex(0x8a8378));
    panel.hidden = true;
    hint.hidden = false;
    timeText.textContent = clock(0);
    coinText.textContent = `${labels.coins} 0/${COINS.length}`;
    respawn();
    player.facing = 0;
  }

  function finish() {
    finished = true;
    cue('portal');
    const record = best === null || elapsed < best;
    if (record) {
      best = elapsed;
      try {
        window.localStorage.setItem(BEST_KEY, String(elapsed));
      } catch {
        // Kept for this visit only.
      }
      showBest();
    }
    panelTitle.textContent = labels.finished;
    panelTime.textContent = clock(elapsed);
    panelNote.textContent = `${record ? `${labels.record} · ` : ''}${labels.coins} ${collected}/${COINS.length}`;
    panel.hidden = false;
  }

  function simulate(dt: number) {
    simTime += dt;
    for (const solid of solids) if (solid.move) place(solid, simTime);
    for (const sign of signs) {
      const angle = Math.sin(simTime * sign.speed + sign.phase) * 1.05;
      sign.pivot.rotation.z = angle;
      sign.x = Math.sin(angle) * SIGN_ROPE;
      sign.y = SIGN_PIVOT - Math.cos(angle) * SIGN_ROPE;
    }
    if (finished) {
      cheer = Math.min(1, cheer + dt * 3);
      player.vx = player.vz = 0;
      return;
    }

    // What the player asks for: the stick, or the keys.
    let ax = input.x;
    let az = input.z;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) ax += 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) ax -= 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) az += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) az -= 1;
    const asked = Math.hypot(ax, az);
    if (asked > 1) {
      ax /= asked;
      az /= asked;
    }
    if (asked > 0.05 && !started) {
      started = true;
      hint.hidden = true;
    }
    // Quick to answer on the ground, a little looser in the air. In the air
    // with nothing asked the player keeps going: a jump carries its run, as a
    // real one does, rather than stopping dead when the thumb comes off.
    // Letting go on the ground stops the player sooner than starting moves
    // them, so a thumb lifted near an edge does not slide off it.
    const grip = player.grounded ? (asked > 0.05 ? 18 : 32) : 9;
    const blend = 1 - Math.exp(-grip * dt);
    if (player.grounded || asked > 0.05) {
      player.vx += (ax * SPEED - player.vx) * blend;
      player.vz += (az * SPEED - player.vz) * blend;
    }
    if (asked > 0.1) {
      const want = Math.atan2(ax, az);
      let turn = want - player.facing;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      player.facing += turn * (1 - Math.exp(-14 * dt));
    }

    // A jump pressed a moment after running off an edge still counts.
    coyote = player.grounded ? 0.15 : coyote - dt;
    buffered -= dt;
    if (buffered > 0 && coyote > 0) {
      player.vy = JUMP;
      // Played with one thumb, it leaves the stick to press jump and the run
      // is already slowing: a jump within a moment of letting go takes the run
      // it had.
      if (asked < 0.05 && performance.now() - released.at < 400) {
        player.vx = released.x * SPEED;
        player.vz = released.z * SPEED;
      }
      player.grounded = false;
      player.on = null;
      coyote = 0;
      buffered = 0;
      cue('door');
    }
    // Every jump is the whole jump. A shorter hop for a quick release was
    // here, and on a phone a tap is always a quick release: every jump fell short.
    player.vy -= GRAVITY * dt;

    // Carried by a cart.
    if (player.on?.move) {
      player.x += player.on.dx;
      player.z += player.on.dz;
    }

    const blocks = (solid: Solid) => player.y < solid.y - 0.3 && player.y + HEIGHT > solid.y - solid.h;
    player.x += player.vx * dt;
    for (const solid of solids) {
      if (!blocks(solid) || player.z + RADIUS <= solid.minZ || player.z - RADIUS >= solid.maxZ) continue;
      if (player.x + RADIUS > solid.minX && player.x - RADIUS < solid.maxX) {
        player.x = player.x < solid.x ? solid.minX - RADIUS : solid.maxX + RADIUS;
        player.vx = 0;
      }
    }
    player.z += player.vz * dt;
    for (const solid of solids) {
      if (!blocks(solid) || player.x + RADIUS <= solid.minX || player.x - RADIUS >= solid.maxX) continue;
      if (player.z + RADIUS > solid.minZ && player.z - RADIUS < solid.maxZ) {
        player.z = player.z < solid.z ? solid.minZ - RADIUS : solid.maxZ + RADIUS;
        player.vz = 0;
      }
    }
    const before = player.y;
    player.y += player.vy * dt;
    player.grounded = false;
    player.on = null;
    for (const solid of solids) {
      // Feet may hang a little over an edge: generous by a third of the body.
      const over = RADIUS * 0.65;
      if (player.x + over <= solid.minX || player.x - over >= solid.maxX || player.z + over <= solid.minZ || player.z - over >= solid.maxZ) continue;
      if (player.vy <= 0 && before >= solid.y - 0.32 && player.y <= solid.y) {
        player.y = solid.y;
        player.vy = 0;
        player.grounded = true;
        player.on = solid;
      } else if (player.vy > 0 && before + HEIGHT <= solid.y - solid.h && player.y + HEIGHT > solid.y - solid.h) {
        player.y = solid.y - solid.h - HEIGHT;
        player.vy = 0;
      }
    }

    if (started) elapsed += dt;
    if (player.y < FALL_Y) respawn();
    for (const sign of signs) {
      if (Math.abs(player.z - sign.z) < 0.5 && Math.hypot(player.x - sign.x, player.y + 0.9 - sign.y) < 0.95) respawn();
    }
    for (let i = checkpoint + 1; i < CHECKPOINTS.length; i += 1) {
      const point = CHECKPOINTS[i]!;
      if (player.z >= point.z && player.grounded && Math.abs(player.y - point.y) < 0.2) {
        checkpoint = i;
        (flags[i - 1]!.material as THREE.MeshLambertMaterial).color.setHex(COLORS.gold);
        cue('success');
      }
    }
    for (const coin of coins) {
      if (coin.taken) continue;
      const p = coin.mesh.position;
      if (Math.abs(player.x - p.x) < 0.75 && Math.abs(player.z - p.z) < 0.75 && p.y > player.y - 0.2 && p.y < player.y + HEIGHT + 0.3) {
        coin.taken = true;
        coin.mesh.visible = false;
        collected += 1;
        coinText.textContent = `${labels.coins} ${collected}/${COINS.length}`;
        cue('success');
      }
    }
    if (player.z >= FINISH_Z && player.grounded) finish();
  }

  // --- The frame ----------------------------------------------------------------
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    // A tall phone sees less to the sides: pull back a little.
    camera.fov = camera.aspect < 0.8 ? 62 : 55;
    camera.updateProjectionMatrix();
  };
  resize();
  listen(window, 'resize', resize as (event: never) => void);
  listen(window, 'resize', (() => stickId === -1 && parkStick()) as (event: never) => void);
  parkStick();

  // Some browsers magnify a page whatever it asks for (an accessibility
  // setting, an in-app browser). The game then keeps itself inside what can
  // actually be seen, so the timer and the jump button are never off-screen.
  const stage = (host.closest('.yp') as HTMLElement | null) ?? host;
  const view = window.visualViewport;
  const fit = () => {
    if (!view) return;
    const zoomed = view.scale > 1.01;
    stage.style.left = zoomed ? `${view.offsetLeft}px` : '';
    stage.style.top = zoomed ? `${view.offsetTop}px` : '';
    stage.style.width = zoomed ? `${view.width}px` : '';
    stage.style.height = zoomed ? `${view.height}px` : '';
    stage.style.right = zoomed ? 'auto' : '';
    stage.style.bottom = zoomed ? 'auto' : '';
    resize();
  };
  if (view) {
    listen(view, 'resize', fit as (event: never) => void);
    listen(view, 'scroll', fit as (event: never) => void);
    fit();
  }
  // Two thumbs are steering and jumping, never a pinch; two quick taps are two jumps, never a zoom.
  const noZoom = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  listen(stage, 'touchmove', noZoom as (event: never) => void, { passive: false });
  listen(stage, 'gesturestart', noZoom as (event: never) => void, { passive: false });
  listen(stage, 'dblclick', noZoom as (event: never) => void);

  const eye = new THREE.Vector3(0, 5, -6);
  const look = new THREE.Vector3();
  let frame = 0;
  let last = 0;
  let owed = 0;
  let slow = 0;
  let fpsAverage = 60;
  let stopped = false;
  respawn();
  host.classList.remove('yp-flash');

  const draw = (now: number) => {
    if (stopped) return;
    frame = window.requestAnimationFrame(draw);
    // Up to a quarter of a second is caught up in steps, so a phone drawing few
    // frames plays the course at its real speed rather than in slow motion.
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 0.016);
    last = now;
    owed += dt;
    while (owed >= STEP) {
      simulate(STEP);
      owed -= STEP;
    }

    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.y = player.facing;
    hero.pose(now / 1000, Math.min(1, Math.hypot(player.vx, player.vz) / SPEED), !player.grounded, cheer);
    // The shadow falls on whatever is below, which is how a jump is judged.
    let floor = -1.3;
    for (const solid of solids) {
      if (player.x > solid.minX && player.x < solid.maxX && player.z > solid.minZ && player.z < solid.maxZ && solid.y <= player.y + 0.05 && solid.y > floor) floor = solid.y;
    }
    shadow.position.set(player.x, floor + 0.06, player.z);
    const drop = Math.min(1, Math.max(0, (player.y - floor) / 5));
    shadow.scale.setScalar(1 - drop * 0.5);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 - drop * 0.18;

    for (const coin of coins) if (!coin.taken) coin.mesh.rotation.z = now / 500;

    // High and looking well down, so that the gaps between things are seen
    // as gaps: from a low camera every platform ahead hides the hole in front
    // of it (the owner's first note from a real phone). The character sits in
    // the lower third, with the course ahead filling the rest.
    const tall = camera.aspect < 0.8;
    const wantX = player.x * 0.7;
    const wantY = player.y + (tall ? 9.6 : 7.4);
    const wantZ = player.z - (tall ? 7.2 : 6.6);
    const ease = reduced ? 1 : 1 - Math.exp(-7 * dt);
    eye.x += (wantX - eye.x) * ease;
    eye.y += (wantY - eye.y) * (reduced ? 1 : 1 - Math.exp(-4 * dt));
    eye.z += (wantZ - eye.z) * ease;
    camera.position.copy(eye);
    look.set(player.x * 0.85, eye.y - (tall ? 9.0 : 6.9), player.z + (tall ? 5.2 : 4.2));
    camera.lookAt(look);

    if (started && !finished) timeText.textContent = clock(elapsed);
    if (debug) {
      fpsAverage += (1 / Math.max(dt, 0.001) - fpsAverage) * 0.05;
      debug.textContent = `${fpsAverage.toFixed(0)} fps · x${ratio}\n${Math.hypot(input.x, input.z).toFixed(2)} → ${Math.hypot(player.vx, player.vz).toFixed(1)} m/s`;
    }
    renderer.render(scene, camera);

    // A phone that cannot keep up draws fewer pixels rather than fewer frames.
    slow = dt > 0.04 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 50 && ratio > 1) {
      ratio = Math.max(1, ratio - 0.5);
      renderer.setPixelRatio(ratio);
      resize();
      slow = 0;
    }
  };
  frame = window.requestAnimationFrame(draw);
  listen(document, 'visibilitychange', (() => {
    last = 0;
    owed = 0;
  }) as (event: never) => void);

  // For the browser test, and for whoever debugs a course: where things stand, read-only.
  (host as HTMLElement & { ypState?: () => unknown }).ypState = () => ({
    x: player.x,
    y: player.y,
    z: player.z,
    grounded: player.grounded,
    started,
    finished,
    elapsed,
    collected,
    checkpoint,
    on: player.on ? { maxZ: player.on.maxZ, x: player.on.x, w: player.on.w } : null,
    carts: solids.filter((solid) => solid.move).map((solid) => solid.x),
    signs: signs.map((sign) => sign.x),
  });

  return () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    off.forEach((undo) => undo());
    renderer.dispose();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    host.replaceChildren();
  };
}
