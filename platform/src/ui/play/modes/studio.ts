import * as THREE from 'three';
import { LOOK_OPTIONS, LOOK_PARTS, lockedParts, lookImage, lookOption, unlockOf, type Look, type LookPart } from '@/config/play-looks';
import { PLAY_RULES } from '@/config/business-rules';
import { buildCharacter, type Emote } from '../character/build';
import { disposeScene, type Mode } from '../engine/runtime';
import { el, type PlayContext } from '../context';

/**
 * The Character Studio (docs/PLAY.md): the character on a turntable in the
 * top of the screen, the choices in a sheet below it. A finger dragged
 * across the character turns it; the face and hair tabs bring the camera
 * close. Nothing is kept until "Guardar".
 *
 * The first visit opens here ("Crea tu personaje") and goes on to play;
 * later visits come from the game and go back to it.
 */

/** Parts whose choices are about the head: the camera comes in close for them. */
const HEAD_PARTS: LookPart[] = ['skin', 'face', 'hair', 'hairColor', 'beard', 'paint', 'glasses'];

export function createStudio(play: PlayContext, options: { first: boolean }): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24414a);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x30454c, 1.25));
  const key = new THREE.DirectionalLight(0xffe7c2, 1.8);
  key.position.set(2.5, 4, 4);
  const rim = new THREE.DirectionalLight(0x9fd8e0, 1.1);
  rim.position.set(-3, 3, -4);
  scene.add(key, rim);

  // The stage: a terracotta turntable with a gold rim, under a pool of light,
  // and two colonial arches behind (the studio is a room in the plaza).
  const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.16, 48), lambert(0xb5603c));
  table.position.y = -0.08;
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.025, 8, 64), lambert(0xd8b25a));
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.0;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0xffe9c4, transparent: true, opacity: 0.12 }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.15;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), lambert(0x2f4f57));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.16;
  scene.add(table, rimRing, glow, floor);
  for (const x of [-2.1, 2.1]) {
    const arch = new THREE.Group();
    for (const side of [-0.75, 0.75]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3, 0.28), lambert(0xe9dcc2));
      pillar.position.set(side, 1.5, 0);
      arch.add(pillar);
    }
    const curve = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.14, 8, 24, Math.PI), lambert(0xe9dcc2));
    curve.position.y = 3;
    arch.add(curve);
    arch.position.set(x, -0.16, -2.6);
    arch.rotation.y = -Math.sign(x) * 0.35;
    scene.add(arch);
  }

  let look: Look = { ...play.look() };
  const saved = JSON.stringify(look);
  const turntable = new THREE.Group();
  scene.add(turntable);
  const hero = buildCharacter(look);
  turntable.add(hero.group);
  turntable.rotation.y = -0.35;

  // --- The sheet ---
  const sheet = el('yp-sheet');
  const head = el('yp-sheet-head');
  const title = el('yp-sheet-title', text(options.first ? 'play.studio.title_new' : 'play.studio.title'), 'h2');
  const random = el('yp-chip', text('play.studio.random'), 'button');
  head.append(title, random);
  const tabs = el('yp-tabs');
  tabs.setAttribute('role', 'tablist');
  const grid = el('yp-options');
  const foot = el('yp-sheet-foot');
  const wave = el('yp-chip', text('play.studio.wave'), 'button');
  const dance = el('yp-chip', text('play.studio.dance'), 'button');
  const spacer = el('yp-grow');
  const back = el('yp-ghost', text('play.studio.back'), 'button');
  back.hidden = options.first;
  const save = el('yp-primary', text(options.first ? 'play.studio.start' : 'play.studio.save'), 'button');
  foot.append(wave, dance, spacer, back, save);
  const note = el('yp-sheet-note');
  note.setAttribute('role', 'status');
  sheet.append(head, tabs, grid, foot, note);
  const turnHint = el('yp-turn-hint', text('play.studio.turn'));
  host.append(sheet, turnHint);

  let part: LookPart = 'face';
  // Colours show as a dot; shapes (body, face, hair) by name alone.
  const swatch = (which: LookPart, id: string) => (['body', 'face', 'hair'].includes(which) ? null : (lookOption(which, id).color ?? null));
  const renderTabs = () => {
    tabs.replaceChildren(
      ...LOOK_PARTS.map((each) => {
        const tab = el('yp-tab', text(`play.look.part.${each}`), 'button');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(each === part));
        tab.addEventListener('click', () => {
          part = each;
          renderTabs();
          renderOptions();
        });
        return tab;
      }),
    );
  };
  // Earned options (docs/PLAY.md, "Shop and rewards") can be tried on by anyone, and kept by whoever owns them.
  const owned = () => new Set(play.account?.owned ?? []);
  const howToGet = (which: LookPart, id: string) => {
    const unlock = unlockOf(which, id);
    if (!unlock) return '';
    if (!play.account) return text('play.unlock.signin');
    if (unlock === 'shop') return text('play.unlock.shop', { price: PLAY_RULES.shop[`${which}:${id}`] ?? 0 });
    if (unlock === 'gems') return text('play.unlock.gems', { price: PLAY_RULES.gems[`${which}:${id}`] ?? 0 });
    if (unlock === 'founder') return text('play.unlock.founder');
    return text('play.unlock.achievement', { name: text(`play.achievement.${unlock}`) });
  };
  const renderOptions = () => {
    const have = owned();
    grid.replaceChildren(
      ...LOOK_OPTIONS[part].map((option) => {
        const button = el('yp-option', '', 'button');
        if (option.unlock && !have.has(`${part}:${option.id}`)) button.classList.add('is-locked');
        button.setAttribute('aria-pressed', String(look[part] === option.id));
        const thumb = lookImage(part, option.id);
        const color = thumb ? null : swatch(part, option.id);
        if (thumb) {
          // The option's own picture, fetched only when this tab is opened.
          const img = document.createElement('img');
          img.className = 'yp-thumb';
          img.src = thumb;
          img.alt = '';
          img.loading = 'lazy';
          button.append(img);
        } else if (color !== null) {
          const dot = el('yp-dot');
          dot.style.background = `#${new THREE.Color(color).getHexString()}`;
          button.append(dot);
        }
        button.append(el('yp-option-name', text(`play.look.${part}.${option.id}`), 'span'));
        button.addEventListener('click', () => choose(part, option.id));
        return button;
      }),
    );
  };
  const choose = (which: LookPart, id: string) => {
    look = { ...look, [which]: id };
    hero.dress(look);
    renderOptions();
    note.textContent = unlockOf(which, id) && !owned().has(`${which}:${id}`) ? howToGet(which, id) : '';
  };
  renderTabs();
  renderOptions();

  // --- Emotes, a surprise, keeping it ---
  let emote: Emote | null = null;
  let emoteUntil = 0;
  let clockTime = 0;
  const play2 = (which: Emote) => {
    emote = null;
    // A new emote starts from the beginning even if the same one is playing.
    window.setTimeout(() => {
      emote = which;
      emoteUntil = clockTime + (which === 'saludo' ? 2.4 : 3.6);
    }, 0);
  };
  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: Event) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, handler, opts);
    off.push(() => target.removeEventListener(type, handler, opts));
  };
  listen(wave, 'click', () => play2('saludo'));
  listen(dance, 'click', () => play2('baile'));
  listen(random, 'click', () => {
    const next = { ...look };
    const have = owned();
    for (const each of LOOK_PARTS) {
      // A surprise from what the player may wear.
      const choices = LOOK_OPTIONS[each].filter((o) => !o.unlock || have.has(`${each}:${o.id}`));
      next[each] = choices[Math.floor(Math.random() * choices.length)]!.id;
    }
    look = next;
    hero.dress(look);
    renderOptions();
    play2('saludo');
  });
  listen(back, 'click', () => play.go('plaza'));
  listen(save, 'click', async () => {
    const missing = lockedParts(look).filter((item) => !owned().has(item));
    if (missing.length) {
      const [which, id] = missing[0]!.split(':') as [LookPart, string];
      note.textContent = text('play.unlock.locked_save', { how: howToGet(which, id) });
      return;
    }
    save.disabled = true;
    note.textContent = text('play.studio.saving');
    const kept = await play.saveLook(look);
    save.disabled = false;
    if (!kept) {
      note.textContent = text('play.studio.save_failed');
      return;
    }
    note.textContent = text(play.signedIn ? 'play.studio.saved_account' : 'play.studio.saved_device');
    play.cue('success');
    if (options.first || JSON.stringify(look) !== saved) {
      play2('baile');
      window.setTimeout(() => play.go('plaza'), options.first ? 1400 : 900);
    } else play.go('plaza');
  });

  // --- Turning it with a finger ---
  let dragging = -1;
  let lastX = 0;
  let spin = 0;
  listen(host, 'pointerdown', (event) => {
    const e = event as PointerEvent;
    if ((e.target as Element).closest('.yp-sheet, button, a')) return;
    dragging = e.pointerId;
    lastX = e.clientX;
    turnHint.classList.add('is-gone');
  });
  listen(host, 'pointermove', (event) => {
    const e = event as PointerEvent;
    if (e.pointerId !== dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    turntable.rotation.y += dx * 0.012;
    spin = dx * 0.012 * 60;
  });
  const drop = (event: Event) => {
    if ((event as PointerEvent).pointerId === dragging) dragging = -1;
  };
  listen(host, 'pointerup', drop);
  listen(host, 'pointercancel', drop);

  // The camera: whole body, or close on the head for the head's choices.
  const target = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let close = 0;

  return {
    scene,
    camera,
    fov: (aspect) => (aspect < 0.8 ? 34 : 28),
    frame(dt) {
      clockTime += dt;
      if (emote && clockTime > emoteUntil) emote = null;
      if (dragging === -1) {
        turntable.rotation.y += spin * dt;
        spin *= Math.exp(-3 * dt);
      }
      hero.update(dt, { speed: 0, air: false, vy: 0, cheer: 0, emote });
      close += ((HEAD_PARTS.includes(part) ? 1 : 0) - close) * (1 - Math.exp(-5 * dt));
      // The sheet covers the lower part of the screen, so the character is
      // framed in the part above it: the camera looks below what it frames.
      const tall = camera.aspect < 0.8;
      const sheetShare = Math.min(0.62, sheet.offsetHeight / Math.max(1, host.clientHeight));
      const distance = THREE.MathUtils.lerp(tall ? 6.6 : 5, tall ? 3.3 : 2.6, close);
      const focusY = THREE.MathUtils.lerp(0.8, 1.38, close);
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      const shift = Math.tan(fovRad / 2) * distance * sheetShare;
      target.set(0, focusY - shift, 0);
      eye.set(0, focusY - shift + 0.25 + close * 0.05, distance);
      camera.position.copy(eye);
      camera.lookAt(target);
    },
    state: () => ({ studio: true, look }),
    dispose() {
      off.forEach((undo) => undo());
      sheet.remove();
      turnHint.remove();
      hero.dispose();
      disposeScene(scene);
    },
  };
}

