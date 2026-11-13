import * as THREE from 'three';
import type { Kind, Theme } from '../trials/data';
import { PALETTE, duskSky, stoneMaterial } from './look';

/**
 * How a course is dressed (docs/PLAY.md): the trials' volcano, a barrio's
 * rooftops at sunset, an airport at dusk. Only the look changes: the same
 * platform kinds, the same hazards, the same rules. Everything is made in
 * code; nothing is downloaded.
 */

export type Dress = {
  materials: Record<Kind, THREE.MeshStandardMaterial>;
  /** The worn top of a platform, so its edge reads at a glance. */
  cap: THREE.MeshStandardMaterial;
  /** What lies below the course: lava, a street, the apron. */
  below: THREE.MeshStandardMaterial;
  /** The swinging hazard's weight: a stone disc, a shop sign, a suitcase. */
  weight: 'disc' | 'sign' | 'case';
  /** The scenery beside and beyond the course. */
  backdrop(scene: THREE.Scene, length: number, floor: number): void;
};

/** A seeded generator, so the scenery of a course is the same every time it is played. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const flat = (color: number, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function volcan(seed: number): Dress {
  return {
    materials: {
      basalt: stoneMaterial(PALETTE.basalt),
      stone: stoneMaterial(PALETTE.stone),
      obsidian: stoneMaterial(PALETTE.obsidian, { rough: 0.32, metal: 0.25 }),
      gold: stoneMaterial(PALETTE.gold, { rough: 0.35, metal: 0.8 }),
      crumble: stoneMaterial(PALETTE.crumble, { rough: 0.95 }),
      gate: stoneMaterial(PALETTE.gate, { rough: 0.4, metal: 0.3 }),
    },
    cap: new THREE.MeshStandardMaterial({ color: 0xb8ab99, roughness: 0.8 }),
    below: new THREE.MeshStandardMaterial({ color: 0x1a0603, emissive: 0xff4a10, emissiveIntensity: 0.4, roughness: 1 }),
    weight: 'disc',
    backdrop(scene, length, floor) {
      duskSky(scene);
      const rand = seeded(seed);
      const m4 = new THREE.Matrix4();
      const rock = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), stoneMaterial(0x2c2629, { repeat: 60 }));
      rock.rotation.x = -Math.PI / 2;
      rock.position.set(0, floor + 1.2, length / 2);
      scene.add(rock);
      // Broken colonnades along both banks: thick drums of stone, none whole.
      const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 0.95, 1, 12), stoneMaterial(PALETTE.stone), 26);
      for (let i = 0; i < 26; i += 1) {
        const side = i % 2 ? 1 : -1;
        const h = 2 + rand() * 5;
        m4.compose(new THREE.Vector3(side * (15 + rand() * 4), floor + 1.2 + h / 2, -6 + (i / 26) * (length + 20)), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12)), new THREE.Vector3(1, h, 1));
        columns.setMatrixAt(i, m4);
      }
      const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 7), flat(0x1f3a2a, 1), 70);
      for (let i = 0; i < 70; i += 1) {
        const side = i % 2 ? 1 : -1;
        const sz = 0.8 + rand() * 1.4;
        m4.compose(new THREE.Vector3(side * (24 + rand() * 30), floor + 1.2 + 3 * sz, -10 + rand() * (length + 40)), new THREE.Quaternion(), new THREE.Vector3(sz, sz, sz));
        trees.setMatrixAt(i, m4);
      }
      scene.add(columns, trees);
      for (const [x, z, r, h] of [[-60, length + 80, 50, 60], [70, length + 120, 60, 70], [0, length + 170, 80, 95]] as const) {
        const volcano = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24, 1, true), flat(0x3a3240, 1));
        volcano.position.set(x, floor + h / 2 - 2, z);
        scene.add(volcano);
      }
    },
  };
}

/** Rooftops of a barrio at sunset: painted concrete, tin and terracotta, shop signs, a cart, a shutter. */
function barrio(seed: number): Dress {
  return {
    materials: {
      basalt: flat(0xd9b48a, 0.9),
      stone: flat(0xb5543c, 0.8),
      obsidian: flat(0x8a5a36, 0.7),
      gold: flat(0xe3c271, 0.35, 0.7),
      crumble: flat(0x9c7a54, 0.95),
      gate: flat(0x7a8088, 0.45, 0.6),
    },
    cap: flat(0xf1e4cc, 0.85),
    below: new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 1 }),
    weight: 'sign',
    backdrop(scene, length, floor) {
      duskSky(scene, 0x24325a, 0xf0a868);
      const rand = seeded(seed);
      const m4 = new THREE.Matrix4();
      const walls = [0xe9c46a, 0xf4a261, 0x8ecae6, 0xe76f51, 0x9bd1a8, 0xf2e8cf, 0xd4a5c9];
      // Houses down both sides, each its own colour, with a darker roof slab.
      for (const side of [-1, 1]) {
        for (let z = -10; z < length + 30; z += 7 + rand() * 4) {
          const h = 5 + rand() * 7;
          const w = 5 + rand() * 3;
          const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), flat(walls[Math.floor(rand() * walls.length)]!, 0.9));
          house.position.set(side * (9 + w / 2 + rand() * 2), floor + h / 2, z);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, 6.4), flat(0x6b3a2a, 0.8));
          roof.position.set(0, h / 2 + 0.2, 0);
          house.add(roof);
          scene.add(house);
        }
      }
      // Lines of washing across the street, high up.
      const cloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), 60);
      const tint = new THREE.Color();
      for (let i = 0; i < 60; i += 1) {
        m4.compose(new THREE.Vector3((rand() - 0.5) * 16, floor + 13 + rand() * 2, -5 + rand() * (length + 20)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        cloth.setMatrixAt(i, m4);
        cloth.setColorAt(i, tint.setHex(walls[i % walls.length]!));
      }
      scene.add(cloth);
      const street = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), flat(0x3b3a3f, 1));
      street.rotation.x = -Math.PI / 2;
      street.position.set(0, floor + 1.15, length / 2);
      scene.add(street);
    },
  };
}

/** An airport at dusk: a terminal's floor, belts, barriers, security gates; the apron and a plane beyond. */
function diaspora(seed: number): Dress {
  return {
    materials: {
      basalt: flat(0xd9dde3, 0.6),
      stone: flat(0x9aa3ad, 0.5, 0.3),
      obsidian: flat(0x2b2d33, 0.6, 0.2),
      gold: flat(0xe3c271, 0.35, 0.7),
      crumble: flat(0xc69c6d, 0.95),
      gate: flat(0x5b6770, 0.35, 0.6),
    },
    cap: flat(0xf4f6f8, 0.5),
    below: new THREE.MeshStandardMaterial({ color: 0x2f3136, roughness: 1 }),
    weight: 'case',
    backdrop(scene, length, floor) {
      duskSky(scene, 0x1d3557, 0xa8c8da);
      const rand = seeded(seed);
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), flat(0x3a3d44, 1));
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(0, floor + 1.15, length / 2);
      scene.add(apron);
      // The terminal: long glass halls on both sides.
      const glass = new THREE.MeshStandardMaterial({ color: 0x8fb7cf, roughness: 0.15, metalness: 0.6, emissive: 0x1d3557, emissiveIntensity: 0.3 });
      for (const side of [-1, 1]) {
        for (let z = -10; z < length + 30; z += 24) {
          const hall = new THREE.Mesh(new THREE.BoxGeometry(10, 7 + rand() * 3, 22), glass);
          hall.position.set(side * 18, floor + 4.5, z);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 23), flat(0xe6e9ed, 0.6));
          roof.position.y = 4.4;
          hall.add(roof);
          scene.add(hall);
        }
      }
      // The control tower, and a plane waiting beyond the end.
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 26, 16), flat(0xe6e9ed, 0.6));
      tower.position.set(-34, floor + 13, length + 30);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.4, 3, 16), glass);
      cab.position.y = 14;
      tower.add(cab);
      const plane = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 30, 20), flat(0xf4f6f8, 0.4, 0.2));
      body.rotation.x = Math.PI / 2;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5), flat(0xdfe3e8, 0.4, 0.2));
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 4), flat(0xd8b25a, 0.4, 0.2));
      tail.position.set(0, 3.5, -13);
      plane.add(body, wing, tail);
      plane.position.set(30, floor + 4, length + 50);
      plane.rotation.y = 0.6;
      scene.add(tower, plane);
    },
  };
}

export function dressFor(theme: Theme | undefined, seed: number): Dress {
  return theme === 'barrio' ? barrio(seed) : theme === 'diaspora' ? diaspora(seed) : volcan(seed);
}
