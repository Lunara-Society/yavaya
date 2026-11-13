import * as THREE from 'three';
import type { Body } from './body';

/**
 * Pieces every world shares: light, the follow camera, the shadow under the
 * player. Kept here so the plaza and the course look and move alike.
 */

export function flat(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

/** Warm late-afternoon light: a sky-and-ground fill and one sun. */
export function light(scene: THREE.Scene, sky: number) {
  const color = new THREE.Color(sky);
  scene.background = color;
  scene.fog = new THREE.Fog(color, 45, 120);
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a5a66, 1.15));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.5);
  sun.position.set(-6, 12, -4);
  scene.add(sun);
}

/**
 * The follow camera: high, behind, looking well down, so gaps are seen as
 * gaps (the owner's first note from a real phone: from a low camera every
 * platform hid the hole in front of it). It never turns, so "up" on the
 * stick is always forward.
 */
export function followCamera(camera: THREE.PerspectiveCamera, player: Body) {
  const eye = new THREE.Vector3(player.x, player.y + 9, player.z - 7);
  const look = new THREE.Vector3();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    update(dt: number, height = 1) {
      const tall = camera.aspect < 0.8;
      const ease = reduced ? 1 : 1 - Math.exp(-7 * dt);
      eye.x += (player.x * 0.7 - eye.x) * ease;
      eye.y += (player.y + (tall ? 9.6 : 7.4) * height - eye.y) * (reduced ? 1 : 1 - Math.exp(-4 * dt));
      eye.z += (player.z - (tall ? 7.2 : 6.6) * height - eye.z) * ease;
      camera.position.copy(eye);
      look.set(player.x * 0.85, eye.y - (tall ? 9.0 : 6.9) * height, player.z + (tall ? 5.2 : 4.2));
      camera.lookAt(look);
    },
    snap() {
      eye.set(player.x * 0.7, player.y + 9, player.z - 7);
    },
  };
}

/** The soft round shadow that tells a jumping player where they will land. */
export function blobShadow(scene: THREE.Scene) {
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  return {
    place(x: number, floor: number, z: number, height: number) {
      shadow.position.set(x, floor + 0.06, z);
      const drop = Math.min(1, Math.max(0, height / 5));
      shadow.scale.setScalar(1 - drop * 0.5);
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 - drop * 0.18;
    },
  };
}
