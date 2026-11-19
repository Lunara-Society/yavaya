/**
 * Readers for MakeHuman's CC0 data files: the base mesh, targets, fitted
 * assets (hair, eyes, teeth, clothes), the skeleton and its skin weights.
 *
 * Only the data formats are read here. None of MakeHuman's program code
 * (AGPL) is used or copied: this is Yavaya's own reading of plain text and
 * JSON files whose assets were released as CC0 (docs/GENESIS.md,
 * "Provenance").
 *
 * - base.obj: Wavefront OBJ in decimetres, y up, facing +z, in groups
 *   ("body", "helper-*", "joint-*").
 * - *.target: sparse vertex offsets, one "index dx dy dz" per line.
 * - *.mhclo / *.proxy: a fitted asset. Each of its vertices is three base
 *   vertices with weights plus an offset ("v1 v2 v3 w1 w2 w3 dx dy dz"), or
 *   one base vertex. The offset is scaled per axis by how far apart two
 *   reference vertices are now against the distance given ("x_scale v1 v2
 *   dist"), so a fitted asset follows every change of the body.
 * - default.mhskel: bones with parents, each end a "joint" that is the mean
 *   of a list of base vertices, so the skeleton follows the body's shape.
 * - default_weights.mhw: per bone, [vertex, weight] pairs.
 */
import { readFileSync } from 'node:fs';

export type Corner = [vertex: number, uv: number];
export type Obj = {
  positions: Float64Array;
  uvs: Float64Array;
  faces: Corner[][];
  groups: string[];
};

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/);
}

export function readObj(path: string): Obj {
  const positions: number[] = [];
  const uvs: number[] = [];
  const faces: Corner[][] = [];
  const groups: string[] = [];
  let group = 'default';
  for (const line of lines(path)) {
    if (!line || line[0] === '#') continue;
    const parts = line.trim().split(/\s+/);
    switch (parts[0]) {
      case 'v':
        positions.push(+parts[1]!, +parts[2]!, +parts[3]!);
        break;
      case 'vt':
        uvs.push(+parts[1]!, +parts[2]!);
        break;
      case 'g':
        group = parts[1] ?? 'default';
        break;
      case 'f':
        faces.push(
          parts.slice(1).map((p) => {
            const [v, t] = p.split('/');
            return [Number(v) - 1, t ? Number(t) - 1 : -1] as Corner;
          }),
        );
        groups.push(group);
        break;
    }
  }
  return { positions: Float64Array.from(positions), uvs: Float64Array.from(uvs), faces, groups };
}

/** A target as a dense offset array over `count` vertices. */
export function readTarget(path: string, count: number): Float64Array {
  const delta = new Float64Array(count * 3);
  for (const line of lines(path)) {
    if (!line || line[0] === '#') continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const i = Number(parts[0]) * 3;
    delta[i] = +parts[1]!;
    delta[i + 1] = +parts[2]!;
    delta[i + 2] = +parts[3]!;
  }
  return delta;
}

export type Fitted = {
  name: string;
  refs: Int32Array; // 3 per vertex
  weights: Float64Array; // 3 per vertex
  offsets: Float64Array; // 3 per vertex
  scales: Partial<Record<'x' | 'y' | 'z', [number, number, number]>>;
  objFile: string;
  material: string | null;
  deleteVerts: Set<number>;
};

export function readFitted(path: string): Fitted {
  const refs: number[] = [];
  const weights: number[] = [];
  const offsets: number[] = [];
  const scales: Fitted['scales'] = {};
  const deleteVerts = new Set<number>();
  let name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  let objFile = '';
  let material: string | null = null;
  // A section starts at "verts" or "delete_verts" and holds every numeric line after it; other keys
  // may sit between its lines (some files put "material" in the middle of the vertex list).
  let mode: 'verts' | 'delete' | null = null;
  for (const raw of lines(path)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0]!;
    const numeric = /^-?\d/.test(key);
    if (key === 'verts') {
      mode = 'verts';
      continue;
    }
    if (key === 'delete_verts') {
      mode = 'delete';
      continue;
    }
    if (numeric && mode === 'verts') {
      if (parts.length === 1) {
        const v = Number(parts[0]);
        refs.push(v, v, v);
        weights.push(1, 0, 0);
        offsets.push(0, 0, 0);
      } else {
        refs.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
        weights.push(+parts[3]!, +parts[4]!, +parts[5]!);
        offsets.push(+(parts[6] ?? 0), +(parts[7] ?? 0), +(parts[8] ?? 0));
      }
      continue;
    }
    if (numeric && mode === 'delete') {
      for (const token of parts) {
        if (token.includes('-')) {
          const [a, b] = token.split('-').map(Number);
          for (let v = a!; v <= b!; v += 1) deleteVerts.add(v);
        } else deleteVerts.add(Number(token));
      }
      continue;
    }
    if (key === 'name') name = parts[1]!;
    else if (key === 'obj_file') objFile = parts[1]!;
    else if (key === 'material') material = parts[1]!;
    else if (key === 'x_scale' || key === 'y_scale' || key === 'z_scale') scales[key[0] as 'x' | 'y' | 'z'] = [Number(parts[1]), Number(parts[2]), +parts[3]!];
  }
  return { name, refs: Int32Array.from(refs), weights: Float64Array.from(weights), offsets: Float64Array.from(offsets), scales, objFile, material, deleteVerts };
}

/** A fitted asset's vertex positions on a body whose vertex positions are `base`. */
export function fit(asset: Fitted, base: Float64Array): Float64Array {
  const count = asset.refs.length / 3;
  const out = new Float64Array(count * 3);
  const scale = [1, 1, 1];
  (['x', 'y', 'z'] as const).forEach((axis, k) => {
    const s = asset.scales[axis];
    if (s) scale[k] = Math.abs(base[s[0] * 3 + k]! - base[s[1] * 3 + k]!) / s[2];
  });
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      let value = 0;
      for (let r = 0; r < 3; r += 1) value += asset.weights[i * 3 + r]! * base[asset.refs[i * 3 + r]! * 3 + k]!;
      out[i * 3 + k] = value + asset.offsets[i * 3 + k]! * scale[k]!;
    }
  }
  return out;
}

export type Skeleton = {
  bones: Record<string, { parent: string | null; head: string; tail: string }>;
  joints: Record<string, number[]>;
};

export function readSkeleton(path: string): Skeleton {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Skeleton;
  return { bones: data.bones, joints: data.joints };
}

/** Per bone, its [vertex, weight] pairs. */
export function readWeights(path: string): Record<string, Array<[number, number]>> {
  return (JSON.parse(readFileSync(path, 'utf8')) as { weights: Record<string, Array<[number, number]>> }).weights;
}

/** Key/value lines of a material file (.mhmat), for the texture names. */
export function readMaterial(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const raw of lines(path)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const space = line.indexOf(' ');
      if (space > 0) out[line.slice(0, space)] = line.slice(space + 1);
    }
  } catch {
    // No material file: the asset is drawn with defaults.
  }
  return out;
}
