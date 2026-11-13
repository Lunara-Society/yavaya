import * as THREE from 'three';

/**
 * The trials' look (docs/PLAY.md): premium stylized realism, the owner's
 * direction. Volcanic stone, obsidian and a restrained gold, under a dusk
 * sky with soft shadows, instead of the bright toy colours of the first
 * course. Everything here is generated in code (a noise texture painted on
 * a canvas, a gradient sky): nothing is downloaded, nothing is licensed.
 */

let stoneTexture: THREE.CanvasTexture | null = null;

/** A 256-pixel stone grain, tiled: what keeps a flat face from looking like plastic. */
export function stoneGrain(): THREE.CanvasTexture {
  if (stoneTexture) return stoneTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const image = c.createImageData(size, size);
  // Value noise at three scales, summed: deterministic (a fixed seed), so every phone sees the same stone.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const layers = [8, 32, 96].map((cells) => {
    const grid = Array.from({ length: cells * cells }, rand);
    return { cells, grid };
  });
  const sample = (layer: { cells: number; grid: number[] }, x: number, y: number) => {
    const fx = (x / size) * layer.cells;
    const fy = (y / size) * layer.cells;
    const x0 = Math.floor(fx) % layer.cells;
    const y0 = Math.floor(fy) % layer.cells;
    const x1 = (x0 + 1) % layer.cells;
    const y1 = (y0 + 1) % layer.cells;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const g = layer.grid;
    const a = g[y0 * layer.cells + x0]! * (1 - tx) + g[y0 * layer.cells + x1]! * tx;
    const b = g[y1 * layer.cells + x0]! * (1 - tx) + g[y1 * layer.cells + x1]! * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = 0.55 * sample(layers[0]!, x, y) + 0.3 * sample(layers[1]!, x, y) + 0.15 * sample(layers[2]!, x, y);
      const shade = Math.round(150 + (v - 0.5) * 120);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  stoneTexture = new THREE.CanvasTexture(canvas);
  stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
  stoneTexture.colorSpace = THREE.SRGBColorSpace;
  return stoneTexture;
}

export const PALETTE = {
  basalt: 0x5a5350,
  stone: 0x9a8e7f,
  obsidian: 0x221f29,
  gold: 0xc9a24a,
  crumble: 0x7a6552,
  gate: 0x2e2a35,
  lava: 0xff5a1f,
  ember: 0xff7a2a,
} as const;

export function stoneMaterial(color: number, options: { rough?: number; metal?: number; repeat?: number } = {}) {
  const map = stoneGrain().clone();
  map.needsUpdate = true;
  map.repeat.set(options.repeat ?? 1, options.repeat ?? 1);
  return new THREE.MeshStandardMaterial({ color, map, roughness: options.rough ?? 0.88, metalness: options.metal ?? 0 });
}

/** A sky that darkens upward from a warm horizon: a big sphere seen from inside. */
export function duskSky(scene: THREE.Scene, top = 0x1b2236, horizon = 0xc8784e) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float h; void main() { float k = smoothstep(-0.05, 0.55, h); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), material);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(new THREE.Color(horizon).lerp(new THREE.Color(top), 0.6).getHex(), 0.014);
  return sky;
}

/** Soft dusk light: a cool sky, warm bounce from the ground, and one low sun that casts shadows. */
export function duskLight(scene: THREE.Scene, shadows: boolean) {
  scene.add(new THREE.HemisphereLight(0xaab6d8, 0x4a3226, 1.1));
  const sun = new THREE.DirectionalLight(0xffc89a, 2.4);
  sun.position.set(-9, 14, -7);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -9;
    cam.right = cam.top = 9;
    cam.near = 1;
    cam.far = 50;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  return sun;
}
