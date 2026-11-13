import * as THREE from 'three';
import { buildCharacter } from '../character/build';
import type { Look } from '@/config/play-looks';
import { PALETTE, duskLight, duskSky, stoneMaterial } from './look';
import { disposeScene } from './runtime';

/**
 * The menus' stage (docs/PLAY.md): the character at the foot of a ruined
 * obsidian gate at dusk, the camera slowly circling, framed in the space a
 * sheet of choices leaves above it. Shared by the Plaza, the trials' list
 * and the shop.
 */
export function menuStage(look: Look) {
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
  const hero = buildCharacter(look);
  hero.group.rotation.y = 0.3;
  scene.add(hero.group);

  let t = 0;
  return {
    scene,
    camera,
    hero,
    fov: (aspect: number) => (aspect < 0.8 ? 42 : 34),
    /** One frame: the character idles, the camera circles above the sheet. */
    frame(dt: number, host: HTMLElement, sheet: HTMLElement) {
      t += dt;
      hero.update(dt, { speed: 0, air: false, vy: 0, cheer: 0, emote: null });
      const share = Math.min(0.66, sheet.offsetHeight / Math.max(1, host.clientHeight));
      const distance = camera.aspect < 0.8 ? 11 : 8.5;
      const shift = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance * share;
      camera.position.set(Math.sin(t * 0.08) * distance, 2.6 - shift, Math.cos(t * 0.08) * distance);
      camera.lookAt(0, 2.4 - shift, 0);
    },
    dispose() {
      hero.dispose();
      disposeScene(scene);
    },
  };
}
