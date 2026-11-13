import * as THREE from 'three';

/**
 * The first Yavaya Play character: built from rounded shapes in code, so it
 * costs no download, and moved by a few sines rather than recorded
 * animation. A modelled and rigged character replaces it in the next phase;
 * what the rest of the game uses (the group, `pose`) stays the same.
 *
 * Original on purpose: soft, rounded, human proportions with a slightly
 * large head. Not blocks.
 */
export type Look = { skin: number; hair: number; top: number; bottom: number; shoes: number };

export const DEFAULT_LOOK: Look = { skin: 0xc68a5f, hair: 0x2a1a12, top: 0xd8b25a, bottom: 0x2b3a67, shoes: 0xf2efe6 };

export type Character = {
  group: THREE.Group;
  /** `speed` 0…1 of a run, `air` whether off the ground, `cheer` 0…1 for the finish. */
  pose(time: number, speed: number, air: boolean, cheer: number): void;
};

export function buildCharacter(look: Look = DEFAULT_LOOK): Character {
  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
  const skin = mat(look.skin);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.34, 4, 10), mat(look.top));
  torso.position.y = 0.98;
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(look.bottom));
  hips.position.y = 0.72;
  hips.scale.set(1, 0.7, 0.9);
  const head = new THREE.Group();
  head.position.y = 1.47;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), skin);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.265, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(look.hair));
  hair.position.y = 0.02;
  hair.rotation.x = -0.25;
  const eye = (x: number) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), mat(0x1c1410));
    e.position.set(x, 0.02, 0.225);
    return e;
  };
  head.add(skull, hair, eye(-0.085), eye(0.085));
  body.add(torso, hips, head);

  const limb = (x: number, y: number, radius: number, length: number, material: THREE.Material, foot?: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 8), material);
    mesh.position.y = -(length / 2 + radius);
    pivot.add(mesh);
    if (foot) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.1, 0.11, radius * 3.3), foot);
      shoe.position.set(0, -(length + radius * 2) + 0.02, radius * 0.7);
      pivot.add(shoe);
    } else {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.25, 6, 6), skin);
      hand.position.y = -(length + radius * 1.6);
      pivot.add(hand);
    }
    body.add(pivot);
    return pivot;
  };
  const armL = limb(-0.31, 1.2, 0.07, 0.3, mat(look.top));
  const armR = limb(0.31, 1.2, 0.07, 0.3, mat(look.top));
  const legL = limb(-0.12, 0.66, 0.09, 0.36, mat(look.bottom), mat(look.shoes));
  const legR = limb(0.12, 0.66, 0.09, 0.36, mat(look.bottom), mat(look.shoes));

  return {
    group,
    pose(time, speed, air, cheer) {
      const stride = Math.sin(time * 13) * speed;
      if (cheer > 0) {
        // Arms up, a little hop and a turn.
        armL.rotation.set(0, 0, -2.6 + Math.sin(time * 9) * 0.25);
        armR.rotation.set(0, 0, 2.6 - Math.sin(time * 9) * 0.25);
        legL.rotation.x = legR.rotation.x = 0;
        body.position.y = Math.abs(Math.sin(time * 6)) * 0.22 * cheer;
        body.rotation.set(0, Math.sin(time * 3) * 0.6, 0);
        return;
      }
      body.rotation.y = 0;
      if (air) {
        armL.rotation.set(-2.2, 0, -0.35);
        armR.rotation.set(-2.2, 0, 0.35);
        legL.rotation.x = 0.7;
        legR.rotation.x = -0.35;
        body.position.y = 0;
        body.rotation.x = 0.12;
        return;
      }
      armL.rotation.set(-stride * 0.95, 0, -0.08);
      armR.rotation.set(stride * 0.95, 0, 0.08);
      legL.rotation.x = stride * 1.0;
      legR.rotation.x = -stride * 1.0;
      // A lean into the run, a bob with each step, and breathing when still.
      body.rotation.x = speed * 0.2;
      body.position.y = Math.abs(Math.cos(time * 13)) * 0.07 * speed + Math.sin(time * 2.2) * 0.012 * (1 - speed);
    },
  };
}
