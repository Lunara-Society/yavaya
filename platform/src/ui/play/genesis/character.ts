import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GENESIS_ASSETS_VERSION, genesisInfluences } from '@/config/genesis';
import { genesisFromLook, type GenesisLook } from '@/config/genesis-looks';
import type { Look } from '@/config/play-looks';
import type { Character, MotionState } from '../character/types';
import { createPoser, type Pose } from '../character/pose';

/**
 * A Yavaya Genesis character (docs/GENESIS.md): the anatomical body, its
 * fitted parts and clothes, posed by the shared moves
 * (character/pose.ts), behind the `Character` interface every game uses
 * (character/types.ts).
 *
 * The files load on demand and are shared by every character on the page
 * (core.glb once; a hairstyle, garment or pair of shoes only when someone
 * wears it). Each character has its own bones, materials and body triangle
 * list; the heavy vertex and morph data is shared.
 *
 * Its group is empty until the core file has loaded; `ready` settles then.
 */

const ROOT = `/play/genesis/v${GENESIS_ASSETS_VERSION}`;
/** Genesis is built at 1.67 m; the game's body is drawn a little smaller, the size the courses were built for. */
const DRAWN = 0.96;
/** Where a roll or an air-dodge turns the body: about the hips. */
const PIVOT = 0.9;

let loader: GLTFLoader | null = null;
const files = new Map<string, Promise<GLTF>>();
function load(name: string): Promise<GLTF> {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  let file = files.get(name);
  if (!file) {
    file = loader.loadAsync(`${ROOT}/${name}`);
    // A failed load may be retried by the next character instead of failing forever.
    file.catch(() => files.delete(name));
    files.set(name, file);
  }
  return file;
}

/** Bone names as three.js stores them (GLTFLoader drops "." from node names). */
const key = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

type Extras = { bones: string[]; jointDeltas: Record<string, Record<string, number[]>>; detailMean: number };

function skinnedMeshes(gltf: GLTF): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

/** The limbs the moves turn, with the bones that start and end each segment (for the rest-pose correction). */
const LIMBS = {
  upperArmL: ['upperarm01.L', 'lowerarm01.L'],
  lowerArmL: ['lowerarm01.L', 'wrist.L'],
  upperArmR: ['upperarm01.R', 'lowerarm01.R'],
  lowerArmR: ['lowerarm01.R', 'wrist.R'],
  upperLegL: ['upperleg01.L', 'lowerleg01.L'],
  lowerLegL: ['lowerleg01.L', 'foot.L'],
  upperLegR: ['upperleg01.R', 'lowerleg01.R'],
  lowerLegR: ['lowerleg01.R', 'foot.R'],
} as const;
type Limb = keyof typeof LIMBS;

const DOWN = new THREE.Vector3(0, -1, 0);
const euler = new THREE.Euler();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qx = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);

export function buildGenesisCharacter(initial: Look): Character {
  const group = new THREE.Group();
  group.scale.setScalar(DRAWN);
  const tumble = new THREE.Group();
  tumble.position.y = PIVOT;
  group.add(tumble);
  const holder = new THREE.Group();
  holder.position.y = -PIVOT;
  tumble.add(holder);

  const poser = createPoser();
  let wanted: GenesisLook = genesisFromLook(initial);
  let disposed = false;
  let ground = 0;

  // Filled once the core file has loaded.
  let extras: Extras | null = null;
  let skeleton: THREE.Skeleton | null = null;
  const bones = new Map<string, THREE.Bone>();
  /** Each bone's rest position in the character's own space for the neutral shape, and its parent's name. */
  const restNeutral = new Map<string, THREE.Vector3>();
  const parentOf = new Map<string, string | null>();
  const rest = new Map<string, THREE.Vector3>();
  /** Per limb segment: the turn that brings it from the rest pose (arms out, an A) to hanging straight down. */
  const correction = new Map<Limb, THREE.Quaternion>();
  const core: THREE.SkinnedMesh[] = [];
  let body: THREE.SkinnedMesh | null = null;
  let bodyIndex: ArrayLike<number> | null = null;
  const worn = new Map<'hair' | 'top' | 'bottom' | 'shoes', { file: string; mesh: THREE.SkinnedMesh; maskBit: number | null }>();
  const owned: THREE.Material[] = [];
  let generation = 0;

  /**
   * Each mesh's stored-to-real transform. The files keep vertices as small
   * integers (KHR_mesh_quantization); for a skinned mesh the scale and offset
   * that turn them back into metres live in its inverse bind matrices, one per
   * mesh. Whenever the bones are rebound for a new shape, that transform has
   * to stay in (bind = rest⁻¹ × dequantize), or the mesh comes out at the
   * wrong size and place.
   */
  const dequantize = new Map<THREE.SkinnedMesh, THREE.Matrix4>();

  /** A mesh of this character drawing shared data with its own material, bound to its own bones. */
  function own(source: THREE.SkinnedMesh, geometry: THREE.BufferGeometry = source.geometry): THREE.SkinnedMesh {
    const material = (source.material as THREE.MeshStandardMaterial).clone();
    owned.push(material);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = source.name;
    mesh.morphTargetDictionary = { ...(source.morphTargetDictionary ?? {}) };
    mesh.morphTargetInfluences = new Array(Object.keys(mesh.morphTargetDictionary).length).fill(0);
    mesh.castShadow = true;
    mesh.frustumCulled = false; // a skinned, morphed body's bounds move with it; never cull the player
    // The file's root inverse bind matrix is (root at rest)⁻¹ × dequantize: take the rest back out.
    const rootRest = restNeutral.get(skeleton!.bones[0]!.name)!;
    dequantize.set(mesh, new THREE.Matrix4().makeTranslation(rootRest).multiply(source.skeleton.boneInverses[0]!));
    // Its own skeleton object (its own bind matrices) over this character's shared bones.
    mesh.bind(new THREE.Skeleton(skeleton!.bones, skeleton!.bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
    rebind(mesh);
    return mesh;
  }

  /** Binds a mesh at the bones' current rest positions (see `dequantize`). */
  function rebind(mesh: THREE.SkinnedMesh) {
    const d = dequantize.get(mesh)!;
    mesh.skeleton.boneInverses = mesh.skeleton.bones.map((bone) => new THREE.Matrix4().makeTranslation((rest.get(bone.name) ?? restNeutral.get(bone.name)!).clone().negate()).multiply(d));
  }

  async function start() {
    const gltf = await load('core.glb');
    if (disposed) return;
    extras = (gltf.userData as { genesis: Extras }).genesis;
    const sources = skinnedMeshes(gltf);
    // Our own copy of the bones: a fresh hierarchy cloned from the file's.
    const sourceSkeleton = sources[0]!.skeleton;
    const rootBone = sourceSkeleton.bones[0]!.clone(true) as THREE.Bone;
    rootBone.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    });
    skeleton = new THREE.Skeleton(sourceSkeleton.bones.map((b) => bones.get(b.name)!));
    holder.add(rootBone);
    for (const name of extras.bones) {
      const bone = bones.get(key(name))!;
      const parent = bone.parent && (bone.parent as THREE.Bone).isBone ? bone.parent.name : null;
      parentOf.set(bone.name, parent);
      const position = bone.position.clone();
      if (parent) position.add(restNeutral.get(parent)!);
      restNeutral.set(bone.name, position);
    }
    for (const source of sources) {
      let geometry = source.geometry;
      if (source.name === 'body') {
        // Its own triangle list (garments hide the skin under them); the vertex data stays shared.
        geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(source.geometry.attributes)) geometry.setAttribute(name, attribute);
        geometry.morphAttributes = source.geometry.morphAttributes;
        geometry.morphTargetsRelative = source.geometry.morphTargetsRelative;
        bodyIndex = source.geometry.index!.array;
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bodyIndex), 1));
      }
      const mesh = own(source, geometry);
      if (source.name === 'body') body = mesh;
      if (source.name === 'eyes') (mesh.material as THREE.Material).depthWrite = true;
      core.push(mesh);
      holder.add(mesh);
    }
    await apply(wanted);
  }

  /** Puts a file's garment, hair or shoes in a slot (or empties it). */
  async function wear(slot: 'hair' | 'top' | 'bottom' | 'shoes', file: string | null, mine: number) {
    const current = worn.get(slot);
    if (current?.file === file) return;
    if (current) {
      current.mesh.removeFromParent();
      worn.delete(slot);
    }
    if (!file) return;
    const gltf = await load(file);
    if (disposed || mine !== generation) return;
    const source = skinnedMeshes(gltf)[0]!;
    const mesh = own(source);
    const maskBit = (source.userData as { maskBit?: number }).maskBit ?? null;
    worn.set(slot, { file, mesh, maskBit });
    holder.add(mesh);
  }

  /**
   * The body's triangles minus the skin under what is worn: each body vertex
   * carries flags of what covers it (`_garments`, GENESIS_MASK_BITS), and a
   * triangle goes when all three corners are covered, so the skin can never
   * show through a garment or a shoe.
   */
  function maskBody() {
    if (!body || !bodyIndex) return;
    const flags = body.geometry.getAttribute('_garments');
    let mask = 0;
    for (const { maskBit } of worn.values()) if (maskBit !== null) mask |= 1 << maskBit;
    const covered = (v: number) => flags && (flags.getX(v) & mask) !== 0;
    const out = new Uint32Array(bodyIndex.length);
    let at = 0;
    for (let t = 0; t < bodyIndex.length; t += 3) {
      const a = bodyIndex[t]!, b = bodyIndex[t + 1]!, c = bodyIndex[t + 2]!;
      if (mask && covered(a) && covered(b) && covered(c)) continue;
      out[at] = a;
      out[at + 1] = b;
      out[at + 2] = c;
      at += 3;
    }
    body.geometry.setIndex(new THREE.BufferAttribute(out.subarray(0, at), 1));
  }

  function meshes(): THREE.SkinnedMesh[] {
    return [...core, ...[...worn.values()].map((w) => w.mesh)];
  }

  /**
   * The shape: every mesh's morphs, then the bones moved to where the
   * shaped body's joints are, and bound there, so a move turns about the
   * right shoulder or knee for this body. The soles stay on the ground.
   */
  function shape(controls: Record<string, number>) {
    if (!extras || !skeleton) return;
    const influences = genesisInfluences(controls);
    for (const mesh of meshes()) {
      const dictionary = mesh.morphTargetDictionary!;
      mesh.morphTargetInfluences!.fill(0);
      for (const [name, value] of Object.entries(influences)) {
        const index = dictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences![index] = value;
      }
    }
    ground = 0;
    for (const [name, value] of Object.entries(influences)) ground += value * (extras.jointDeltas[name]?.ground?.[1] ?? 0);
    for (const name of extras.bones) {
      const k = key(name);
      const position = restNeutral.get(k)!.clone();
      for (const [morph, value] of Object.entries(influences)) {
        const delta = value ? extras.jointDeltas[morph]?.[name] : undefined;
        if (delta) position.add(new THREE.Vector3(delta[0], delta[1], delta[2]).multiplyScalar(value));
      }
      rest.set(k, position);
    }
    for (const [name, bone] of bones) {
      const parent = parentOf.get(name);
      bone.position.copy(rest.get(name)!);
      if (parent) bone.position.sub(rest.get(parent)!);
    }
    // Bound unturned at these positions: the inverse of each bone's rest place, in the character's own space.
    for (const mesh of meshes()) rebind(mesh);
    for (const [limb, [from, to]] of Object.entries(LIMBS) as Array<[Limb, readonly [string, string]]>) {
      const direction = rest.get(key(to))!.clone().sub(rest.get(key(from))!).normalize();
      correction.set(limb, new THREE.Quaternion().setFromUnitVectors(direction, DOWN));
    }
  }

  function colour(material: THREE.Material, hex: number, detail = false) {
    const m = material as THREE.MeshStandardMaterial;
    m.color.setHex(hex);
    // Skin and hair textures are shading only, averaging `detailMean`: lift the colour so the average is the colour asked for.
    if (detail && extras) m.color.multiplyScalar(1 / extras.detailMean);
  }

  async function apply(look: GenesisLook) {
    const mine = ++generation;
    await Promise.all([
      wear('hair', look.hair ? `hair-${look.hair}.glb` : null, mine),
      wear('top', `garment-${look.top.garment}.glb`, mine),
      wear('bottom', `garment-${look.bottom.garment}.glb`, mine),
      wear('shoes', `shoes-${look.shoes.id}.glb`, mine),
    ]);
    if (disposed || mine !== generation) return;
    maskBody();
    for (const mesh of core) if (mesh.name === 'body') colour(mesh.material as THREE.Material, look.skin, true);
    const hair = worn.get('hair');
    if (hair) colour(hair.mesh.material as THREE.Material, look.hairColor, true);
    const top = worn.get('top');
    if (top) colour(top.mesh.material as THREE.Material, look.top.color);
    const bottom = worn.get('bottom');
    if (bottom) colour(bottom.mesh.material as THREE.Material, look.bottom.color);
    const shoes = worn.get('shoes');
    if (shoes) colour(shoes.mesh.material as THREE.Material, look.shoes.color);
    shape(look.controls);
    pose(last);
  }

  let last: Pose = poser(0);

  /** The moves (character/pose.ts), turned onto the bones. */
  function pose(p: Pose) {
    // Until the first shape is in (its files still loading), there is nothing to pose yet.
    if (!skeleton || correction.size === 0) return;
    tumble.rotation.x = p.tumbleX;
    tumble.rotation.y = p.tumbleY;
    holder.position.y = -PIVOT - ground + p.bob;
    const set = (name: string, x: number, y: number, z: number) => bones.get(key(name))?.quaternion.setFromEuler(euler.set(x, y, z));
    set('root', 0, 0, p.pelvisZ);
    // The lean is shared along the spine, so the back bends instead of folding at one joint.
    for (const name of ['spine05', 'spine03', 'spine01']) set(name, p.spineX / 3, p.spineY / 3, p.spineZ / 3);
    set('neck01', p.headX * 0.35, p.headY * 0.35, 0);
    set('head', p.headX * 0.65, p.headY * 0.65, 0);
    /*
     * A limb: its upper segment turned by the pose's angles (x swings, z
     * raises) from hanging straight down; its lower segment bent about x,
     * as an elbow or knee bends. The rest pose has the
     * arms out (an A), so each segment first turns down by its correction.
     */
    const limb = (upper: Limb, lower: Limb, upperBone: string, lowerBone: string, swing: number, raise: number, bend: number) => {
      const cu = correction.get(upper)!;
      const cl = correction.get(lower)!;
      qa.setFromEuler(euler.set(swing, 0, raise)).multiply(cu);
      bones.get(key(upperBone))?.quaternion.copy(qa);
      qb.copy(cu).invert().multiply(qx(bend)).multiply(cl);
      bones.get(key(lowerBone))?.quaternion.copy(qb);
    };
    limb('upperArmL', 'lowerArmL', 'upperarm01.L', 'lowerarm01.L', p.armLX, p.armLZ, p.elbowL);
    limb('upperArmR', 'lowerArmR', 'upperarm01.R', 'lowerarm01.R', p.armRX, p.armRZ, p.elbowR);
    limb('upperLegL', 'lowerLegL', 'upperleg01.L', 'lowerleg01.L', p.legLX, p.legLZ, p.kneeL);
    limb('upperLegR', 'lowerLegR', 'upperleg01.R', 'lowerleg01.R', p.legRX, p.legRZ, p.kneeR);
    // A blink: the upper lids come down over the eyes.
    const blink = p.face === 'blink' ? 1 : 0;
    for (const side of ['L', 'R']) set(`orbicularis03.${side}`, blink * 0.45, 0, 0);
  }

  const ready = start();

  return {
    group,
    ready,
    update(dt: number, state?: MotionState) {
      last = poser(dt, state);
      pose(last);
    },
    dress(look: Look) {
      wanted = genesisFromLook(look);
      if (extras) void apply(wanted);
    },
    dispose() {
      disposed = true;
      owned.forEach((material) => material.dispose());
      for (const mesh of meshes()) if (mesh === body) mesh.geometry.dispose();
      group.clear();
    },
  };
}
