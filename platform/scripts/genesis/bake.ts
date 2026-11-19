/**
 * Bakes Yavaya Genesis's character files (docs/GENESIS.md) from MakeHuman's
 * CC0 data: one anatomical adult body with its shape controls as morph
 * targets, a skeleton whose joints follow the body's shape, and every part
 * that fits it (eyes, brows, lashes, teeth, tongue, hairstyles, garments),
 * each carrying the same morph targets so it follows every shape exactly.
 *
 * usage: npx tsx scripts/genesis/source.ts   (once: fetch the pinned data)
 *        npx tsx scripts/genesis/bake.ts     (writes public/play/genesis/v<n>/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, type Material, type Node as GltfNode, type Scene, type Skin } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { GENESIS_ASSETS_VERSION, GENESIS_GARMENTS, GENESIS_HAIR, GENESIS_MASK_BITS, GENESIS_SHOES, genesisMorphNames, type GenesisGarment } from '../../src/config/genesis';
import { fit, readFitted, readMaterial, readObj, readSkeleton, readTarget, readWeights, type Corner, type Fitted, type Obj } from './mhdata';
import { assetsDir, dataDir, SOURCE, verifySource } from './source';

verifySource();
const DATA = dataDir();
const ASSETS = assetsDir();
const OUT = join(process.cwd(), 'public', 'play', 'genesis', `v${GENESIS_ASSETS_VERSION}`);
mkdirSync(OUT, { recursive: true });
/** MakeHuman works in decimetres; Yavaya in metres. */
const SCALE = 0.1;

// --- The body and its shapes ------------------------------------------------------------

const base = readObj(join(DATA, '3dobjs', 'base.obj'));
const N = base.positions.length / 3;
const target = (rel: string) => readTarget(join(DATA, 'targets', `${rel}.target`), N);
const add = (...arrays: Float64Array[]) => {
  const out = new Float64Array(arrays[0]!.length);
  for (const a of arrays) for (let i = 0; i < out.length; i += 1) out[i]! += a[i]!;
  return out;
};
const mul = (k: number, a: Float64Array) => a.map((v) => v * k);
const sub = (a: Float64Array, b: Float64Array) => a.map((v, i) => v - b[i]!);

/*
 * The neutral adult is MakeHuman's own default: 25 years old, half way
 * between its female and male, average muscle and weight. Every control is a
 * morph away from it.
 */
const universal = (gender: 'female' | 'male', muscle = 'average', weight = 'average') => target(`macrodetails/universal-${gender}-young-${muscle}muscle-${weight}weight`);
const F = universal('female');
const M = universal('male');
const mid = add(mul(0.5, F), mul(0.5, M));
const neutral = add(base.positions, mid);

const morphs = new Map<string, Float64Array>();
morphs.set('body.gender-', mul(0.5, sub(F, M)));
morphs.set('body.gender+', mul(0.5, sub(M, F)));
morphs.set('body.muscle-', sub(add(mul(0.5, universal('female', 'min')), mul(0.5, universal('male', 'min'))), mid));
morphs.set('body.muscle+', sub(add(mul(0.5, universal('female', 'max')), mul(0.5, universal('male', 'max'))), mid));
morphs.set('body.weight-', sub(add(mul(0.5, universal('female', 'average', 'min')), mul(0.5, universal('male', 'average', 'min'))), mid));
morphs.set('body.weight+', sub(add(mul(0.5, universal('female', 'average', 'max')), mul(0.5, universal('male', 'average', 'max'))), mid));
const height = (h: 'min' | 'max') => add(mul(0.5, target(`macrodetails/height/female-young-averagemuscle-averageweight-${h}height`)), mul(0.5, target(`macrodetails/height/male-young-averagemuscle-averageweight-${h}height`)));
morphs.set('body.height-', height('min'));
morphs.set('body.height+', height('max'));

const PAIRS: Record<string, [string, string]> = {
  'head.width': ['head/head-scale-horiz-decr', 'head/head-scale-horiz-incr'],
  'head.length': ['head/head-scale-vert-decr', 'head/head-scale-vert-incr'],
  'forehead.height': ['forehead/forehead-scale-vert-decr', 'forehead/forehead-scale-vert-incr'],
  'temple.width': ['forehead/forehead-temple-decr', 'forehead/forehead-temple-incr'],
  'nose.length': ['nose/nose-scale-vert-decr', 'nose/nose-scale-vert-incr'],
  'nose.width': ['nose/nose-scale-horiz-decr', 'nose/nose-scale-horiz-incr'],
  'nose.bridge': ['nose/nose-hump-decr', 'nose/nose-hump-incr'],
  'nose.tip': ['nose/nose-point-down', 'nose/nose-point-up'],
  'nose.nostrils': ['nose/nose-nostrils-width-decr', 'nose/nose-nostrils-width-incr'],
  'mouth.width': ['mouth/mouth-scale-horiz-decr', 'mouth/mouth-scale-horiz-incr'],
  'lip.upper': ['mouth/mouth-upperlip-volume-decr', 'mouth/mouth-upperlip-volume-incr'],
  'lip.lower': ['mouth/mouth-lowerlip-volume-decr', 'mouth/mouth-lowerlip-volume-incr'],
  'chin.width': ['chin/chin-width-decr', 'chin/chin-width-incr'],
  'chin.length': ['chin/chin-height-decr', 'chin/chin-height-incr'],
  'chin.projection': ['chin/chin-prominent-decr', 'chin/chin-prominent-incr'],
  'jaw.definition': ['chin/chin-bones-decr', 'chin/chin-bones-incr'],
};
/** Left and right targets, applied together so the face stays symmetrical. */
const SIDED: Record<string, [string, string]> = {
  'eye.size': ['eyes/{s}-eye-scale-decr', 'eyes/{s}-eye-scale-incr'],
  'eye.spacing': ['eyes/{s}-eye-trans-in', 'eyes/{s}-eye-trans-out'],
  'eye.angle': ['eyes/{s}-eye-eyefold-angle-down', 'eyes/{s}-eye-eyefold-angle-up'],
  'cheek.bones': ['cheek/{s}-cheek-bones-decr', 'cheek/{s}-cheek-bones-incr'],
  'cheek.height': ['cheek/{s}-cheek-trans-down', 'cheek/{s}-cheek-trans-up'],
  'cheek.fullness': ['cheek/{s}-cheek-volume-decr', 'cheek/{s}-cheek-volume-incr'],
};
for (const [id, [lo, hi]] of Object.entries(PAIRS)) {
  morphs.set(`${id}-`, target(lo));
  morphs.set(`${id}+`, target(hi));
}
for (const [id, [lo, hi]] of Object.entries(SIDED)) {
  morphs.set(`${id}-`, add(target(lo.replace('{s}', 'l')), target(lo.replace('{s}', 'r'))));
  morphs.set(`${id}+`, add(target(hi.replace('{s}', 'l')), target(hi.replace('{s}', 'r'))));
}
for (const shape of ['oval', 'round', 'square', 'invertedtriangular']) morphs.set(`head.${shape}`, target(`head/head-${shape}`));

const NAMES = genesisMorphNames();
for (const name of NAMES) if (!morphs.has(name)) throw new Error(`no source for control morph ${name}`);

// --- The skeleton -------------------------------------------------------------------------

const skeleton = readSkeleton(join(DATA, 'rigs', 'default.mhskel'));
const rawWeights = readWeights(join(DATA, 'rigs', 'default_weights.mhw'));
/*
 * A game skeleton: the bones the moves and the face need. Every other bone's
 * weights go to its nearest kept ancestor (fingers to the wrist, the many
 * face bones to the head), so nothing is left unweighted.
 */
const KEEP = [
  'root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head', 'jaw',
  'eye.L', 'eye.R', 'orbicularis03.L', 'orbicularis03.R', 'orbicularis04.L', 'orbicularis04.R',
  'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'upperarm01.L', 'upperarm01.R', 'upperarm02.L', 'upperarm02.R',
  'lowerarm01.L', 'lowerarm01.R', 'lowerarm02.L', 'lowerarm02.R', 'wrist.L', 'wrist.R',
  'pelvis.L', 'pelvis.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R',
  'lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R', 'foot.L', 'foot.R', 'toe1-1.L', 'toe1-1.R',
].filter((name) => name in skeleton.bones);
const KEPT = new Set(KEEP);
const keptAncestor = (name: string | null): string | null => {
  let current = name;
  while (current && !KEPT.has(current)) current = skeleton.bones[current]?.parent ?? null;
  return current;
};
const BONE_PARENT = KEEP.map((name) => keptAncestor(skeleton.bones[name]!.parent));
const jointOf = (positions: Float64Array, joint: string) => {
  const verts = skeleton.joints[joint];
  if (!verts?.length) throw new Error(`joint ${joint} has no vertices`);
  const p = [0, 0, 0];
  for (const v of verts) for (let k = 0; k < 3; k += 1) p[k]! += positions[v * 3 + k]!;
  return p.map((x) => x / verts.length);
};
/** Where the feet stand: the lowest point of the neutral body, so the character's origin is on the ground. */
let ground = Infinity;
const bodyVerts = new Set<number>();
base.faces.forEach((face, i) => {
  if (base.groups[i] === 'body') for (const [v] of face) bodyVerts.add(v);
});
for (const v of bodyVerts) ground = Math.min(ground, neutral[v * 3 + 1]!);
const toWorld = (p: number[]) => [p[0]! * SCALE, (p[1]! - ground) * SCALE, p[2]! * SCALE];
const BONE_HEAD = KEEP.map((name) => toWorld(jointOf(neutral, skeleton.bones[name]!.head)));

/** Per base vertex, its weight per kept bone. */
const vertexSkin: Array<Map<number, number>> = Array.from({ length: N }, () => new Map());
for (const [bone, pairs] of Object.entries(rawWeights)) {
  const kept = keptAncestor(bone);
  if (!kept) continue;
  const index = KEEP.indexOf(kept);
  for (const [v, w] of pairs) {
    const map = vertexSkin[v]!;
    map.set(index, (map.get(index) ?? 0) + w);
  }
}

/** The four strongest bones of a weight map, normalised. */
function topFour(weights: Map<number, number>): [number[], number[]] {
  const sorted = [...weights.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!sorted.length) sorted.push([KEEP.indexOf('root'), 1]);
  const total = sorted.reduce((s, [, w]) => s + w, 0);
  const joints = [0, 0, 0, 0];
  const weights4 = [0, 0, 0, 0];
  sorted.forEach(([j, w], k) => {
    joints[k] = j;
    weights4[k] = w / total;
  });
  return [joints, weights4];
}

/** A fitted asset's skin: each of its vertices takes its three anchor vertices' weights, blended as it is placed. */
function fittedSkin(asset: Fitted): Array<Map<number, number>> {
  const count = asset.refs.length / 3;
  const out: Array<Map<number, number>> = [];
  for (let i = 0; i < count; i += 1) {
    const map = new Map<number, number>();
    for (let r = 0; r < 3; r += 1) {
      const w = Math.max(0, asset.weights[i * 3 + r]!);
      if (!w) continue;
      for (const [bone, bw] of vertexSkin[asset.refs[i * 3 + r]!]!) map.set(bone, (map.get(bone) ?? 0) + w * bw);
    }
    out.push(map);
  }
  return out;
}

// --- Geometry -------------------------------------------------------------------------------

type Part = {
  name: string;
  /** Where its vertices are on a body whose base vertices are at `body`. */
  positionsOf: (body: Float64Array) => Float64Array;
  faces: Corner[][];
  uvs: Float64Array;
  skin: Array<Map<number, number>>;
};

function vertexNormals(pos: Float64Array, tris: number[][]): Float64Array {
  const out = new Float64Array(pos.length);
  for (const [a, b, c] of tris) {
    const ax = pos[a! * 3]!, ay = pos[a! * 3 + 1]!, az = pos[a! * 3 + 2]!;
    const ux = pos[b! * 3]! - ax, uy = pos[b! * 3 + 1]! - ay, uz = pos[b! * 3 + 2]! - az;
    const vx = pos[c! * 3]! - ax, vy = pos[c! * 3 + 1]! - ay, vz = pos[c! * 3 + 2]! - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a!, b!, c!]) {
      out[i * 3]! += nx;
      out[i * 3 + 1]! += ny;
      out[i * 3 + 2]! += nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) || 1;
    out[i]! /= l;
    out[i + 1]! /= l;
    out[i + 2]! /= l;
  }
  return out;
}

type Built = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  joints: Uint16Array;
  weights: Float32Array;
  morphs: Array<{ name: string; position: Float32Array; normal: Float32Array }>;
  /** For each glTF vertex, the source vertex it came from (masks are worked out on these). */
  source: Int32Array;
  /** The body only: per vertex, the flags of what covers it (GENESIS_MASK_BITS). */
  garments?: Float32Array;
};

function build(part: Part): Built {
  const tris = part.faces.flatMap((face) => face.slice(1, -1).map((_, i) => [face[0]!, face[i + 1]!, face[i + 2]!]));
  // A glTF vertex per distinct (position, uv) corner; normals per position so UV seams stay smooth.
  const key = new Map<string, number>();
  const source: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (const tri of tris) {
    for (const [v, t] of tri) {
      const k = `${v}/${t}`;
      let index = key.get(k);
      if (index === undefined) {
        index = source.length;
        key.set(k, index);
        source.push(v);
        uv.push(t >= 0 ? part.uvs[t * 2]! : 0, t >= 0 ? 1 - part.uvs[t * 2 + 1]! : 0);
      }
      indices.push(index);
    }
  }
  const sourceTris = tris.map((tri) => tri.map(([v]) => v));
  const rest = part.positionsOf(neutral);
  const restNormals = vertexNormals(rest, sourceTris);
  const count = source.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  source.forEach((v, i) => {
    const world = toWorld([rest[v * 3]!, rest[v * 3 + 1]!, rest[v * 3 + 2]!]);
    positions.set(world, i * 3);
    normals.set([restNormals[v * 3]!, restNormals[v * 3 + 1]!, restNormals[v * 3 + 2]!], i * 3);
    const [j, w] = topFour(part.skin[v]!);
    joints.set(j, i * 4);
    weights.set(w, i * 4);
  });
  const built: Built['morphs'] = [];
  for (const name of NAMES) {
    const moved = part.positionsOf(add(neutral, morphs.get(name)!));
    const position = new Float32Array(count * 3);
    let any = false;
    source.forEach((v, i) => {
      for (let k = 0; k < 3; k += 1) {
        const d = (moved[v * 3 + k]! - rest[v * 3 + k]!) * SCALE;
        position[i * 3 + k] = d;
        if (Math.abs(d) > 1e-6) any = true;
      }
    });
    // A part this control does not move carries no morph for it (most hair ignores the body controls).
    if (!any) continue;
    const movedNormals = vertexNormals(moved, sourceTris);
    const normal = new Float32Array(count * 3);
    source.forEach((v, i) => {
      for (let k = 0; k < 3; k += 1) normal[i * 3 + k] = movedNormals[v * 3 + k]! - restNormals[v * 3 + k]!;
    });
    built.push({ name, position, normal });
  }
  return { positions, normals, uvs: Float32Array.from(uv), indices: Uint32Array.from(indices), joints, weights, morphs: built, source: Int32Array.from(source) };
}

// --- Writing glTF ----------------------------------------------------------------------------

type Doc = { doc: Document; scene: Scene; skin: Skin; bones: GltfNode[] };

function newDoc(): Doc {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('genesis');
  const bones = KEEP.map((name) => doc.createNode(name));
  KEEP.forEach((_, i) => {
    const parent = BONE_PARENT[i];
    const head = BONE_HEAD[i]!;
    if (parent) {
      const p = BONE_HEAD[KEEP.indexOf(parent)]!;
      bones[i]!.setTranslation([head[0]! - p[0]!, head[1]! - p[1]!, head[2]! - p[2]!]);
      bones[KEEP.indexOf(parent)]!.addChild(bones[i]!);
    } else {
      bones[i]!.setTranslation(head as [number, number, number]);
      scene.addChild(bones[i]!);
    }
  });
  // Bones rest unrotated, so a turn in the game is a turn in the character's own axes.
  const inverse = new Float32Array(KEEP.length * 16);
  BONE_HEAD.forEach((h, i) => inverse.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0]!, -h[1]!, -h[2]!, 1], i * 16));
  const skin = doc.createSkin('genesis').setSkeleton(bones[0]!).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(inverse));
  bones.forEach((bone) => skin.addJoint(bone));
  return { doc, scene, skin, bones };
}

function addMesh({ doc, scene, skin }: Doc, name: string, built: Built, material: Material, extras: Record<string, unknown> = {}) {
  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', built.positions))
    .setAttribute('NORMAL', acc('VEC3', built.normals))
    .setAttribute('TEXCOORD_0', acc('VEC2', built.uvs))
    .setAttribute('JOINTS_0', acc('VEC4', built.joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', built.weights))
    .setIndices(acc('SCALAR', built.indices))
    .setMaterial(material);
  if (built.garments) primitive.setAttribute('_GARMENTS', acc('SCALAR', built.garments));
  for (const morph of built.morphs) {
    primitive.addTarget(doc.createPrimitiveTarget(morph.name).setAttribute('POSITION', acc('VEC3', morph.position)).setAttribute('NORMAL', acc('VEC3', morph.normal)));
  }
  const mesh = doc.createMesh(name).addPrimitive(primitive).setWeights(built.morphs.map(() => 0)).setExtras({ targetNames: built.morphs.map((m) => m.name), ...extras });
  scene.addChild(doc.createNode(name).setMesh(mesh).setSkin(skin));
}

async function texture(doc: Document, file: string, size: number, name: string) {
  const image = await sharp(file).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return doc.createTexture(name).setImage(image).setMimeType('image/png');
}

/**
 * The shading of a texture without its colour: grey, its average brought to
 * DETAIL_MEAN, alpha kept. Skin and hair are drawn this way so the game's own
 * colours (every skin tone, every hair colour, turquoise and pink included)
 * come out true instead of tinted by the source picture's colour.
 */
const DETAIL_MEAN = 0.82;
async function detailTexture(doc: Document, file: string, size: number, name: string) {
  const { data, info } = await sharp(file).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  let sum = 0;
  let counted = 0;
  const luma = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    luma[i] = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
    // The average over what shows (hair cards are mostly transparent).
    if (data[i * 4 + 3]! > 64) {
      sum += luma[i]!;
      counted += 1;
    }
  }
  const gain = (DETAIL_MEAN * 255) / Math.max(1, sum / Math.max(1, counted));
  const out = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const g = Math.max(0, Math.min(255, Math.round(luma[i]! * gain)));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g;
    out[i * 4 + 3] = data[i * 4 + 3]!;
  }
  const image = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return doc.createTexture(name).setImage(image).setMimeType('image/png');
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

async function write({ doc }: Doc, file: string): Promise<number> {
  await MeshoptEncoder.ready;
  if (process.env.GENESIS_RAW) await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }));
  else await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  const bytes = await io.writeBinary(doc);
  writeFileSync(join(OUT, file), bytes);
  return bytes.byteLength;
}

// --- Parts -------------------------------------------------------------------------------------

const facesOf = (obj: Obj, group: string) => obj.faces.filter((_, i) => obj.groups[i] === group);
const identity = (body: Float64Array) => body;

function fittedPart(rel: string, name: string): Part & { asset: Fitted } {
  const path = join(ASSETS, rel);
  const asset = readFitted(path);
  const obj = readObj(join(path, '..', asset.objFile));
  return { name, positionsOf: (body) => fit(asset, body), faces: obj.faces, uvs: obj.uvs, skin: fittedSkin(asset), asset };
}

const manifest: Record<string, unknown>[] = [];
const provenance = { source: 'MakeHuman (makehumancommunity.org)', license: 'CC0-1.0', commit: SOURCE.commit, assetPackSha256: SOURCE.assetsSha256 };

async function main() {
// The body, the eyes, brows, lashes, teeth and tongue: one file every character loads.
const core = newDoc();
const bodyPart: Part = { name: 'body', positionsOf: identity, faces: facesOf(base, 'body'), uvs: base.uvs, skin: vertexSkin };
const bodyBuilt = build(bodyPart);
const skinMaterial = core.doc.createMaterial('skin').setRoughnessFactor(0.55).setMetallicFactor(0).setBaseColorTexture(await detailTexture(core.doc, join(ASSETS, 'skins/young_caucasian_female/young_lightskinned_female_diffuse.png'), 1024, 'skin'));
// The body is added last, once every garment has marked the skin it covers (`flags`).
const flags = new Float32Array(bodyBuilt.source.length);
const coreParts: Array<[string, string, Material]> = [
  ['eyes/high-poly/high-poly.mhclo', 'eyes', core.doc.createMaterial('eyes').setRoughnessFactor(0.15).setMetallicFactor(0).setAlphaMode('BLEND').setBaseColorTexture(await texture(core.doc, join(ASSETS, 'eyes/materials/brown_eye.png'), 512, 'eyes'))],
  ['eyebrows/eyebrow001/eyebrow001.mhclo', 'eyebrows', core.doc.createMaterial('eyebrows').setBaseColorFactor([0.16, 0.11, 0.08, 1]).setRoughnessFactor(0.8).setMetallicFactor(0).setAlphaMode('BLEND').setDoubleSided(true).setBaseColorTexture(await texture(core.doc, join(ASSETS, 'eyebrows/eyebrow001/eyebrow001.png'), 512, 'eyebrows'))],
  ['eyelashes/eyelashes01/eyelashes01.mhclo', 'eyelashes', core.doc.createMaterial('eyelashes').setBaseColorFactor([0.08, 0.06, 0.05, 1]).setRoughnessFactor(0.8).setMetallicFactor(0).setAlphaMode('BLEND').setDoubleSided(true).setBaseColorTexture(await texture(core.doc, join(ASSETS, 'eyelashes/eyelashes01/eyelashes01.png'), 256, 'eyelashes'))],
  ['teeth/teeth_base/teeth_base.mhclo', 'teeth', core.doc.createMaterial('teeth').setRoughnessFactor(0.3).setMetallicFactor(0).setBaseColorTexture(await texture(core.doc, join(ASSETS, 'teeth/teeth_base/teeth.png'), 256, 'teeth'))],
  ['tongue/tongue01/tongue01.mhclo', 'tongue', core.doc.createMaterial('tongue').setRoughnessFactor(0.4).setMetallicFactor(0).setBaseColorTexture(await texture(core.doc, join(ASSETS, 'tongue/tongue01/tongue01_diffuse.png'), 256, 'tongue'))],
];
const coreStats: Record<string, { vertices: number; triangles: number }> = { body: { vertices: bodyBuilt.source.length, triangles: bodyBuilt.indices.length / 3 } };
for (const [rel, name, material] of coreParts) {
  const built = build(fittedPart(rel, name));
  addMesh(core, name, built, material);
  coreStats[name] = { vertices: built.source.length, triangles: built.indices.length / 3 };
}

/*
 * The skeleton follows the shape: each joint is the mean of its vertices, so
 * a taller body has longer legs and a wider one wider shoulders. The runtime
 * moves the bones by these offsets (per unit of each morph) when the shape
 * changes, so a turned arm turns about the right shoulder.
 */
const jointDeltas: Record<string, Record<string, number[]>> = {};
for (const name of NAMES) {
  const moved = add(neutral, morphs.get(name)!);
  const per: Record<string, number[]> = {};
  KEEP.forEach((bone, i) => {
    const p = toWorld(jointOf(moved, skeleton.bones[bone]!.head));
    const d = [p[0]! - BONE_HEAD[i]![0]!, p[1]! - BONE_HEAD[i]![1]!, p[2]! - BONE_HEAD[i]![2]!];
    if (d.some((x) => Math.abs(x) > 1e-5)) per[bone] = d.map((x) => Math.round(x * 1e5) / 1e5);
  });
  // How far the soles move (a taller body stands on lower feet): the runtime keeps them on the ground.
  let low = Infinity;
  for (const v of bodyVerts) low = Math.min(low, moved[v * 3 + 1]!);
  const groundDelta = (low - ground) * SCALE;
  if (Math.abs(groundDelta) > 1e-5) per.ground = [0, Math.round(groundDelta * 1e5) / 1e5, 0];
  jointDeltas[name] = per;
}
core.doc.getRoot().setExtras({ genesis: { version: GENESIS_ASSETS_VERSION, morphs: NAMES, bones: KEEP, jointDeltas, detailMean: DETAIL_MEAN, provenance } });

// --- Hairstyles, one file each (loaded only when worn) ------------------------------------------

for (const style of GENESIS_HAIR) {
  const d = newDoc();
  const part = fittedPart(`hair/${style}/${style}.mhclo`, `hair.${style}`);
  const info = readMaterial(join(ASSETS, 'hair', style, `${style}.mhmat`));
  const diffuse = (info.diffuseTexture ?? `${style}_diffuse.png`).split('/').pop()!;
  const material = d.doc.createMaterial('hair').setRoughnessFactor(0.7).setMetallicFactor(0).setAlphaMode('MASK').setAlphaCutoff(0.22).setDoubleSided(true).setBaseColorTexture(await detailTexture(d.doc, join(ASSETS, 'hair', style, diffuse), 1024, 'hair'));
  const built = build(part);
  addMesh(d, `hair.${style}`, built, material);
  const bytes = await write(d, `hair-${style}.glb`);
  manifest.push({ id: `hair.${style}`, category: 'hair', file: `hair-${style}.glb`, bytes, vertices: built.source.length, triangles: built.indices.length / 3, morphs: built.morphs.length, ...provenance, validation: 'baked' });
}

// --- Garments, cut from the body's own fitted shell ----------------------------------------------

/*
 * MakeHuman's base mesh carries a close-fitting suit ("helper-tights") that
 * moves with every shape and is weighted to the same skeleton. A garment is
 * the part of it over the right bones: a T-shirt is the torso and the upper
 * arm, trousers the hips and legs. It follows every body shape and every
 * move by construction, and the skin it covers is flagged on the body so the
 * body can never show through it.
 */
const tights = facesOf(base, 'helper-tights');
const dominant = (v: number) => {
  let best = -1;
  let weight = 0;
  for (const [bone, w] of vertexSkin[v]!) if (w > weight) [best, weight] = [bone, w];
  return KEEP[best] ?? 'root';
};
const sideless = (bone: string) => bone.replace(/\.[LR]$/, '');
/*
 * Where each garment ends, cut along the body's own lines so hems run
 * straight round it: the waistband just above the lower spine, the
 * neckline at the base of the neck, and sleeves and legs by how far along
 * the limb a face lies (0 at the shoulder or hip, 1 at the wrist or ankle;
 * the elbow and the knee are at about 0.55). Values in MakeHuman's
 * decimetres on the neutral body.
 */
const jointAt = (bone: string) => jointOf(neutral, skeleton.bones[bone]!.head);
const WAIST_Y = (jointAt('spine04')[1]! + jointAt('spine03')[1]!) / 2;
const NECK_Y = jointAt('neck01')[1]! - 0.3;
const CUTS: Record<GenesisGarment, { torso: 'upper' | 'lower'; arm?: number; leg?: number }> = {
  tee: { torso: 'upper', arm: 0.3 },
  longsleeve: { torso: 'upper', arm: 0.96 },
  trousers: { torso: 'lower', leg: 0.97 },
  shorts: { torso: 'lower', leg: 0.45 },
};
const ARM = new Set(['shoulder01', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist']);
const LEG = new Set(['upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot', 'toe1-1']);
/** How far along a limb a point lies, 0 at `from`, 1 at `to`. */
const along = (p: number[], from: number[], to: number[]) => {
  const d = [to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!];
  return ((p[0]! - from[0]!) * d[0]! + (p[1]! - from[1]!) * d[1]! + (p[2]! - from[2]!) * d[2]!) / (d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2);
};
const centre = (face: Corner[]) => {
  const c = [0, 0, 0];
  for (const [v] of face) for (let k = 0; k < 3; k += 1) c[k]! += neutral[v * 3 + k]! / face.length;
  return c;
};
const regionOf = (face: Corner[]) => {
  const counts = new Map<string, number>();
  for (const [v] of face) counts.set(sideless(dominant(v)), (counts.get(sideless(dominant(v))) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return ARM.has(top) ? 'arm' : LEG.has(top) ? 'leg' : 'torso';
};
function garmentFaces(garment: GenesisGarment): Corner[][] {
  const cut = CUTS[garment];
  return tights.filter((face) => {
    const c = centre(face);
    const side = c[0]! >= 0 ? 'L' : 'R';
    const region = regionOf(face);
    if (region === 'arm') return cut.arm !== undefined && along(c, jointAt(`upperarm01.${side}`), jointAt(`wrist.${side}`)) < cut.arm;
    if (region === 'leg') return cut.leg !== undefined && along(c, jointAt(`upperleg01.${side}`), jointAt(`foot.${side}`)) < cut.leg;
    return cut.torso === 'upper' ? c[1]! >= WAIST_Y && c[1]! <= NECK_Y : c[1]! < WAIST_Y;
  });
}
// For hiding skin: each body vertex's nearest shell vertex (brute force; a few seconds, once).
const tightsVerts = [...new Set(tights.flatMap((f) => f.map(([v]) => v)))];
const nearestShell = new Map<number, number>();
for (const v of bodyVerts) {
  let best = -1;
  let dist = Infinity;
  const x = neutral[v * 3]!, y = neutral[v * 3 + 1]!, z = neutral[v * 3 + 2]!;
  for (const t of tightsVerts) {
    const dx = neutral[t * 3]! - x, dy = neutral[t * 3 + 1]! - y, dz = neutral[t * 3 + 2]! - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < dist) [best, dist] = [t, d];
  }
  nearestShell.set(v, best);
}
for (const garment of GENESIS_GARMENTS) {
  const faces = garmentFaces(garment);
  // The shell vertices on the garment's edge: skin under an edge stays, so no gap ever shows.
  const edgeCount = new Map<string, number>();
  for (const face of faces) face.forEach(([a], i) => {
    const b = face[(i + 1) % face.length]![0];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  });
  const rim = new Set<number>();
  for (const [key, n] of edgeCount) if (n === 1) key.split(':').forEach((v) => rim.add(Number(v)));
  const inner = new Set(faces.flatMap((f) => f.map(([v]) => v)).filter((v) => !rim.has(v)));
  const covered = (v: number) => inner.has(nearestShell.get(v)!);
  const bit = 2 ** GENESIS_MASK_BITS[`garment.${garment}`]!;
  let hides = 0;
  bodyBuilt.source.forEach((v, i) => {
    if (!covered(v)) return;
    flags[i]! += bit;
    hides += 1;
  });
  const d = newDoc();
  const material = d.doc.createMaterial(garment).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.88).setMetallicFactor(0).setDoubleSided(true);
  const built = build({ name: `garment.${garment}`, positionsOf: identity, faces, uvs: base.uvs, skin: vertexSkin });
  addMesh(d, `garment.${garment}`, built, material, { maskBit: GENESIS_MASK_BITS[`garment.${garment}`] });
  const bytes = await write(d, `garment-${garment}.glb`);
  manifest.push({ id: `garment.${garment}`, category: 'garment', file: `garment-${garment}.glb`, bytes, vertices: built.source.length, triangles: built.indices.length / 3, hidesBodyVertices: hides, ...provenance, validation: 'baked' });
}

// --- Shoes: fitted assets that say which skin they cover (their delete_verts) ----------------------

for (const [id, style] of Object.entries(GENESIS_SHOES)) {
  const d = newDoc();
  const part = fittedPart(`clothes/${style}/${style}.mhclo`, `shoes.${id}`);
  const info = readMaterial(join(ASSETS, 'clothes', style, `${style}.mhmat`));
  const diffuse = (info.diffuseTexture ?? `${style}_diffuse.png`).split('/').pop()!;
  const material = d.doc.createMaterial(`shoes.${id}`).setRoughnessFactor(0.6).setMetallicFactor(0).setBaseColorTexture(await texture(d.doc, join(ASSETS, 'clothes', style, diffuse), 512, 'shoes'));
  const built = build(part);
  // Skin under the shoe: every corner of a body triangle that has any corner the asset deletes.
  const bit = 2 ** GENESIS_MASK_BITS[`shoes.${id}`]!;
  const marked = new Set<number>();
  for (let t = 0; t < bodyBuilt.indices.length / 3; t += 1) {
    const corners = [0, 1, 2].map((k) => bodyBuilt.indices[t * 3 + k]!);
    if (corners.some((i) => part.asset.deleteVerts.has(bodyBuilt.source[i]!))) corners.forEach((i) => marked.add(i));
  }
  for (const i of marked) flags[i]! += bit;
  const hides = marked.size;
  addMesh(d, `shoes.${id}`, built, material, { maskBit: GENESIS_MASK_BITS[`shoes.${id}`] });
  const bytes = await write(d, `shoes-${id}.glb`);
  manifest.push({ id: `shoes.${id}`, category: 'shoes', file: `shoes-${id}.glb`, bytes, vertices: built.source.length, triangles: built.indices.length / 3, hidesBodyVertices: hides, ...provenance, validation: 'baked' });
}

bodyBuilt.garments = flags;
addMesh(core, 'body', bodyBuilt, skinMaterial);
const coreBytes = await write(core, 'core.glb');
manifest.push({ id: 'core', category: 'base', file: 'core.glb', bytes: coreBytes, parts: coreStats, morphs: NAMES.length, bones: KEEP.length, ...provenance, validation: 'baked' });
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({ version: GENESIS_ASSETS_VERSION, assets: manifest }, null, 1)}\n`);
console.log(JSON.stringify(manifest.map(({ id, bytes, triangles, parts }) => ({ id, kb: Math.round(Number(bytes) / 1024), triangles, parts })), null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
