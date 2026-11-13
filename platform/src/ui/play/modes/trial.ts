import * as THREE from 'three';
import { buildCharacter } from '../character/build';
import { floorUnder } from '../engine/body';
import { RUN, SPRINT } from '../engine/moves';
import { disposeScene, type Mode } from '../engine/runtime';
import { blobShadow, followCamera } from '../engine/scenery';
import { PALETTE, duskLight } from '../engine/look';
import { dressFor } from '../engine/themes';
import { TRIALS, medal, type Hazard, type Medal } from '../trials/data';
import { courseById } from '../trials/courses';
import { TrialSim, type SimSolid } from '../trials/sim';
import type { MoveInput } from '../engine/moves';
import { Ghost, MAX_STEPS, StepInput, decodeRun, encodeRun, sampleOf, type Sample } from '../trials/run';
import { readGhost, writeGhost, writeRecord } from '../trials/records';
import { openBoard } from '../board';
import { shareChallenge } from '../share';
import { el, type Challenge, type PlayContext } from '../context';

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

/** The name of any course, for the screen and for a challenge's message. */
export function courseName(text: PlayContext['text'], id: string): string {
  const course = courseById(id);
  if (!course) return id;
  if (course.kind === 'daily') return text('play.course.name.daily');
  if (course.kind === 'district') return text(`play.course.name.${id}`);
  return text(`play.trials.name.${id}`);
}

export function createTrial(play: PlayContext, id: string, options: { noCheckpoints: boolean; challenge?: Challenge | null }): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  const trial = courseById(id)!;
  const kind = trial.kind ?? 'trial';
  const sim = new TrialSim(trial, { noCheckpoints: options.noCheckpoints });
  const shadows = window.devicePixelRatio <= 3 && !/Android [4-7]\b/.test(navigator.userAgent);
  runtime.renderer.shadowMap.enabled = shadows;
  runtime.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  const sun = duskLight(scene, shadows);

  // --- The course's dress (engine/themes.ts): materials, what lies below, the scenery ---
  const dress = dressFor(trial.theme, (trial.tier || 7) * 97 + id.length);
  const mats = dress.materials;
  const cap = dress.cap;
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

  // --- What lies under the course (lava, a street, the apron), and the scenery beyond ---
  const courseEnd = Math.max(...sim.solids.map((s) => s.maxZ));
  const lavaMat = dress.below;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(26, courseEnd + 40), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(0, trial.floor + 1.5, courseEnd / 2);
  scene.add(lava);
  dress.backdrop(scene, courseEnd + 10, trial.floor);

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
        // A stone disc, a shop sign, a suitcase: the course's dress; the danger is the same sphere.
        const weight =
          dress.weight === 'disc'
            ? new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 0.28, 24), mats.obsidian)
            : dress.weight === 'sign'
              ? new THREE.Mesh(new THREE.BoxGeometry(h.r * 2.2, h.r * 1.5, 0.12), new THREE.MeshStandardMaterial({ color: 0xe76f51, roughness: 0.7 }))
              : new THREE.Mesh(new THREE.BoxGeometry(h.r * 1.8, h.r * 1.3, h.r * 0.7), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.5 }));
        if (dress.weight === 'disc') weight.rotation.x = Math.PI / 2;
        else if (h.axis === 'x') weight.rotation.y = Math.PI / 2;
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
  const tierChip = el(
    'yp-tier',
    kind === 'trial' ? `${['I', 'II', 'III', 'IV', 'V'][trial.tier - 1]} · ${text(`play.trials.tier.${trial.id}`)}` : kind === 'daily' ? text('play.course.daily_chip', { date: play.today.slice(8, 10) + '/' + play.today.slice(5, 7) }) : courseName(text, id),
  );
  tierChip.dataset.tier = kind === 'trial' ? trial.id : kind;
  const timeText = el('yp-time', clock(0));
  const failText = el('yp-fails', text('play.trials.fails', { count: 0 }));
  const phaseText = el('yp-phase');
  const ghostText = el('yp-phase yp-ghost-line');
  hud.append(tierChip, timeText, failText, phaseText, ghostText);
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
  const panelTitle = el('yp-panel-title', text(kind === 'trial' ? 'play.trials.finished' : 'play.run.finished_course'));
  const panelMedal = el('yp-medal');
  const panelTime = el('yp-panel-time');
  const panelNote = el('yp-panel-note');
  const panelVerdict = el('yp-panel-note yp-verdict');
  const panelWins = el('yp-panel-wins');
  const again = el('yp-again', text('play.trials.again'), 'button');
  const share = el('yp-ghost yp-share', text('play.run.share'), 'button');
  share.hidden = true;
  const boardButton = el('yp-ghost', text('play.plaza.board'), 'button');
  const next = el('yp-ghost', text('play.trials.next'), 'button');
  const list = el('yp-ghost', text(kind === 'trial' ? 'play.trials.list' : 'play.run.menu'), 'button');
  const signIn = el('yp-ghost', text('play.plaza.signin'), 'a');
  signIn.setAttribute('href', play.signInHref);
  signIn.hidden = play.signedIn;
  panel.append(panelTitle, panelMedal, panelTime, panelNote, panelVerdict, panelWins, again, share, boardButton, next, signIn, list);
  host.append(hud, restartButton, exitButton, hint, failNote, panel);
  controls.show(true);
  controls.offer(null);
  // Presses from before the course began are not part of its run.
  controls.take();

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

  // --- The run, kept as what the thumbs did (trials/run.ts), and a ghost to race ---
  let input = new StepInput();
  let samples: Sample[] = [];
  let recording = true;
  const failedAt = new Set<number>();
  const challenge = options.challenge ?? null;
  const own = challenge ? null : readGhost(id);
  const ghostRun = challenge ? { samples: decodeRun(challenge.input), seconds: challenge.seconds, noCheckpoints: challenge.noCheckpoints } : own ? { samples: decodeRun(own.input), seconds: own.seconds, noCheckpoints: own.noCheckpoints } : null;
  const ghost = ghostRun?.samples ? new Ghost(trial, ghostRun.samples, ghostRun.noCheckpoints) : null;
  const shade = ghost ? buildCharacter(play.look()) : null;
  if (shade) {
    // A ghost is a pale copy that passes through everything: it only shows the way and the pace.
    shade.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      material.transparent = true;
      material.opacity = 0.32;
      material.depthWrite = false;
      material.color?.lerp(new THREE.Color(challenge ? 0x9fd8ff : 0xffffff), 0.5);
      mesh.material = material;
    });
    scene.add(shade.group);
    ghostText.textContent = challenge ? text('play.run.ghost_vs', { name: challenge.name, time: clock(challenge.seconds) }) : text('play.run.ghost_you', { time: clock(ghostRun!.seconds) });
  }
  play.signal('start', id);

  const restart = () => {
    sim.restart();
    input = new StepInput();
    samples = [];
    recording = true;
    failedAt.clear();
    controls.take();
    ghost?.restart();
    panel.hidden = true;
    failNote.hidden = true;
    braziers.forEach((b) => (b.visible = false));
    syncPhase();
    view.snap();
  };
  listen(restartButton, 'click', restart);
  listen(again, 'click', restart);
  const back = () => play.go(kind === 'trial' ? 'trials' : 'plaza');
  listen(exitButton, 'click', back);
  listen(list, 'click', back);
  listen(boardButton, 'click', () => openBoard(play, id));
  let keptRunId: string | null = null;
  listen(share, 'click', () => keptRunId && void shareChallenge(play, keptRunId, id, lastSeconds));
  const nextTrial = kind === 'trial' ? TRIALS[trial.tier] : undefined;
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

  let lastSeconds = 0;
  function finish() {
    play.cue('portal');
    play.signal('finish', id);
    const seconds = sim.time;
    lastSeconds = seconds;
    const earned: Medal = medal(trial, seconds, sim.usedCheckpoint);
    const record = writeRecord(trial.id, seconds, earned, play.today);
    panelMedal.textContent = text('play.trials.medal', { medal: text(`play.medal.${earned}`) });
    panelMedal.dataset.medal = earned;
    panelTime.textContent = clock(seconds);
    const versus = challenge ? (seconds < challenge.seconds ? text('play.run.beat', { name: challenge.name }) : text('play.run.not_beat', { gap: (seconds - challenge.seconds).toFixed(2), name: challenge.name })) : '';
    panelNote.textContent = [versus, record ? text('play.trials.record') : '', text('play.trials.fails', { count: sim.fails })].filter(Boolean).join(' · ');
    panelWins.replaceChildren();
    share.hidden = true;
    keptRunId = null;
    panel.hidden = false;
    if (!recording) {
      panelVerdict.textContent = '';
      return;
    }
    const kept = encodeRun(samples);
    writeGhost(trial.id, seconds, kept, options.noCheckpoints, play.today);
    if (!play.signedIn) {
      panelVerdict.textContent = text('play.run.guest');
      return;
    }
    panelVerdict.textContent = text('play.run.checking');
    void play.submitRun(trial.id, kept, options.noCheckpoints).then((verdict) => {
      if (!verdict.ok) {
        panelVerdict.textContent = text(verdict.reason === 'offline' ? 'play.run.offline' : 'play.run.unverified');
        return;
      }
      const before = play.account?.progress.level ?? verdict.progress.level;
      panelVerdict.textContent = verdict.earned.xp || verdict.earned.coins ? text('play.run.verified', { xp: verdict.earned.xp, coins: verdict.earned.coins }) : text('play.run.verified_plain');
      const wins: string[] = [];
      if (verdict.progress.level > before) wins.push(text('play.run.level_up', { level: verdict.progress.level }));
      for (const a of verdict.achievements) wins.push(text('play.run.achievement', { name: text(`play.achievement.${a}`) }));
      for (const item of verdict.items) {
        const [part, option] = item.split(':');
        wins.push(text('play.run.unlocked', { name: text(`play.look.${part}.${option}`) }));
      }
      panelWins.replaceChildren(...wins.map((w) => el('yp-win', w)));
      if (wins.length) play.cue('success');
      keptRunId = verdict.runId ?? play.account?.bests[trial.id]?.runId ?? null;
      share.hidden = !keptRunId;
    });
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
      const now = sim.time * 1000;
      let e: ReturnType<typeof sim.step>;
      if (pilot) {
        // Steered by a test or a film: played, but never kept or sent.
        recording = false;
        e = sim.step(dt, pilot, now);
      } else {
        // The thumbs, as one sample a step: what is played is exactly what is kept (trials/run.ts).
        const pressed = controls.take();
        const sample = sampleOf(controls.axis(), pressed.jump, pressed.dodge, pressed.lift);
        if (samples.length < MAX_STEPS) samples.push(sample);
        else recording = false;
        input.feed(sample, now);
        e = sim.step(dt, input, now);
      }
      ghost?.step();
      if (e.jumped) play.cue('door');
      if (e.dodged) play.cue('transition');
      if (e.failed) {
        play.cue('status');
        const themed = `play.trials.fail.${trial.theme}.${e.failed}`;
        failNote.textContent = text(text(themed) !== themed ? themed : `play.trials.fail.${e.failed}`);
        // Where players fall, counted without anything about who (once per stretch per attempt).
        if (!failedAt.has(sim.checkpoint)) {
          failedAt.add(sim.checkpoint);
          play.signal('fail', id, sim.checkpoint);
        }
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
      if (trial.theme === undefined || trial.theme === 'volcan') lavaMat.emissiveIntensity = 0.4 + Math.sin(now / 900) * 0.08;
      if (ghost && shade) {
        const g = ghost.sim.player;
        shade.group.visible = !ghost.done || ghost.sim.finished;
        shade.group.position.set(g.x, g.y, g.z);
        shade.group.rotation.y = g.facing;
        const gs = Math.hypot(g.vx, g.vz);
        shade.update(dt, { speed: Math.min(1, gs / RUN), air: !g.grounded, vy: g.vy, cheer: 0, emote: null, action: g.action, actionK: 0.5, sprint: Math.max(0, (gs - RUN) / (SPRINT - RUN)) });
      }

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
      shade?.dispose();
      disposeScene(scene);
      runtime.renderer.shadowMap.enabled = false;
    },
  };
}

