import * as THREE from 'three';
import { buildCharacter } from '../character/build';
import { CHECKPOINTS, COINS, COLORS, FINISH_Z, PLATFORMS, SIGNS, SPEED } from '../course';
import { HEIGHT, body, floorUnder, place, solid, stepBody, type Solid } from '../engine/body';
import { disposeScene, type Mode } from '../engine/runtime';
import { blobShadow, flat, followCamera, light } from '../engine/scenery';
import { el, type PlayContext } from '../context';

/**
 * Yavaya Rush, course one (docs/PLAY.md): the timer, the coins, the
 * checkpoints, the finish and the best time, on the shared engine.
 */

const BEST_KEY = 'yavaya.play.rush1.best';
const FALL_Y = -5;
const SIGN_PIVOT = 5.3;
const SIGN_ROPE = 4.2;

const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export function createRush(play: PlayContext): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  light(scene, 0xf6c58f);

  // --- The course ---
  const solids: Array<Solid & { mesh: THREE.Mesh }> = PLATFORMS.map((box) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), flat(box.color));
    mesh.position.set(box.x, box.y - box.h / 2, box.z);
    scene.add(mesh);
    // A lighter cap, so the edge you may stand on reads at a glance.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(box.w + 0.06, 0.08, box.d + 0.06), flat(new THREE.Color(box.color).lerp(new THREE.Color(0xffffff), 0.22).getHex()));
    cap.position.y = box.h / 2;
    mesh.add(cap);
    return Object.assign(solid(box), { mesh });
  });
  const moveSolids = (time: number) => {
    for (const box of solids) {
      if (!box.move) continue;
      place(box, time);
      box.mesh.position.x = box.x;
      box.mesh.position.z = box.z;
    }
  };

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
    scene.add(house);
  }
  const volcano = new THREE.Mesh(new THREE.ConeGeometry(46, 40, 24, 1, true), flat(0x7c6f8c));
  volcano.position.set(-18, 14, 205);
  scene.add(volcano);

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

  // --- The player ---
  const hero = buildCharacter(play.look());
  scene.add(hero.group);
  const shadow = blobShadow(scene);
  const player = body(0, 0, 2);
  const view = followCamera(camera, player);

  let checkpoint = 0;
  let started = false;
  let finished = false;
  let elapsed = 0;
  let collected = 0;
  let cheer = 0;
  let simTime = 0;

  // --- The screen over the game ---
  const hud = el('yp-hud');
  const timeText = el('yp-time', clock(0));
  const coinText = el('yp-coins', `${text('play.coins')} 0/${COINS.length}`);
  const bestText = el('yp-best');
  hud.append(timeText, coinText, bestText);
  const menu = el('yp-menu', text('play.studio.open'), 'button');
  const trialsButton = el('yp-menu yp-menu-2', text('play.menu.trials'), 'button');
  trialsButton.hidden = !play.trials;
  const hint = el('yp-hint', text('play.start'));
  const panel = el('yp-panel');
  panel.hidden = true;
  const panelTitle = el('yp-panel-title');
  const panelTime = el('yp-panel-time');
  const panelNote = el('yp-panel-note');
  const again = el('yp-again', text('play.again'), 'button');
  const toStudio = el('yp-ghost', text('play.studio.open'), 'button');
  panel.append(panelTitle, panelTime, panelNote, again, toStudio);
  host.append(hud, menu, trialsButton, hint, panel);
  controls.show(true);
  controls.offer(null);

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
    bestText.textContent = best ? `${text('play.best')} ${clock(best)}` : '';
  };
  showBest();

  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: () => void) => {
    target.addEventListener(type, handler);
    off.push(() => target.removeEventListener(type, handler));
  };
  listen(again, 'click', () => restart());
  listen(menu, 'click', () => play.go('studio'));
  listen(trialsButton, 'click', () => play.go('trials'));
  listen(toStudio, 'click', () => play.go('studio'));
  const onKey = (event: Event) => {
    if ((event as KeyboardEvent).code === 'KeyR' && !(event as KeyboardEvent).repeat) restart();
  };
  listen(window, 'keydown', onKey as () => void);

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
    coinText.textContent = `${text('play.coins')} 0/${COINS.length}`;
    respawn();
    player.facing = 0;
  }

  function finish() {
    finished = true;
    play.cue('portal');
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
    panelTitle.textContent = text('play.finished');
    panelTime.textContent = clock(elapsed);
    panelNote.textContent = `${record ? `${text('play.record')} · ` : ''}${text('play.coins')} ${collected}/${COINS.length}`;
    panel.hidden = false;
  }

  respawn();
  host.classList.remove('yp-flash');
  view.snap();

  return {
    scene,
    camera,
    step(dt) {
      simTime += dt;
      moveSolids(simTime);
      for (const sign of signs) {
        const angle = Math.sin(simTime * sign.speed + sign.phase) * 1.05;
        sign.pivot.rotation.z = angle;
        sign.x = Math.sin(angle) * SIGN_ROPE;
        sign.y = SIGN_PIVOT - Math.cos(angle) * SIGN_ROPE;
      }
      if (finished) {
        cheer = Math.min(1, cheer + dt * 3);
        player.vx = player.vz = 0;
        controls.tick(dt);
        return;
      }
      if (!started && controls.axis().asked > 0.05) {
        started = true;
        hint.hidden = true;
      }
      const { jumped } = stepBody(player, solids, controls, dt, { speed: SPEED });
      if (jumped) play.cue('door');

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
          play.cue('success');
        }
      }
      for (const coin of coins) {
        if (coin.taken) continue;
        const p = coin.mesh.position;
        if (Math.abs(player.x - p.x) < 0.75 && Math.abs(player.z - p.z) < 0.75 && p.y > player.y - 0.2 && p.y < player.y + HEIGHT + 0.3) {
          coin.taken = true;
          coin.mesh.visible = false;
          collected += 1;
          coinText.textContent = `${text('play.coins')} ${collected}/${COINS.length}`;
          play.cue('success');
        }
      }
      if (player.z >= FINISH_Z && player.grounded) finish();
    },
    frame(dt, now) {
      hero.group.position.set(player.x, player.y, player.z);
      hero.group.rotation.y = player.facing;
      hero.update(dt, { speed: Math.hypot(player.vx, player.vz) / SPEED, air: !player.grounded, vy: player.vy, cheer, emote: null });
      const floor = floorUnder(solids, player.x, player.z, player.y, -1.3);
      shadow.place(player.x, floor, player.z, player.y - floor);
      for (const coin of coins) if (!coin.taken) coin.mesh.rotation.z = now / 500;
      view.update(dt);
      if (started && !finished) timeText.textContent = clock(elapsed);
      runtime.debug?.(`${controls.axis().asked.toFixed(2)} → ${Math.hypot(player.vx, player.vz).toFixed(1)} m/s`);
    },
    state: () => ({
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
      carts: solids.filter((box) => box.move).map((box) => box.x),
      signs: signs.map((sign) => sign.x),
    }),
    dispose() {
      off.forEach((undo) => undo());
      hud.remove();
      menu.remove();
      trialsButton.remove();
      hint.remove();
      panel.remove();
      hero.dispose();
      disposeScene(scene);
    },
  };
}
