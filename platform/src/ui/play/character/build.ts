import * as THREE from 'three';
import { DEFAULT_LOOK, lookOption, type Look } from '@/config/play-looks';
import { FACE_SHELL, faceTextures, type FaceState } from './face';

/**
 * The Yavaya Play character (docs/PLAY.md): one model for every game, built
 * in code from smooth shapes and dressed from the look's ids
 * (config/play-looks.ts).
 *
 * Why code and not a modelled file: it is a few kilobytes instead of a few
 * megabytes, every option in the catalogue is a few lines, and the same
 * shapes animate with joints (shoulder, elbow, hip, knee) without a rig to
 * export. The style is cel-shaded (three tones of light) with a thin dark
 * outline, which reads clearly at the size a phone shows a character and
 * costs almost nothing to draw.
 *
 * Animation is posed by code each frame from the player's state: idle
 * (breathing, weight shift, a blink), walk and run blended by speed, jump
 * and fall, a squash on landing, a cheer and two emotes. Every joint eases
 * toward where it should be, so one pose flows into the next.
 */

export type Emote = 'saludo' | 'baile';

export type MotionState = {
  /** 0…1 of a full run. */
  speed: number;
  air: boolean;
  /** Vertical speed, to tell rising from falling. */
  vy: number;
  /** 0…1, the finish. */
  cheer: number;
  emote: Emote | null;
};

export type Character = {
  group: THREE.Group;
  update(dt: number, state: MotionState): void;
  /** Puts on another look without rebuilding the joints (the studio). */
  dress(look: Look): void;
  dispose(): void;
};

const STILL: MotionState = { speed: 0, air: false, vy: 0, cheer: 0, emote: null };

// --- Shared drawing ----------------------------------------------------------------

let toonRamp: THREE.DataTexture | null = null;
/** Three tones of light: shadow, mid, lit. */
function ramp() {
  if (toonRamp) return toonRamp;
  toonRamp = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/**
 * The outline: each shape drawn once more, its back faces only, pushed out
 * along its normals and painted dark. The classic way to outline a cartoon,
 * and one small shader shared by every part.
 */
function outlineMaterial(thickness: number) {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(0x2a1d18) } },
    vertexShader: 'uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
    side: THREE.BackSide,
  });
}

// --- The character -------------------------------------------------------------------

export function buildCharacter(initial: Look = DEFAULT_LOOK, options: { outline?: boolean } = {}): Character {
  const outlined = options.outline ?? true;
  const outline = outlineMaterial(0.012);
  const materials = new Map<number, THREE.MeshToonMaterial>();
  const paint = (color: number) => {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshToonMaterial({ color, gradientMap: ramp() });
      materials.set(color, material);
    }
    return material;
  };
  // Shapes belong to the look that made them: a new look disposes them.
  let geometries: THREE.BufferGeometry[] = [];
  const keep = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };

  const group = new THREE.Group();
  // The model is drawn about 1.8 m tall; the game's body is 1.6 m.
  group.scale.setScalar(0.9);
  const root = new THREE.Group();
  group.add(root);
  const HIP_Y = 0.82;
  const pelvis = new THREE.Group();
  pelvis.position.y = HIP_Y;
  const spine = new THREE.Group();
  spine.position.y = HIP_Y;
  root.add(pelvis, spine);


  const shape = (geometry: THREE.BufferGeometry, color: number, parent: THREE.Object3D, at?: [number, number, number], line = true) => {
    const mesh = new THREE.Mesh(geometry, paint(color));
    if (at) mesh.position.set(...at);
    parent.add(mesh);
    if (outlined && line) mesh.add(new THREE.Mesh(geometry, outline));
    return mesh;
  };
  const capsule = (radius: number, length: number) => keep(new THREE.CapsuleGeometry(radius, length, 4, 12));
  const ball = (radius: number, wide = 16, high = 12) => keep(new THREE.SphereGeometry(radius, wide, high));
  /**
   * A limb segment: rounded at both ends, `top` wide at its joint (y 0) and
   * `bottom` wide `length` below. Neighbouring segments share a radius at
   * the joint between them, so a knee or an elbow is one smooth shape and
   * the outline runs round it, not across it.
   */
  const taper = (top: number, bottom: number, length: number) => {
    const points: THREE.Vector2[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / steps);
      points.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * bottom), -length + Math.sin(a) * bottom));
    }
    for (let i = 0; i <= steps; i += 1) {
      const a = (Math.PI / 2) * (i / steps);
      points.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * top), Math.sin(a) * top));
    }
    return keep(new THREE.LatheGeometry(points, 14));
  };

  // Joints: pivots that the animation turns. They keep their identity across
  // `dress`; only the meshes on them change.
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    return pivot;
  };
  // The head a little large for the body: a game character, read at a phone's size.
  const head = joint(spine, 0, 0.76);
  head.scale.setScalar(1.14);
  const shoulderL = joint(spine, 0.24, 0.44);
  const shoulderR = joint(spine, -0.24, 0.44);
  const elbowL = joint(shoulderL, 0, -0.26);
  const elbowR = joint(shoulderR, 0, -0.26);
  const hipL = joint(pelvis, 0.1, -0.02);
  const hipR = joint(pelvis, -0.1, -0.02);
  const kneeL = joint(hipL, 0, -0.38);
  const kneeR = joint(hipR, 0, -0.38);
  /** Every mesh placed by `dress`, on any joint, for clearing. */
  let worn: THREE.Object3D[] = [];
  const wear = (mesh: THREE.Object3D) => {
    worn.push(mesh);
    return mesh;
  };

  let faces: Record<FaceState, THREE.CanvasTexture> | null = null;
  let faceMaterial: THREE.MeshBasicMaterial | null = null;
  let face: FaceState = 'normal';

  function dress(look: Look) {
    for (const mesh of worn) mesh.removeFromParent();
    worn = [];
    faces && Object.values(faces).forEach((texture) => texture.dispose());
    faceMaterial?.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    geometries = [];

    const sturdy = look.body === 'fuerte';
    const w = sturdy ? 1.16 : 1;
    const limb = sturdy ? 1.12 : 1;
    const skin = lookOption('skin', look.skin).color!;
    const hairColor = lookOption('hairColor', look.hairColor).color!;
    const top = lookOption('top', look.top);
    const bottom = lookOption('bottom', look.bottom);
    const shoes = lookOption('shoes', look.shoes);
    const accessory = lookOption('accessory', look.accessory);
    const cloth = top.color!;
    const trim = top.accent!;
    const pants = bottom.color!;

    shoulderL.position.x = 0.21 * w + 0.035;
    shoulderR.position.x = -(0.21 * w + 0.035);
    hipL.position.x = 0.1 * w;
    hipR.position.x = -0.1 * w;

    // Torso: one smooth turned profile, waist to shoulders, flattened front to back.
    const profile = [
      [0.15, -0.04],
      [0.18, 0.04],
      [0.165, 0.18],
      [0.19, 0.32],
      [0.205, 0.42],
      [0.17, 0.5],
      [0.07, 0.56],
      [0.0, 0.57],
    ].map(([r, y]) => new THREE.Vector2(r!, y!));
    const torsoGeometry = keep(new THREE.LatheGeometry(profile, 20));
    const torso = shape(torsoGeometry, cloth, spine);
    torso.scale.set(w, 1, 0.74 * (sturdy ? 1.08 : 1));
    wear(torso);
    // Hips in the trousers' colour, over the bottom of the torso.
    const hips = shape(ball(0.19), pants, pelvis, [0, 0.02, 0]);
    hips.scale.set(w * 1.02, 0.62, 0.78);
    wear(hips);
    // Neck.
    wear(shape(keep(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 10)), skin, spine, [0, 0.6, 0], false));

    // Head: a slightly tall sphere, ears, a nose, and the drawn face.
    const skull = shape(ball(0.215, 24, 18), skin, head, [0, 0, 0]);
    skull.scale.set(1, 1.05, 0.98);
    wear(skull);
    for (const side of [1, -1]) wear(shape(ball(0.05, 10, 8), skin, head, [side * 0.205, 0.0, 0.0]));
    wear(shape(ball(0.022, 10, 8), new THREE.Color(skin).multiplyScalar(0.97).getHex(), head, [0, -0.04, 0.21], false));
    faces = faceTextures(look.face, hairColor);
    faceMaterial = new THREE.MeshBasicMaterial({ map: faces[face], transparent: true, depthWrite: false });
    const shell = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.2175, 28, 20, Math.PI / 2 - FACE_SHELL.phiLength / 2, FACE_SHELL.phiLength, FACE_SHELL.thetaStart, FACE_SHELL.thetaLength)),
      faceMaterial,
    );
    shell.scale.set(1, 1.05, 0.98);
    shell.renderOrder = 2;
    head.add(shell);
    wear(shell);

    // Hair.
    const hair = (geometry: THREE.BufferGeometry, at: [number, number, number], scale?: [number, number, number], rotation?: [number, number, number]) => {
      const mesh = shape(geometry, hairColor, head, at);
      if (scale) mesh.scale.set(...scale);
      if (rotation) mesh.rotation.set(...rotation);
      wear(mesh);
      return mesh;
    };
    // The cap every style starts from: covering the crown, low at the back, a fringe line above the brows.
    const capGeometry = keep(new THREE.SphereGeometry(0.232, 24, 14, 0, Math.PI * 2, 0, 1.25));
    if (look.accessory !== 'gorra' && look.accessory !== 'sombrero') hair(capGeometry, [0, 0.012, -0.005], [1.02, 1.04, 1.02], [-0.42, 0, 0]);
    else hair(capGeometry, [0, -0.01, -0.01], [1.02, 1.0, 1.02], [-0.6, 0, 0]);
    switch (look.hair) {
      case 'corto':
        hair(ball(0.09, 12, 8), [0.05, 0.17, 0.15], [1.4, 0.55, 0.9], [0.4, 0, -0.3]);
        break;
      case 'rizos':
        for (let i = 0; i < 16; i += 1) {
          const a = (i / 16) * Math.PI * 2;
          const ring = i % 2 ? 0.85 : 1.05;
          hair(ball(0.07, 10, 8), [Math.cos(a) * 0.17 * ring, 0.13 + (i % 3) * 0.035, Math.sin(a) * 0.17 * ring - 0.03]);
        }
        hair(ball(0.09, 12, 8), [0, 0.22, -0.02]);
        break;
      case 'coleta':
        hair(capsule(0.06, 0.24), [0, 0.02, -0.27], undefined, [-0.6, 0, 0]);
        hair(ball(0.07, 12, 8), [0, 0.1, -0.22]);
        break;
      case 'largo':
        hair(capsule(0.17, 0.2), [0, -0.14, -0.1], [1.15, 1.1, 0.5], [0.12, 0, 0]);
        for (const side of [1, -1]) hair(capsule(0.06, 0.2), [side * 0.18, -0.12, 0.04], undefined, [0, 0, side * 0.08]);
        break;
      case 'mono':
        hair(ball(0.1, 14, 10), [0, 0.24, -0.1]);
        break;
    }

    // Arms: sleeves in the top's colour as far as the top's sleeves go.
    const sleeves = look.top === 'tirantes' ? 0 : ['camiseta', 'guayabera'].includes(look.top) ? 1 : 2;
    for (const [shoulder, elbow] of [
      [shoulderL, elbowL],
      [shoulderR, elbowR],
    ] as const) {
      wear(shape(taper(0.074 * limb, 0.058 * limb, 0.26), sleeves > 0 ? cloth : skin, shoulder));
      if (sleeves === 1) wear(shape(keep(new THREE.CylinderGeometry(0.07 * limb, 0.068 * limb, 0.045, 14)), trim, shoulder, [0, -0.17, 0], false));
      wear(shape(taper(0.058 * limb, 0.047 * limb, 0.2), sleeves === 2 ? cloth : skin, elbow));
      if (sleeves === 2) wear(shape(keep(new THREE.CylinderGeometry(0.056 * limb, 0.056 * limb, 0.045, 12)), trim, elbow, [0, -0.19, 0], false));
      const hand = shape(ball(0.06, 12, 10), skin, elbow, [0, -0.25, 0.005]);
      hand.scale.set(0.85, 1.1, 0.95);
      wear(hand);
    }

    // Legs: trousers, or skin below the knee in shorts; shoes.
    const shorts = look.bottom === 'short';
    for (const [hip, knee] of [
      [hipL, kneeL],
      [hipR, kneeR],
    ] as const) {
      wear(shape(taper(0.095 * limb, 0.074 * limb, 0.38), pants, hip));
      if (shorts) wear(shape(keep(new THREE.CylinderGeometry(0.088 * limb, 0.086 * limb, 0.05, 14)), bottom.accent!, hip, [0, -0.29, 0], false));
      wear(shape(taper(0.074 * limb, 0.058 * limb, 0.33), shorts ? skin : pants, knee));
      if (look.bottom === 'jogger') wear(shape(keep(new THREE.CylinderGeometry(0.064 * limb, 0.062 * limb, 0.06, 12)), bottom.accent!, knee, [0, -0.31, 0], false));
      if (look.bottom === 'jeans') wear(shape(keep(new THREE.CylinderGeometry(0.066 * limb, 0.066 * limb, 0.035, 12)), bottom.accent!, knee, [0, -0.32, 0], false));
      // A shoe: a rounded capsule lying forward, a sole under it.
      const shoe = shape(capsule(0.07, 0.13), shoes.color!, knee, [0, -0.395, 0.05]);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(look.shoes === 'botas' ? 1.08 : 1, 1, look.shoes === 'botas' ? 0.95 : 0.72);
      wear(shoe);
      if (look.shoes === 'botas') wear(shape(keep(new THREE.CylinderGeometry(0.08, 0.075, 0.14, 12)), shoes.color!, knee, [0, -0.32, 0]));
      const sole = shape(keep(new THREE.BoxGeometry(0.13, 0.03, 0.27)), shoes.accent!, knee, [0, -0.445, 0.05], false);
      wear(sole);
    }

    // The top's details.
    const detail = (geometry: THREE.BufferGeometry, color: number, at: [number, number, number], rotation?: [number, number, number], line = false) => {
      const mesh = shape(geometry, color, spine, at, line);
      if (rotation) mesh.rotation.set(...rotation);
      wear(mesh);
      return mesh;
    };
    const front = 0.155 * (sturdy ? 1.08 : 1);
    switch (look.top) {
      case 'camiseta':
        detail(keep(new THREE.TorusGeometry(0.075, 0.016, 8, 18)), trim, [0, 0.55, 0.0], [Math.PI / 2, 0, 0]);
        break;
      case 'guayabera':
        // Its pleats and pockets: the shirt of a Sunday in a Central American town.
        for (const x of [-0.11, -0.07, 0.07, 0.11]) detail(keep(new THREE.BoxGeometry(0.012, 0.36, 0.01)), trim, [x * w, 0.2, front + 0.002]);
        for (const x of [-0.09, 0.09]) detail(keep(new THREE.BoxGeometry(0.07, 0.06, 0.012)), trim, [x * w, 0.06, front - 0.004]);
        detail(keep(new THREE.TorusGeometry(0.075, 0.016, 8, 18)), trim, [0, 0.55, 0], [Math.PI / 2, 0, 0]);
        break;
      case 'chaqueta':
        detail(keep(new THREE.BoxGeometry(0.018, 0.48, 0.012)), trim, [0, 0.22, front + 0.006]);
        detail(keep(new THREE.TorusGeometry(0.085, 0.03, 8, 18)), cloth, [0, 0.55, -0.005], [Math.PI / 2 - 0.15, 0, 0], true);
        break;
      case 'sudadera':
        detail(keep(new THREE.TorusGeometry(0.1, 0.05, 10, 18)), cloth, [0, 0.55, -0.04], [Math.PI / 2 - 0.5, 0, 0], true);
        detail(keep(new THREE.BoxGeometry(0.2 * w, 0.09, 0.03)), new THREE.Color(cloth).multiplyScalar(0.88).getHex(), [0, 0.08, front - 0.008]);
        for (const x of [-0.035, 0.035]) detail(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5)), trim, [x, 0.45, front + 0.02]);
        break;
      case 'camisa':
        for (let i = 0; i < 4; i += 1) detail(ball(0.012, 6, 5), trim, [0, 0.42 - i * 0.11, front + 0.006]);
        for (const side of [1, -1]) detail(keep(new THREE.BoxGeometry(0.06, 0.012, 0.07)), trim, [side * 0.05, 0.545, 0.06], [0.5, side * 0.6, side * 0.3]);
        break;
      case 'tirantes':
        detail(keep(new THREE.TorusGeometry(0.1, 0.012, 6, 18)), trim, [0, 0.53, 0.01], [Math.PI / 2 - 0.2, 0, 0]);
        break;
    }
    if (look.bottom === 'jeans') detail(keep(new THREE.TorusGeometry(0.168 * w, 0.014, 6, 24)), 0x3a2a20, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
    // The accessory.
    const on = (geometry: THREE.BufferGeometry, color: number, parent: THREE.Object3D, at: [number, number, number], rotation?: [number, number, number], line = true) => {
      const mesh = shape(geometry, color, parent, at, line);
      if (rotation) mesh.rotation.set(...rotation);
      wear(mesh);
      return mesh;
    };
    switch (look.accessory) {
      case 'gorra':
        on(keep(new THREE.SphereGeometry(0.238, 24, 12, 0, Math.PI * 2, 0, 1.3)), accessory.color!, head, [0, 0.02, 0], [-0.25, 0, 0]);
        on(keep(new THREE.CylinderGeometry(0.15, 0.15, 0.018, 20, 1, false, -Math.PI / 2 - 1, 2)), accessory.color!, head, [0, 0.1, 0.17], [0.2, 0, 0]);
        on(ball(0.022, 8, 6), accessory.accent!, head, [0, 0.25, -0.02], undefined, false);
        break;
      case 'lentes':
        for (const side of [1, -1]) on(keep(new THREE.CylinderGeometry(0.056, 0.056, 0.015, 18)), accessory.color!, head, [side * 0.085, 0.0, 0.215], [Math.PI / 2, 0, 0]);
        on(keep(new THREE.BoxGeometry(0.06, 0.012, 0.012)), accessory.color!, head, [0, 0.015, 0.228], undefined, false);
        break;
      case 'sombrero':
        on(keep(new THREE.CylinderGeometry(0.36, 0.37, 0.022, 28)), accessory.color!, head, [0, 0.14, 0], [-0.08, 0, 0]);
        on(keep(new THREE.CylinderGeometry(0.17, 0.2, 0.17, 22)), accessory.color!, head, [0, 0.23, -0.01], [-0.08, 0, 0]);
        on(keep(new THREE.CylinderGeometry(0.202, 0.202, 0.04, 22)), accessory.accent!, head, [0, 0.17, -0.005], [-0.08, 0, 0], false);
        break;
      case 'mochila': {
        const pack = on(capsule(0.13, 0.12), accessory.color!, spine, [0, 0.3, -0.2]);
        pack.scale.set(1.15 * w, 1, 0.65);
        on(keep(new THREE.BoxGeometry(0.16 * w, 0.08, 0.04)), accessory.accent!, spine, [0, 0.2, -0.29], undefined, false);
        for (const side of [1, -1]) on(keep(new THREE.BoxGeometry(0.035, 0.42, 0.02)), accessory.accent!, spine, [side * 0.1 * w, 0.3, front - 0.01], [0.08, 0, 0], false);
        break;
      }
    }
  }

  dress(initial);

  // --- Animation ---------------------------------------------------------------------
  /** Where each angle is now; every frame it eases toward where it should be. */
  const now: Record<string, number> = {};
  const ease = (key: string, target: number, rate: number, dt: number) => {
    const current = now[key] ?? target;
    const value = current + (target - current) * (1 - Math.exp(-rate * dt));
    now[key] = value;
    return value;
  };
  let clock = 0;
  let stride = 0;
  let wasAir = false;
  let land = 0;
  let blinkIn = 2 + Math.random() * 3;
  let emoteTime = 0;
  let lastEmote: Emote | null = null;

  const setFace = (next: FaceState) => {
    if (next === face || !faces || !faceMaterial) return;
    face = next;
    faceMaterial.map = faces[next];
    faceMaterial.needsUpdate = true;
  };

  function update(dt: number, state: MotionState = STILL) {
    clock += dt;
    const speed = Math.min(1, Math.max(0, state.speed));
    // Strides come faster as the run gets faster, and the phase only moves with the feet.
    stride += dt * (6 + speed * 7.5) * Math.min(1, speed * 4);
    if (wasAir && !state.air) land = 1;
    wasAir = state.air;
    land = Math.max(0, land - dt * 4.5);
    if (state.emote !== lastEmote) emoteTime = 0;
    lastEmote = state.emote;
    emoteTime += dt;

    // Pose targets.
    let lean = 0;
    let bob = 0;
    let yaw = 0;
    let headX = 0;
    let headY = 0;
    let armLX = 0, armLZ = 0.12, armRX = 0, armRZ = -0.12, elbowLX = -0.25, elbowRX = -0.25;
    let legLX = 0, legRX = 0, legLZ = 0, legRZ = 0, kneeLX = 0.05, kneeRX = 0.05;
    let pelvisRoll = 0;
    let rate = 14;

    if (state.cheer > 0) {
      const t = clock * 7;
      bob = Math.abs(Math.sin(t * 0.85)) * 0.2 * state.cheer;
      armLX = -2.9;
      armRX = -2.9;
      armLZ = 0.35 + Math.sin(t) * 0.25;
      armRZ = -0.35 - Math.sin(t) * 0.25;
      elbowLX = elbowRX = -0.2;
      kneeLX = kneeRX = 0.3 * (1 - bob * 4);
      yaw = Math.sin(clock * 2.6) * 0.5;
      rate = 12;
    } else if (state.air) {
      if (state.vy > 1) {
        // Rising: one knee up, arms forward and up.
        legLX = -1.0;
        kneeLX = 1.3;
        legRX = 0.35;
        kneeRX = 0.4;
        armLX = -2.3;
        armRX = -1.3;
        armLZ = 0.3;
        armRZ = -0.3;
        elbowLX = elbowRX = -0.5;
        lean = 0.1;
      } else {
        // Falling: arms out for balance, legs reaching for the ground.
        legLX = -0.45;
        kneeLX = 0.6;
        legRX = -0.1;
        kneeRX = 0.25;
        armLX = -1.1;
        armRX = -1.1;
        armLZ = 0.9;
        armRZ = -0.9;
        elbowLX = elbowRX = -0.3;
        lean = -0.05;
      }
      rate = 16;
    } else if (speed > 0.02) {
      // Walk and run: thighs and arms swing opposite; the back knee folds; a lean and a bob.
      const s = Math.sin(stride);
      const c = Math.cos(stride);
      const run = Math.min(1, speed * 1.3);
      legLX = s * (0.45 + 0.5 * run);
      legRX = -s * (0.45 + 0.5 * run);
      kneeLX = Math.max(0, -c) * (0.4 + 1.1 * run) + 0.08;
      kneeRX = Math.max(0, c) * (0.4 + 1.1 * run) + 0.08;
      armLX = -s * (0.35 + 0.65 * run);
      armRX = s * (0.35 + 0.65 * run);
      elbowLX = elbowRX = -(0.35 + 1.05 * run);
      armLZ = 0.1;
      armRZ = -0.1;
      lean = 0.06 + 0.18 * run;
      bob = Math.abs(c) * (0.025 + 0.05 * run);
      yaw = s * 0.12 * run;
      headX = -lean * 0.6;
      rate = 20;
    } else if (state.emote === 'saludo' && emoteTime < 2.4) {
      armLX = -0.3;
      armLZ = 2.6 + Math.sin(emoteTime * 11) * 0.35;
      elbowLX = -0.4;
      headY = 0.15;
      headX = -0.08;
    } else if (state.emote === 'baile' && emoteTime < 3.6) {
      const t = emoteTime * 6.5;
      pelvisRoll = Math.sin(t) * 0.14;
      yaw = Math.sin(t * 0.5) * 0.4;
      armLX = -1.6 + Math.sin(t) * 1.2;
      armRX = -1.6 - Math.sin(t) * 1.2;
      armLZ = 0.4;
      armRZ = -0.4;
      elbowLX = elbowRX = -1.2;
      kneeLX = 0.25 + Math.max(0, Math.sin(t)) * 0.35;
      kneeRX = 0.25 + Math.max(0, -Math.sin(t)) * 0.35;
      legLX = -kneeLX * 0.5;
      legRX = -kneeRX * 0.5;
      bob = -Math.abs(Math.sin(t)) * 0.05;
      headY = Math.sin(t) * 0.2;
    } else {
      // Idle: breathing, a slow shift of weight, a glance now and then.
      const breathe = Math.sin(clock * 2.1);
      armLZ = 0.12 + breathe * 0.02;
      armRZ = -0.12 - breathe * 0.02;
      pelvisRoll = Math.sin(clock * 0.7) * 0.035;
      headY = Math.sin(clock * 0.45) * 0.25 * Math.max(0, Math.sin(clock * 0.21));
      headX = Math.sin(clock * 0.9) * 0.03;
      bob = breathe * 0.006;
      rate = 8;
    }
    // Landing: the knees take it.
    if (land > 0 && !state.air) {
      bob -= land * 0.1;
      kneeLX += land * 0.7;
      kneeRX += land * 0.7;
      legLX -= land * 0.35;
      legRX -= land * 0.35;
      lean += land * 0.15;
    }

    root.position.y = ease('bob', bob, rate * 1.5, dt);
    spine.rotation.x = ease('lean', lean, rate, dt);
    spine.rotation.y = ease('yaw', yaw, rate, dt);
    pelvis.rotation.z = ease('roll', pelvisRoll, rate, dt);
    spine.rotation.z = -pelvis.rotation.z * 0.6;
    head.rotation.x = ease('headX', headX, 10, dt);
    head.rotation.y = ease('headY', headY, 6, dt);
    // Arm angles: x swings forward and back (negative is forward), z raises sideways.
    shoulderL.rotation.x = ease('aLX', armLX, rate, dt);
    shoulderL.rotation.z = ease('aLZ', armLZ, rate, dt);
    shoulderR.rotation.x = ease('aRX', armRX, rate, dt);
    shoulderR.rotation.z = ease('aRZ', armRZ, rate, dt);
    elbowL.rotation.x = ease('eL', elbowLX, rate, dt);
    elbowR.rotation.x = ease('eR', elbowRX, rate, dt);
    hipL.rotation.x = ease('lLX', legLX, rate, dt);
    hipR.rotation.x = ease('lRX', legRX, rate, dt);
    hipL.rotation.z = ease('lLZ', legLZ, rate, dt);
    hipR.rotation.z = ease('lRZ', legRZ, rate, dt);
    kneeL.rotation.x = ease('kL', kneeLX, rate, dt);
    kneeR.rotation.x = ease('kR', kneeRX, rate, dt);

    // The face: a blink every few seconds, a grin for a cheer or a dance.
    blinkIn -= dt;
    if (state.cheer > 0 || (state.emote === 'baile' && emoteTime < 3.6)) setFace('happy');
    else if (blinkIn < 0) {
      setFace('blink');
      if (blinkIn < -0.12) blinkIn = 2 + Math.random() * 3.5;
    } else setFace('normal');
  }

  update(1, STILL);

  return {
    group,
    update,
    dress,
    dispose() {
      faces && Object.values(faces).forEach((texture) => texture.dispose());
      faceMaterial?.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      outline.dispose();
    },
  };
}
