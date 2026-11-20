'use client';

import { useEffect, useId, useRef, type MutableRefObject } from 'react';
import { readRoxiState, toVisual, type RoxiRaw } from './state-bus';
import { BASE, CORE, HALF, HU, HV, R, arcOutline } from './halo-shape';

/**
 * Roxi's Halo: three arcs of obsidian around a violet light with a golden
 * heart, the owner's choice for her face (20 November 2026; docs/roxi/HALO.md).
 * It replaces the gold orb while the `roxi_halo` look is on; off, the orb
 * (orb.tsx) is back.
 *
 * Every movement is read from what Roxi is really doing (state-bus.ts): the
 * arcs part while the member speaks and open further with the real loudness
 * of their voice, swell with hers, turn like a gyroscope while she thinks,
 * make a cage while she writes a draft, click round one step at a time while
 * something is saved or opened, close around one point while a confirmation
 * waits, let a glint of gold pass when a step completes, and slip when
 * something fails. At rest they only breathe.
 *
 * The same shape at two levels, never two different Roxis: WebGL (hand
 * written, no library) where the device affords it, and an SVG drawing of
 * the same arcs on modest phones, when saving data, with reduced motion, or
 * without WebGL. Obsidian, violet and gold only: the owner asked for no grey
 * and no white, so even the hottest point of the light is gold.
 */

export type HaloPose = 'resting' | 'listening' | 'speaking' | 'processing' | 'creating' | 'executing' | 'awaiting' | 'completed' | 'error';

/** Which pose the Halo takes for what Roxi is doing right now. */
export function haloPose(raw: RoxiRaw, now: number): HaloPose {
  const visual = toVisual(raw, now);
  switch (visual) {
    case 'error':
      return 'error';
    case 'awaiting':
      return 'awaiting';
    case 'processing':
      // Writing a draft or filling a form is building something; saving or opening is carrying it out.
      if (raw.activity === 'preparing' || raw.activity === 'filling') return 'creating';
      if (raw.activity === 'saving' || raw.activity === 'opening') return 'executing';
      return 'processing';
    case 'searching':
    case 'understanding':
      return 'processing';
    case 'responding':
      return 'speaking';
    case 'listening':
      return 'listening';
    case 'completed':
      return 'completed';
    default:
      return 'resting';
  }
}

// ---- Small linear algebra (column-major, as WebGL reads it) ----
type V3 = [number, number, number];
type M4 = Float32Array;
const TAU = Math.PI * 2;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}
const chain = (...m: M4[]) => m.reduce(mul);
function persp(fov: number, a: number, n: number, f: number): M4 {
  const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
}
function lookAt(e: V3, t: V3, u: V3): M4 {
  const z = norm(sub(e, t)),
    x = norm(cross(u, z)),
    y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
const T = (x: number, y: number, z: number): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const RX = (a: number): M4 => new Float32Array([1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]);
const RY = (a: number): M4 => new Float32Array([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]);
const RZ = (a: number): M4 => new Float32Array([Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// ---- The arcs: a chamfered section swept along a third of a ring ----
// Per vertex: position, normal, flag (0 stone, 1 cut edge, gold where lit; 2 the seam of light; 3 a glowing cut end).
function arcMesh(steps: number): Float32Array {
  const d: number[] = [];
  const tri = (a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, e: number) => {
    // Keep front faces counter-clockwise: flip when the winding disagrees with the intended normals.
    if (dot(cross(sub(b, a), sub(c, a)), [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]]) < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
    }
    d.push(...a, ...na, e, ...b, ...nb, e, ...c, ...nc, e);
  };
  const b = 0.035,
    w = 0.016;
  const P: [number, number][] = [[HU, -HV + b], [HU, HV - b], [HU - b, HV], [-HU + b, HV], [-HU, HV - b], [-HU, -HV + b], [-HU + b, -HV], [HU - b, -HV]];
  const segs: [[number, number], [number, number], number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = P[i]!,
      c = P[(i + 1) % 8]!;
    if (i === 4) {
      // The inner face, toward the light, carries the seam.
      const m: [number, number] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const s1: [number, number] = [m[0], m[1] + w],
        s2: [number, number] = [m[0], m[1] - w];
      segs.push([a, s1, 0], [s1, s2, 2], [s2, c, 0]);
    } else segs.push([a, c, i % 2]);
  }
  const at = (t: number, q: [number, number]): V3 => [(R + q[0]) * Math.cos(t), (R + q[0]) * Math.sin(t), q[1]];
  const nAt = (t: number, n: [number, number]): V3 => norm([n[0] * Math.cos(t), n[0] * Math.sin(t), n[1]]);
  for (let k = 0; k < steps; k++) {
    const t0 = -HALF + (2 * HALF * k) / steps,
      t1 = -HALF + (2 * HALF * (k + 1)) / steps;
    for (const [a, c, f] of segs) {
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]),
        n2: [number, number] = [(c[1] - a[1]) / l, -(c[0] - a[0]) / l];
      const nA = nAt(t0, n2),
        nB = nAt(t1, n2);
      tri(at(t0, a), at(t0, c), at(t1, c), nA, nA, nB, f);
      tri(at(t0, a), at(t1, c), at(t1, a), nA, nB, nB, f);
    }
  }
  for (const [t, out] of [[-HALF, -1], [HALF, 1]] as const) {
    const pts = P.map((q) => at(t, q));
    const n = norm([-Math.sin(t) * out, Math.cos(t) * out, 0]);
    for (let i = 1; i < pts.length - 1; i++) tri(pts[0]!, pts[i]!, pts[i + 1]!, n, n, n, 3);
  }
  return new Float32Array(d);
}

// ---- Poses: per arc [step out from the centre, turn about its own radius, swing about its middle, angle on the ring, depth] ----
type Arc = { off: number; tx: number; ty: number; phi: number; z: number; s: number };
type Pose = { arcs: (i: number) => Partial<Arc>; I: number; R: number; k: number; gold?: number; beam?: number; scan?: number; amber?: number };
const POSES: Record<HaloPose, Pose> = {
  resting: { arcs: () => ({}), I: 1.0, R: 0.8, k: 4 },
  listening: { arcs: () => ({ off: 0.15 }), I: 1.3, R: 1.05, k: 4.5 },
  speaking: { arcs: () => ({ off: 0.03 }), I: 1.0, R: 0.85, k: 6 },
  processing: { arcs: () => ({ z: -0.05 }), I: 1.1, R: 0.7, k: 3.5, scan: 1 },
  creating: { arcs: (i) => ({ tx: [1.2, -0.85, 0.85][i], ty: [0, 0.45, -0.45][i], off: 0.04, z: -0.12 }), I: 1.25, R: 1.1, k: 3 },
  executing: { arcs: () => ({ off: -0.02 }), I: 1.2, R: 0.7, k: 7, scan: 1 },
  awaiting: { arcs: () => ({ off: -0.09 }), I: 1.7, R: 0.5, k: 3, gold: 0.25, beam: 1 },
  completed: { arcs: () => ({}), I: 1.15, R: 0.85, k: 4 },
  error: { arcs: (i) => (i === 2 ? { off: 0.3, tx: 0.5, phi: 0.25 } : i === 1 ? { off: 0.04, phi: -0.12 } : { phi: 0.06 }), I: 0.55, R: 0.75, k: 14, amber: 1 },
};
const target = (pose: HaloPose, i: number): Arc => {
  const a = POSES[pose].arcs(i);
  return { off: a.off ?? 0, tx: a.tx ?? 0, ty: a.ty ?? 0, phi: BASE[i]! + (a.phi ?? 0), z: a.z ?? 0, s: a.s ?? 1 };
};

// ---- Shaders ----
const VS = `attribute vec3 a_pos;attribute vec3 a_nrm;attribute float a_edge;
uniform mat4 u_model;uniform mat4 u_vp;uniform mat3 u_nm;
varying vec3 v_w;varying vec3 v_n;varying float v_e;
void main(){vec4 w=u_model*vec4(a_pos,1.0);v_w=w.xyz;v_n=u_nm*a_nrm;v_e=a_edge;gl_Position=u_vp*w;}`;
const FS = `precision mediump float;
varying vec3 v_w;varying vec3 v_n;varying float v_e;
uniform vec3 u_cam;uniform vec3 u_core;uniform float u_coreI;uniform vec3 u_coreCol;
uniform float u_gold;uniform float u_sweep;uniform float u_seam;uniform float u_scanY;uniform float u_scanOn;
void main(){
 vec3 N=normalize(v_n);vec3 V=normalize(u_cam-v_w);vec3 Rf=reflect(-V,N);
 float ndv=max(dot(N,V),0.0);float fres=0.04+0.96*pow(1.0-ndv,5.0);
 float sky=smoothstep(-0.3,0.5,Rf.y);
 vec3 env=mix(vec3(0.0015,0.001,0.003),vec3(0.62,0.3,1.25),sky*sky);
 vec3 Lk=normalize(vec3(-0.5,0.85,0.65));
 float box=pow(max(dot(Rf,Lk),0.0),60.0);
 float spec=pow(max(dot(N,normalize(Lk+V)),0.0),90.0);
 vec3 toC=u_core-v_w;float d2=dot(toC,toC);vec3 Lc=toC*inversesqrt(d2);
 float att=u_coreI/(1.0+d2*2.4);
 float cd=max(dot(N,Lc),0.0);float cs=pow(max(dot(N,normalize(Lc+V)),0.0),36.0);
 float keyD=max(dot(N,Lk),0.0);
 vec3 obs=vec3(0.0011,0.0008,0.0018)+vec3(0.003,0.0022,0.0045)*keyD+env*fres*1.1+vec3(1.0,0.76,0.42)*box*fres*2.0+vec3(1.0,0.78,0.45)*spec*0.25;
 obs+=u_coreCol*(cd*0.30+cs*0.9)*att;
 vec3 gold=vec3(0.95,0.68,0.3);
 float sg=pow(max(dot(N,normalize(Lk+V)),0.0),28.0);
 float glint=exp(-pow((v_w.x+v_w.y*0.45-u_sweep)*5.0,2.0));
 float gl=0.02+sg*1.4+box*1.5+cs*att*1.2+cd*att*0.12+u_gold*glint*2.2;
 vec3 spectral=u_coreCol*mix(vec3(0.8,0.95,1.15),vec3(1.2,0.85,1.0),smoothstep(-1.2,1.2,v_w.x));
 float isGold=step(0.5,v_e)*step(v_e,1.5);float isSeam=step(1.5,v_e)*step(v_e,2.5);float isCap=step(2.5,v_e);
 vec3 col=mix(obs,gold*gl,isGold);
 col=mix(col,spectral*u_seam*1.5+obs*0.3,isSeam);
 col+=spectral*u_seam*0.22*isCap;
 col+=spectral*exp(-pow((v_w.y-u_scanY)*16.0,2.0))*u_scanOn*0.35;
 col=col/(1.0+col);col=pow(col,vec3(0.4545));
 gl_FragColor=vec4(col,1.0);}`;
const GVS = `attribute vec2 a_q;uniform vec4 u_c;uniform vec2 u_size;varying vec2 v_q;
void main(){v_q=a_q;gl_Position=vec4(u_c.xy/u_c.w+a_q*u_size,0.0,1.0);}`;
const GFS = `precision mediump float;varying vec2 v_q;uniform vec3 u_col;uniform float u_i;uniform float u_k;uniform float u_aniso;
void main(){vec2 q=v_q*vec2(1.0,u_aniso);float r2=dot(q,q);
 float edge=smoothstep(1.0,0.55,sqrt(r2));
 float g=(exp(-r2*u_k)*u_i+exp(-r2*u_k*0.12)*u_i*0.2)*edge;float hot=exp(-r2*u_k*7.0)*min(u_i,1.0)*0.62;
 vec3 c=u_col*g*(1.0-0.8*exp(-r2*u_k*3.0))+vec3(1.0,0.74,0.36)*hot*1.25;
 gl_FragColor=vec4(c,clamp(max(c.r,max(c.g,c.b)),0.0,1.0));}`;

type Program = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null; a: (name: string) => number };
function compile(gl: WebGLRenderingContext, vs: string, fs: string): Program {
  const p = gl.createProgram();
  if (!p) throw new Error('program');
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type);
    if (!s) throw new Error('shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const locations = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(p, name));
    return locations.get(name) ?? null;
  };
  return { p, u, a: (name) => gl.getAttribLocation(p, name) };
}

/** Whether this device gets the drawn (SVG) Halo instead of WebGL: same shape, same states. */
function preferDrawn(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (nav.connection?.saveData) return true;
  return (nav.deviceMemory ?? 4) <= 1 || (nav.hardwareConcurrency ?? 4) <= 2;
}

function voiceFor(pose: HaloPose, level: number): number {
  return pose === 'speaking' || pose === 'listening' ? Math.max(0, Math.min(1, level)) : 0;
}

function startHalo(host: HTMLDivElement, level: MutableRefObject<number>, ids: string): () => void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gl: WebGLRenderingContext | null = null;
  const canvas = document.createElement('canvas');
  if (!preferDrawn()) {
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
  }
  let prog: Program | null = null,
    glow: Program | null = null,
    mesh: WebGLBuffer | null = null,
    quad: WebGLBuffer | null = null,
    count = 0;
  if (gl) {
    try {
      prog = compile(gl, VS, FS);
      glow = compile(gl, GVS, GFS);
      const data = arcMesh(24);
      count = data.length / 7;
      mesh = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    } catch {
      gl = null;
    }
  }

  // The drawn Halo: the same arcs in SVG, moved by the same springs.
  let svg: SVGSVGElement | null = null;
  if (gl) host.appendChild(canvas);
  else {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-1.5 -1.5 3 3');
    const outline = arcOutline(20);
    svg.innerHTML = `<defs>
      <linearGradient id="${ids}o" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#040306"/><stop offset="0.55" stop-color="#0f0a19"/><stop offset="1" stop-color="#211538"/></linearGradient>
      <radialGradient id="${ids}g"><stop offset="0" stop-color="#ffd58a" stop-opacity="0.95"/><stop offset="0.18" stop-color="#a77bff" stop-opacity="0.8"/><stop offset="0.55" stop-color="#7a4dff" stop-opacity="0.2"/><stop offset="1" stop-color="#7a4dff" stop-opacity="0"/></radialGradient>
    </defs><g transform="scale(1,-1)"><circle class="roxi-halo-light" cx="${CORE[0]}" cy="${CORE[1]}" r="0.6" fill="url(#${ids}g)"/>${[0, 1, 2]
      .map(() => `<g class="roxi-halo-arc"><polygon points="${outline}" fill="url(#${ids}o)" stroke="#c9a86a" stroke-width="0.03" stroke-linejoin="miter"/></g>`)
      .join('')}</g>`;
    host.appendChild(svg);
  }

  const cur: Arc[] = [0, 1, 2].map((i) => target('resting', i));
  const light = { I: 1, R: 0.8, gold: 0, seam: 0.8, amber: 0, beam: 0, scan: 0 };
  let pose: HaloPose = 'resting',
    sweepAt = -10,
    last = performance.now(),
    raf = 0,
    timer = 0,
    stopped = false;
  const t0 = last;

  function step(dt: number, t: number) {
    const next = haloPose(readRoxiState(), Date.now());
    if (next !== pose) {
      if (next === 'completed') sweepAt = t;
      pose = next;
    }
    const P = POSES[pose],
      v = voiceFor(pose, level.current);
    let I = P.I,
      Rg = P.R,
      gold = P.gold ?? 0;
    if (pose === 'speaking') {
      I = 0.95 + v * 0.95;
      Rg = P.R + v * 0.3;
      gold += v * 0.35;
    }
    if (pose === 'listening') I += v * 0.35;
    if (pose === 'processing' && !still) I += Math.sin(t * 3) * 0.08;
    let tickE = 1;
    const k = still ? 1 : 1 - Math.exp(-dt * P.k);
    for (let i = 0; i < 3; i++) {
      const g = target(pose, i);
      if (!still) {
        if (pose === 'resting' || pose === 'completed' || pose === 'listening') g.off += Math.sin(t * 0.8 + i * 2.1) * 0.01;
        if (pose === 'speaking' || pose === 'listening') g.off += v * 0.08;
        if (pose === 'processing') {
          g.tx += Math.sin(t * 0.9 + i * 2.1) * 0.85;
          g.ty += Math.sin(t * 0.63 + i * 1.3) * 0.3;
          g.phi += t * 0.35;
        }
        if (pose === 'executing') {
          // One click round the ring per step: a mechanism, not a spinner.
          const tick = Math.floor(t / 0.7),
            ph = (t % 0.7) / 0.7;
          tickE = ph < 0.4 ? 1 - Math.pow(1 - ph / 0.4, 3) : 1;
          g.phi += (tick + tickE) * (TAU / 6);
        }
      }
      const c = cur[i]!;
      c.off += (g.off - c.off) * k;
      c.z += (g.z - c.z) * k;
      c.s += (g.s - c.s) * k;
      // Angles take the short way round, so a ring that turned while working does not unwind turn by turn.
      for (const key of ['tx', 'ty', 'phi'] as const) {
        let d = g[key] - c[key];
        d -= TAU * Math.round(d / TAU);
        c[key] += d * k;
      }
    }
    if (pose === 'executing') I += (1 - tickE) * 0.35;
    const kl = still ? 1 : 1 - Math.exp(-dt * 6);
    light.I += (I - light.I) * kl;
    light.R += (Rg - light.R) * kl;
    light.gold += (gold - light.gold) * kl;
    light.seam += (I * 0.8 + v * 0.5 - light.seam) * kl;
    light.amber += ((P.amber ?? 0) - light.amber) * kl;
    light.beam += ((P.beam ?? 0) - light.beam) * kl;
    light.scan += ((P.scan ?? 0) - light.scan) * kl;
  }

  const model = (c: Arc): M4 => chain(T(CORE[0], CORE[1], CORE[2] + c.z), RZ(c.phi), T(c.off + R, 0, 0), RY(c.ty), T(-R, 0, 0), RX(c.tx), new Float32Array([c.s, 0, 0, 0, 0, c.s, 0, 0, 0, 0, c.s, 0, 0, 0, 0, 1]));

  function drawGL(t: number) {
    if (!gl || !prog || !glow) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(host.clientWidth * dpr)),
      h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const aspect = w / h;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const fov = 0.58,
      e: V3 = [0, 0.15, 4.9 * Math.max(1, 1 / aspect)];
    const vp = mul(persp(fov, aspect, 0.1, 30), lookAt(e, [0, 0.04, 0], [0, 1, 0]));
    const coreCol: V3 = [0.56 + light.amber * 0.34, 0.3 + light.amber * 0.2, 1.0 - light.amber * 0.72];
    const sweep = Math.max(0, 1 - (t - sweepAt) / 1.3);

    // The light first, behind the arcs: additive, writing no depth, so stone in front hides it.
    const c = [0, 1, 2, 3].map((r) => vp[r]! * CORE[0] + vp[4 + r]! * CORE[1] + vp[8 + r]! * CORE[2] + vp[12 + r]!) as [number, number, number, number];
    const size = ((0.42 * light.R) / (c[3] * Math.tan(fov / 2))) * 1.6;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(glow.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const aQ = glow.a('a_q');
    gl.enableVertexAttribArray(aQ);
    gl.vertexAttribPointer(aQ, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(glow.u('u_c'), c[0], c[1], c[2], c[3]);
    gl.uniform2f(glow.u('u_size'), size / aspect, size);
    gl.uniform3fv(glow.u('u_col'), coreCol);
    gl.uniform1f(glow.u('u_i'), light.I);
    gl.uniform1f(glow.u('u_k'), 5.0);
    gl.uniform1f(glow.u('u_aniso'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (light.beam > 0.02) {
      gl.uniform2f(glow.u('u_size'), (size * 0.12) / aspect, size * 2.6);
      gl.uniform1f(glow.u('u_i'), light.beam * 0.5);
      gl.uniform1f(glow.u('u_k'), 3.0);
      gl.uniform1f(glow.u('u_aniso'), 0.09);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disableVertexAttribArray(aQ);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u('u_vp'), false, vp);
    gl.uniform3fv(prog.u('u_cam'), e);
    gl.uniform3fv(prog.u('u_core'), CORE);
    gl.uniform1f(prog.u('u_coreI'), light.I);
    gl.uniform3fv(prog.u('u_coreCol'), coreCol);
    gl.uniform1f(prog.u('u_gold'), light.gold + sweep);
    gl.uniform1f(prog.u('u_sweep'), sweep > 0 ? -1.6 + (1 - sweep) * 3.4 : 0);
    gl.uniform1f(prog.u('u_seam'), light.seam);
    const scanLen = pose === 'executing' ? 0.7 : 2.4;
    gl.uniform1f(prog.u('u_scanY'), 1.4 - ((t % scanLen) / scanLen) * 2.9);
    gl.uniform1f(prog.u('u_scanOn'), still ? 0 : light.scan);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
    const aP = prog.a('a_pos'),
      aN = prog.a('a_nrm'),
      aE = prog.a('a_edge');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(aN);
    gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(aE);
    gl.vertexAttribPointer(aE, 1, gl.FLOAT, false, 28, 24);
    for (const arc of cur) {
      const m = model(arc);
      gl.uniformMatrix4fv(prog.u('u_model'), false, m);
      gl.uniformMatrix3fv(prog.u('u_nm'), false, new Float32Array([0, 1, 2, 4, 5, 6, 8, 9, 10].map((j) => m[j]!)));
      gl.drawArrays(gl.TRIANGLES, 0, count);
    }
  }

  function drawSvg(t: number) {
    if (!svg) return;
    const sweep = Math.max(0, 1 - (t - sweepAt) / 1.3);
    svg.querySelectorAll<SVGGElement>('.roxi-halo-arc').forEach((g, i) => {
      const c = cur[i]!;
      // Front view of the same arcs: the turn about their radius squeezes them, the swing narrows them.
      g.setAttribute(
        'transform',
        `translate(${CORE[0]} ${CORE[1]}) rotate(${(c.phi * 180) / Math.PI}) translate(${c.off + R} 0) scale(${Math.max(0.2, Math.abs(Math.cos(c.ty)))} 1) translate(${-R} 0) scale(${c.s} ${c.s * Math.max(0.12, Math.abs(Math.cos(c.tx)))})`,
      );
      g.firstElementChild?.setAttribute('stroke-opacity', String(Math.min(1, 0.45 + light.gold * 1.4 + sweep)));
    });
    const lightEl = svg.querySelector<SVGCircleElement>('.roxi-halo-light');
    if (lightEl) {
      lightEl.setAttribute('r', String(0.6 * light.R));
      lightEl.setAttribute('opacity', String(Math.min(1, 0.35 + light.I * 0.45)));
      lightEl.setAttribute('fill', light.amber > 0.5 ? '#d9895a' : `url(#${ids}g)`);
    }
  }

  function frame(now: number) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    step(dt, t);
    if (gl) drawGL(t);
    else drawSvg(t);
    // Reduced motion: still frames, redrawn a few times a second so the pose still follows what she is doing.
    if (still) timer = window.setTimeout(() => (raf = requestAnimationFrame(frame)), 400);
    else raf = requestAnimationFrame(frame);
  }
  const onVisible = () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    if (!document.hidden && !stopped) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    canvas.remove();
    svg?.remove();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

/** Roxi's face in her panel while the Halo look is on. `level` is the live voice loudness the panel already measures (0–1). */
export function RoxiHalo({ level, className }: { level: MutableRefObject<number>; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const ids = `rh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useEffect(() => {
    if (!host.current) return;
    return startHalo(host.current, level, ids);
  }, [level, ids]);
  return <div ref={host} className={`roxi-halo${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
