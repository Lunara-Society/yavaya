import * as THREE from 'three';
import { buildCharacter } from '../character/build';
import { floorUnder } from '../engine/body';
import { RUN, SPRINT } from '../engine/moves';
import { disposeScene, type Mode } from '../engine/runtime';
import { blobShadow, followCamera } from '../engine/scenery';
import { PALETTE, duskLight, duskSky, stoneMaterial } from '../engine/look';
import { TRIALS, medal, type Hazard, type Kind, type Trial } from '../trials/data';
import { TrialSim, type SimSolid } from '../trials/sim';
import type { MoveInput } from '../engine/moves';
import { writeRecord } from '../trials/records';
import { el, type PlayContext } from '../context';

/**
 * A Prueba de Maestría, played (docs/PLAY.md): the trial's simulation
 * (trials/sim.ts) drawn in volcanic stone at dusk, with the screen over it.
 *
 * Instant retry is the rule: a fall puts the player back at once (a quarter
 * second, the world never reloads), ↻ starts over at any time, and the
 * finish panel's first button is "Otra vez". What went wrong is said in
 * words ("Te alcanzó el péndulo"), and every danger glows before it acts.
 */

const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export function createTrial(play: PlayContext, id: Trial['id'], options: { noCheckpoints: boolean }): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  const trial = TRIALS.find((t) => t.id === id)!;
  const sim = new TrialSim(trial, { noCheckpoints: options.noCheckpoints });
  const shadows = window.devicePixelRatio <= 3 && !/Android [4-7]\b/.test(navigator.userAgent);
  runtime.renderer.shadowMap.enabled = shadows;
  runtime.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  duskSky(scene);
  const sun = duskLight(scene, shadows);

  // --- Materials, one of each, shared ---
  const mats: Record<Kind, THREE.MeshStandardMaterial> = {
    basalt: stoneMaterial(PALETTE.basalt),
    stone: stoneMaterial(PALETTE.stone),
    obsidian: stoneMaterial(PALETTE.obsidian, { rough: 0.32, metal: 0.25 }),
    gold: stoneMaterial(PALETTE.gold, { rough: 0.35, metal: 0.8 }),
    crumble: stoneMaterial(PALETTE.crumble, { rough: 0.95 }),
    gate: stoneMaterial(PALETTE.gate, { rough: 0.4, metal: 0.3 }),
  };
  const cap = new THREE.MeshStandardMaterial({ color: 0xb8ab99, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.3, metalness: 0.9, emissive: 0x3a2400, emissiveIntensity: 0.4 });
  const ember = new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: PALETTE.ember, emissiveIntensity: 1.6, roughness: 0.6 });
  const fire = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  // --- The platforms, following the simulation ---
  const meshes = new Map<SimSolid, THREE.Object3D>();
  const gateWarn: Array<{ s: SimSolid; edge: THREE.Mesh }> = [];
  for (const s of sim.solids) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mats[s.plat.kind]);
    body.position.y = -s.h / 2;
    body.receiveShadow = true;
    group.add(body);
    // A worn lighter top, so the edge to stand on reads at a glance; gold trim on obsidian and gates.
    if (s.plat.kind !== 'gate') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.04, 0.06, s.d + 0.04), s.plat.kind === 'gold' ? trim : s.plat.kind === 'obsidian' ? mats.obsidian : cap);
      top.position.y = -0.02;
      top.receiveShadow = true;
      group.add(top);
    }
    if (s.plat.kind === 'obsidian' || s.plat.kind === 'gate') {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.06, 0.05, s.d + 0.06), s.plat.kind === 'gate' ? glow.clone() : trim);
      edge.position.y = 0.01;
      group.add(edge);
      if (s.plat.kind === 'gate') gateWarn.push({ s, edge });
    }
    scene.add(group);
    meshes.set(s, group);
  }

  // --- A river of lava under the course, dark rock beyond it ---
  const courseEnd = Math.max(...sim.solids.map((s) => s.maxZ));
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0x1a0603, emissive: 0xff4a10, emissiveIntensity: 0.4, roughness: 1 });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(26, courseEnd + 40), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(0, trial.floor + 1.5, courseEnd / 2);
  const rock = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), stoneMaterial(0x2c2629, { repeat: 60 }));
  rock.rotation.x = -Math.PI / 2;
  rock.position.set(0, trial.floor + 1.2, courseEnd / 2);
  scene.add(lava, rock);

  // --- Ruins, volcanoes and forest: instanced, so a hundred shapes cost a few draws ---
  const length = Math.max(...sim.solids.map((s) => s.maxZ)) + 10;
  let seed = trial.tier * 97;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Broken colonnades along both banks: thick drums of stone, none whole.
  const columnGeo = new THREE.CylinderGeometry(0.85, 0.95, 1, 12);
  const columns = new THREE.InstancedMesh(columnGeo, mats.stone, 26);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i += 1) {
    const side = i % 2 ? 1 : -1;
    const h = 2 + rand() * 5;
    m4.compose(new THREE.Vector3(side * (15 + rand() * 4), trial.floor + 1.2 + h / 2, -6 + (i / 26) * (length + 20)), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12)), new THREE.Vector3(1, h, 1));
    columns.setMatrixAt(i, m4);
  }
  scene.add(columns);
  const treeGeo = new THREE.ConeGeometry(2.2, 6, 7);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 1 }), 70);
  for (let i = 0; i < 70; i += 1) {
    const side = i % 2 ? 1 : -1;
    const sz = 0.8 + rand() * 1.4;
    m4.compose(new THREE.Vector3(side * (24 + rand() * 30), trial.floor + 1.2 + 3 * sz, -10 + rand() * (length + 40)), new THREE.Quaternion(), new THREE.Vector3(sz, sz, sz));
    trees.setMatrixAt(i, m4);
  }
  scene.add(trees);
  for (const [x, z, r, h] of [[-60, length + 80, 50, 60], [70, length + 120, 60, 70], [0, length + 170, 80, 95]] as const) {
    const volcano = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3240, roughness: 1 }));
    volcano.position.set(x, trial.floor + h / 2 - 2, z);
    scene.add(volcano);
  }

  // --- Hazards ---
  type Drawn = { h: Hazard; obj: THREE.Object3D; extra?: THREE.Mesh };
  const drawn: Drawn[] = [];
  const drawHazard = (h: Hazard): Drawn => {
    switch (h.kind) {
      case 'pendulum': {
        const pivot = new THREE.Group();
        pivot.position.set(h.x, h.y, h.z);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h.length, 6), trim);
        chain.position.y = -h.length / 2;
        const weight = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 0.28, 24), mats.obsidian);
        weight.rotation.x = Math.PI / 2;
        weight.position.y = -h.length;
        weight.castShadow = true;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(h.r, 0.05, 6, 24), ember);
        rim.position.y = -h.length;
        pivot.add(chain, weight, rim);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(h.axis === 'x' ? 0.3 : 9, 0.3, h.axis === 'x' ? 9 : 0.3), mats.basalt);
        beam.position.set(h.x, h.y + 0.15, h.z);
        scene.add(pivot, beam);
        return { h, obj: pivot };
      }
      case 'beam': {
        const pivot = new THREE.Group();
        pivot.position.set(h.x, h.y, h.z);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(h.r * 2, h.r * 2, h.length - h.inner), mats.obsidian);
        bar.position.z = (h.length + h.inner) / 2;
        bar.castShadow = true;
        const runes = new THREE.Mesh(new THREE.BoxGeometry(h.r * 2.1, 0.04, h.length - h.inner - 0.2), ember);
        runes.position.set(0, h.r + 0.01, (h.length + h.inner) / 2);
        pivot.add(bar, runes);
        scene.add(pivot);
        return { h, obj: pivot };
      }
      case 'bar': {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), mats.basalt);
        bar.position.set(h.x, h.y + h.h / 2, h.z);
        bar.castShadow = true;
        const under = new THREE.Mesh(new THREE.BoxGeometry(h.w, 0.05, h.d + 0.02), ember);
        under.position.y = -h.h / 2 - 0.01;
        bar.add(under);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, h.y + h.h + 0.4, 0.3), mats.stone);
          post.position.set(side * (h.w / 2 + 0.15), -(h.y + h.h) / 2 + h.h / 2 + 0.2, 0);
          bar.add(post);
        }
        scene.add(bar);
        return { h, obj: bar };
      }
      case 'vent': {
        const grate = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 0.06, 20), mats.obsidian);
        grate.position.set(h.x, h.y + 0.03, h.z);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(h.r, 0.06, 6, 24), glow.clone());
        ring.rotation.x = Math.PI / 2;
        ring.position.set(h.x, h.y + 0.07, h.z);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(h.r * 0.9, 2.6, 14, 1, true), fire.clone());
        flame.position.set(h.x, h.y + 1.3, h.z);
        scene.add(grate, ring, flame);
        return { h, obj: flame, extra: ring };
      }
      case 'curtain': {
        const wall = new THREE.Group();
        for (const off of [-0.12, 0.12]) {
          const sheet = new THREE.Mesh(new THREE.PlaneGeometry(h.w, h.h), fire.clone());
          sheet.position.z = off;
          wall.add(sheet);
        }
        wall.position.set(h.x, h.y + h.h / 2, h.z);
        scene.add(wall);
        return { h, obj: wall };
      }
    }
  };
  for (const h of trial.hazards) drawn.push(drawHazard(h));

  // --- The guardian ---
  const boss = trial.boss;
  const phaseDrawn: Drawn[][] = [];
  const plateMeshes: THREE.Mesh[][] = [];
  let eye: THREE.Mesh | null = null;
  if (boss) {
    const head = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), mats.obsidian);
    crown.position.y = 0.7;
    const mask = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.1), trim);
    mask.position.set(0, 0.8, 1.32);
    eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3a1a, emissiveIntensity: 3 }));
    eye.position.set(0, 0.8, 1.4);
    head.add(crown, mask, eye);
    head.position.set(boss.centre.x, 4.5, boss.centre.z);
    scene.add(head);
    boss.phases.forEach((phase, i) => {
      const list = phase.hazards.map(drawHazard);
      list.forEach((d) => (d.obj.visible = i === 0));
      phaseDrawn.push(list);
      plateMeshes.push(
        phase.plates.map((p) => {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 28), new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.8, roughness: 0.35, emissive: 0xffb84a, emissiveIntensity: 0 }));
          plate.position.set(p.x, boss.centre.y + 0.04, p.z);
          plate.visible = i === 0;
          scene.add(plate);
          return plate;
        }),
      );
    });
  }

  // --- Checkpoints (braziers) and the finish arch ---
  const braziers = trial.checkpoints.slice(1).map((c) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 10), mats.basalt);
    base.position.set(c.x - 2.1, c.y + 0.55, c.z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.2, 0.25, 12), trim);
    bowl.position.y = 0.65;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 10), fire.clone());
    flame.position.y = 1.05;
    flame.visible = false;
    base.add(bowl, flame);
    scene.add(base);
    return flame;
  });
  const f = trial.finish;
  const arch = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), mats.obsidian);
    post.position.set(side * (f.w / 2 - 0.4), 2.1, 0);
    post.castShadow = true;
    arch.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.5, 0.6), trim);
  lintel.position.y = 4.3;
  arch.add(lintel);
  arch.position.set(f.x, f.y, f.z + f.d / 2 - 0.4);
  scene.add(arch);

  // --- The player ---
  const hero = buildCharacter(play.look());
  hero.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  scene.add(hero.group);
  const shadow = blobShadow(scene);
  const view = followCamera(camera, sim.player);

  // --- The screen over it ---
  const hud = el('yp-hud yp-trial-hud');
  const tierChip = el('yp-tier', `${['I', 'II', 'III', 'IV', 'V'][trial.tier - 1]} · ${text(`play.trials.tier.${trial.id}`)}`);
  tierChip.dataset.tier = trial.id;
  const timeText = el('yp-time', clock(0));
  const failText = el('yp-fails', text('play.trials.fails', { count: 0 }));
  const phaseText = el('yp-phase');
  hud.append(tierChip, timeText, failText, phaseText);
  const restartButton = el('yp-icon', '↻', 'button');
  restartButton.setAttribute('aria-label', text('play.trials.restart'));
  const exitButton = el('yp-icon yp-exit', '✕', 'button');
  exitButton.setAttribute('aria-label', text('play.trials.exit'));
  const hint = el('yp-hint');
  hint.hidden = true;
  const failNote = el('yp-fail');
  failNote.hidden = true;
  const panel = el('yp-panel');
  panel.hidden = true;
  const panelTitle = el('yp-panel-title', text('play.trials.finished'));
  const panelMedal = el('yp-medal');
  const panelTime = el('yp-panel-time');
  const panelNote = el('yp-panel-note');
  const again = el('yp-again', text('play.trials.again'), 'button');
  const next = el('yp-ghost', text('play.trials.next'), 'button');
  const list = el('yp-ghost', text('play.trials.list'), 'button');
  panel.append(panelTitle, panelMedal, panelTime, panelNote, again, next, list);
  host.append(hud, restartButton, exitButton, hint, failNote, panel);
  controls.show(true);
  controls.offer(null);

  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: Event) => void) => {
    target.addEventListener(type, handler);
    off.push(() => target.removeEventListener(type, handler));
  };
  let hintUntil = 0;
  const shown = new Set<string>();
  const showHint = (key: string) => {
    if (shown.has(key)) return;
    shown.add(key);
    hint.textContent = text(`play.trials.hint.${key}`);
    hint.hidden = false;
    hintUntil = sim.time + 4.2;
  };
  let failUntil = 0;

  const restart = () => {
    sim.restart();
    panel.hidden = true;
    failNote.hidden = true;
    braziers.forEach((b) => (b.visible = false));
    syncPhase();
    view.snap();
  };
  listen(restartButton, 'click', restart);
  listen(again, 'click', restart);
  listen(exitButton, 'click', () => play.go('trials'));
  listen(list, 'click', () => play.go('trials'));
  const nextTrial = TRIALS[trial.tier];
  next.hidden = !nextTrial;
  listen(next, 'click', () => nextTrial && play.startTrial(nextTrial.id, options.noCheckpoints));
  listen(window, 'keydown', (event) => {
    if ((event as KeyboardEvent).code === 'KeyR' && !(event as KeyboardEvent).repeat) restart();
  });

  const syncPhase = () => {
    if (!boss) return;
    phaseDrawn.forEach((list, i) => list.forEach((d) => (d.obj.visible = i === sim.phase)));
    plateMeshes.forEach((list, i) => list.forEach((m) => (m.visible = i === sim.phase)));
  };

  function finish() {
    play.cue('portal');
    const seconds = sim.time;
    const earned = medal(trial, seconds, sim.usedCheckpoint);
    const record = writeRecord(trial.id, seconds, earned);
    panelMedal.textContent = text('play.trials.medal', { medal: text(`play.medal.${earned}`) });
    panelMedal.dataset.medal = earned;
    panelTime.textContent = clock(seconds);
    panelNote.textContent = [record ? text('play.trials.record') : '', text('play.trials.fails', { count: sim.fails })].filter(Boolean).join(' · ');
    panel.hidden = false;
  }

  // For the browser tests and films: the trial as it stands, to read.
  (host as HTMLElement & { ypSim?: TrialSim }).ypSim = sim;
  for (const h of trial.hints) if (h.z <= trial.start.z + 2) showHint(h.key);
  view.snap();

  let cheer = 0;
  return {
    scene,
    camera,
    step(dt) {
      if (sim.finished) {
        cheer = Math.min(1, cheer + dt * 3);
        controls.tick(dt);
        return;
      }
      // A browser test or a film may steer instead of the thumbs (a page script sets __ypPilot); players never do.
      const pilot = (window as unknown as { __ypPilot?: MoveInput }).__ypPilot;
      const e = sim.step(dt, pilot ?? controls, pilot ? sim.time * 1000 : performance.now());
      if (e.jumped) play.cue('door');
      if (e.dodged) play.cue('transition');
      if (e.failed) {
        play.cue('status');
        failNote.textContent = text(`play.trials.fail.${e.failed}`);
        failNote.hidden = false;
        failUntil = sim.time + 1.1;
        host.classList.add('yp-flash-red');
        window.setTimeout(() => host.classList.remove('yp-flash-red'), 240);
        failText.textContent = text('play.trials.fails', { count: sim.fails });
        if (options.noCheckpoints) braziers.forEach((b) => (b.visible = false));
        syncPhase();
      }
      if (e.checkpoint) {
        play.cue('success');
        braziers[e.checkpoint - 1] && (braziers[e.checkpoint - 1]!.visible = true);
      }
      if (e.plate !== null) play.cue('success');
      if (e.phase !== null) {
        play.cue('guardian');
        syncPhase();
        showHint(e.phase >= 3 ? 'exit' : `guardian_${e.phase + 1}`);
      }
      for (const h of trial.hints) if (sim.player.z >= h.z) showHint(h.key);
      if (e.finished) {
        cheer = 0;
        finish();
      }
    },
    frame(dt, now) {
      const p = sim.player;
      // The world as the simulation has it.
      for (const [s, mesh] of meshes) {
        mesh.position.set(s.x, s.y, s.z);
        if (s.crumbleAt !== null && s.dropped === 0) mesh.position.x += Math.sin(now / 18) * 0.04;
        mesh.visible = s.dropped < 6;
      }
      for (const g of gateWarn) (g.edge.material as THREE.MeshBasicMaterial).opacity = sim.gateWarn(g.s.plat, sim.time) * 0.9;
      const hazards = [...drawn, ...(boss && sim.phase < phaseDrawn.length ? phaseDrawn[sim.phase]! : [])];
      for (const d of hazards) {
        const h = d.h;
        const time = sim.clockOf(h);
        if (h.kind === 'pendulum') {
          const a = sim.pendulumAngle(h, time);
          if (h.axis === 'x') d.obj.rotation.z = a;
          else d.obj.rotation.x = -a;
        } else if (h.kind === 'beam') {
          d.obj.rotation.y = sim.beamAngle(h, time);
        } else if (h.kind === 'bar') {
          const c = sim.barPosition(h, time);
          d.obj.position.x = c.x;
          d.obj.position.z = c.z;
        } else if (h.kind === 'vent') {
          const v = sim.ventState(h, time);
          d.obj.visible = v.state === 'on';
          d.obj.scale.set(1, 0.85 + Math.sin(now / 40) * 0.12, 1);
          (d.extra!.material as THREE.MeshBasicMaterial).opacity = v.state === 'warn' ? 0.25 + 0.75 * v.k : v.state === 'on' ? 0.9 : 0;
        } else if (h.kind === 'curtain') {
          d.obj.scale.y = 0.92 + Math.sin(now / 60) * 0.08;
        }
      }
      if (boss) {
        plateMeshes[sim.phase]?.forEach((m, i) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = sim.plates[i] ? 1.6 : 0.05));
        if (eye) {
          const mat = eye.material as THREE.MeshStandardMaterial;
          mat.emissive.setHex(sim.phase >= boss.phases.length ? 0x6affc8 : 0xff3a1a);
          mat.emissiveIntensity = 2.4 + Math.sin(now / 200) * 0.8;
        }
        phaseText.textContent = sim.phase < boss.phases.length ? `${text('play.trials.phase', { n: sim.phase + 1 })} · ${text('play.trials.plates', { lit: sim.plates.filter(Boolean).length, total: sim.plates.length })}` : '';
      }
      lavaMat.emissiveIntensity = 0.4 + Math.sin(now / 900) * 0.08;

      // The player.
      hero.group.position.set(p.x, p.y, p.z);
      hero.group.rotation.y = p.facing;
      const speed = Math.hypot(p.vx, p.vz);
      const progress = p.action === 'roll' ? Math.min(1, p.actionTime / 0.26) : p.action === 'airdodge' ? Math.min(1, p.actionTime / 0.15) : p.actionTime;
      hero.update(dt, { speed: Math.min(1, speed / RUN), air: !p.grounded, vy: p.vy, cheer: sim.finished ? cheer : 0, emote: null, action: p.action, actionK: progress, sprint: Math.max(0, (speed - RUN) / (SPRINT - RUN)) });
      const floor = floorUnder(sim.solids, p.x, p.z, p.y, trial.floor);
      shadow.place(p.x, floor, p.z, p.y - floor);
      view.update(dt);
      sun.position.set(p.x - 9, p.y + 14, p.z - 7);
      sun.target.position.set(p.x, p.y, p.z);

      // The thumbs: Esquivar says what it will do.
      const { asked } = controls.axis();
      controls.dodge(text(p.grounded ? (asked > 0.5 && speed >= RUN * 0.85 ? 'play.dodge.slide' : 'play.dodge.roll') : 'play.dodge.air'));
      if (!sim.finished) timeText.textContent = clock(sim.time);
      if (sim.time > hintUntil) hint.hidden = true;
      if (sim.time > failUntil) failNote.hidden = true;
      runtime.debug?.(`${speed.toFixed(1)} m/s · m ${p.momentum.toFixed(2)} · ${p.action ?? '-'}`);
    },
    state: () => ({ trial: trial.id, x: sim.player.x, y: sim.player.y, z: sim.player.z, grounded: sim.player.grounded, finished: sim.finished, time: sim.time, fails: sim.fails, phase: sim.phase }),
    dispose() {
      off.forEach((undo) => undo());
      hud.remove();
      restartButton.remove();
      exitButton.remove();
      hint.remove();
      failNote.remove();
      panel.remove();
      controls.dodge(null);
      hero.dispose();
      disposeScene(scene);
      runtime.renderer.shadowMap.enabled = false;
    },
  };
}

