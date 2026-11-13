import * as THREE from 'three';
import { buildCharacter } from '../character/build';
import { disposeScene, type Mode } from '../engine/runtime';
import { PALETTE, duskLight, duskSky, stoneMaterial } from '../engine/look';
import { TRIALS } from '../trials/data';
import { isOpen, readRecords } from '../trials/records';
import { el, type PlayContext } from '../context';

/**
 * The Ancient Gate (docs/PLAY.md): where the Pruebas de Maestría are chosen.
 * The character waits at the foot of a ruined obsidian gate at dusk; the
 * five trials are listed over it, each with its best time and medal, the
 * next one opening when the one before is beaten. The hardest ones are
 * there to aspire to: nothing else in Yavaya Play needs them.
 */
export function createTrialsMenu(play: PlayContext): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  duskSky(scene);
  duskLight(scene, false);
  const basalt = stoneMaterial(PALETTE.basalt);
  const obsidian = stoneMaterial(PALETTE.obsidian, { rough: 0.3, metal: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.85, roughness: 0.3 });
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.6, 40), basalt);
  ground.position.y = -0.3;
  scene.add(ground);
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.9), obsidian);
    post.position.set(side * 2.2, 3, 0);
    gate.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.8, 1.0), obsidian);
  lintel.position.y = 6.2;
  lintel.rotation.z = 0.04;
  const band = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.12, 1.05), gold);
  band.position.y = 5.85;
  gate.add(lintel, band);
  gate.position.z = -2.4;
  scene.add(gate);
  const hero = buildCharacter(play.look());
  hero.group.rotation.y = 0.3;
  scene.add(hero.group);

  // --- The list ---
  const sheet = el('yp-sheet yp-dark');
  const title = el('yp-sheet-title', text('play.trials.title'), 'h2');
  const lead = el('yp-sheet-lead', text('play.trials.lead'), 'p');
  const listEl = el('yp-trials');
  const mastery = el('yp-check', '', 'label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  mastery.append(box, el('', text('play.trials.mastery'), 'span'));
  const masteryNote = el('yp-sheet-note', text('play.trials.mastery_note'), 'p');
  const moves = el('yp-sheet-note', text('play.trials.moves'), 'p');
  const local = el('yp-sheet-note', text('play.trials.local_note'), 'p');
  const foot = el('yp-sheet-foot');
  const rush = el('yp-ghost', text('play.menu.rush'), 'button');
  const studio = el('yp-ghost', text('play.studio.open'), 'button');
  foot.append(rush, studio);
  sheet.append(title, lead, listEl, mastery, masteryNote, moves, local, foot);
  host.append(sheet);

  const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const records = readRecords();
  for (const t of TRIALS) {
    const open = isOpen(t.id, records);
    const card = el('yp-trial', '', 'button');
    card.dataset.tier = t.id;
    card.disabled = !open;
    const r = records[t.id];
    card.append(
      el('yp-trial-tier', `${['I', 'II', 'III', 'IV', 'V'][t.tier - 1]} · ${text(`play.trials.tier.${t.id}`)}`, 'span'),
      el('yp-trial-name', text(`play.trials.name.${t.id}`), 'span'),
      el('yp-trial-sub', open ? text(`play.trials.sub.${t.id}`) : text('play.trials.locked'), 'span'),
      el('yp-trial-best', r ? `${text('play.trials.best', { time: clock(r.best) })} · ${text(`play.medal.${r.medal}`)}` : open ? text('play.trials.untried') : '🔒', 'span'),
    );
    card.addEventListener('click', () => open && play.startTrial(t.id, box.checked));
    listEl.append(card);
  }
  rush.addEventListener('click', () => play.go('rush'));
  studio.addEventListener('click', () => play.go('studio'));

  let t = 0;
  return {
    scene,
    camera,
    fov: (aspect) => (aspect < 0.8 ? 42 : 34),
    frame(dt) {
      t += dt;
      hero.update(dt, { speed: 0, air: false, vy: 0, cheer: 0, emote: null });
      // Framed in the space above the list, slowly circling.
      const share = Math.min(0.66, sheet.offsetHeight / Math.max(1, host.clientHeight));
      const distance = camera.aspect < 0.8 ? 11 : 8.5;
      const shift = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance * share;
      camera.position.set(Math.sin(t * 0.08) * distance, 2.6 - shift, Math.cos(t * 0.08) * distance);
      camera.lookAt(0, 2.4 - shift, 0);
    },
    state: () => ({ menu: 'trials' }),
    dispose() {
      sheet.remove();
      hero.dispose();
      disposeScene(scene);
    },
  };
}
