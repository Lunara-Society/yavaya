'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Roxi's face: a sphere of liquid gold that breathes while she waits, swirls
 * while she thinks, and swells and sends out rings with the voice of whoever
 * is talking.
 *
 * One small fragment shader on a canvas no bigger than the orb itself, no
 * library. It runs only while the panel is open, stops when the tab is
 * hidden, and caps its resolution on modest phones. With reduced motion it
 * draws one still frame; without WebGL the CSS sphere underneath (the same
 * one the launcher uses) is what shows.
 */

export type OrbState = 'idle' | 'listening' | 'speaking' | 'thinking';

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform float u_level;
uniform float u_think;
uniform float u_speak;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}

void main() {
  float px = 2.0 / min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float t = u_time;
  float d = length(uv);
  float ang = atan(uv.y, uv.x);

  // The rim breathes on its own and ripples with the voice.
  float r = 0.6 + 0.018 * sin(t * 1.3)
    + u_level * 0.085
    + u_level * 0.03 * sin(ang * 5.0 + t * 4.0)
    + u_think * 0.016 * sin(ang * 3.0 - t * 5.0);

  vec3 champagne = vec3(1.0, 0.95, 0.76);
  vec3 gold = vec3(0.96, 0.77, 0.27);
  vec4 color = vec4(0.0);

  // Halo: tight at rest, wide and bright with sound.
  float halo = exp(-max(d - r, 0.0) * mix(8.5, 3.8, u_level)) * (0.42 + 0.7 * u_level + 0.25 * u_think);
  color += vec4(gold * halo, halo) * 0.6;

  // Rings that travel outwards while Roxi speaks.
  float wave = pow(0.5 + 0.5 * sin((d - t * 0.45) * 18.0), 8.0);
  float rings = wave * smoothstep(r + 0.02, r + 0.08, d) * smoothstep(1.0, r + 0.1, d) * u_speak * (0.35 + u_level);
  color += vec4(champagne * rings, rings) * 0.85;

  if (d < r) {
    vec3 n = normalize(vec3(uv, sqrt(max(r * r - d * d, 0.0))));
    float c = cos(t * 0.22);
    float s = sin(t * 0.22);
    vec3 q = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
    float flow = 0.16 + u_level * 0.45 + u_think * 0.55;
    float warp = fbm(q * 2.2 + vec3(0.0, t * flow, t * flow * 0.6));
    float vein = fbm(q * 3.4 + warp * 2.3 + vec3(t * 0.08));

    // Mostly gold, with darker currents and bright champagne veins running through it.
    vec3 deep = vec3(0.42, 0.27, 0.06);
    vec3 bronze = vec3(0.74, 0.52, 0.13);
    vec3 metal = mix(deep, bronze, smoothstep(0.15, 0.42, vein));
    metal = mix(metal, gold, smoothstep(0.36, 0.6, vein));
    metal = mix(metal, champagne, smoothstep(0.62, 0.86, vein));

    vec3 light = normalize(vec3(-0.45, 0.55, 0.7));
    float diffuse = clamp(dot(n, light), 0.0, 1.0);
    float specular = pow(clamp(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 26.0);
    float fresnel = pow(1.0 - n.z, 2.4);
    vec3 shade = metal * (0.5 + 0.7 * diffuse) + champagne * specular * 0.9 + gold * fresnel * (0.6 + u_level * 0.9 + u_think * 0.35);

    float inside = smoothstep(r, r - px * 1.5, d);
    color = mix(color, vec4(shade, 1.0), inside);
  }

  color.a = clamp(color.a, 0.0, 1.0);
  gl_FragColor = vec4(min(color.rgb, vec3(color.a)), color.a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function RoxiOrb({
  state,
  level,
  className,
}: {
  state: OrbState;
  /** How loud whoever is talking is, 0 to 1, read every frame. */
  level: MutableRefObject<number>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // One triangle that covers the canvas.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, 'u_res'),
      time: gl.getUniformLocation(program, 'u_time'),
      level: gl.getUniformLocation(program, 'u_level'),
      think: gl.getUniformLocation(program, 'u_think'),
      speak: gl.getUniformLocation(program, 'u_speak'),
    };
    gl.clearColor(0, 0, 0, 0);

    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const modest = window.innerWidth < 700 || cores <= 4 || memory <= 2;
    const dpr = Math.min(window.devicePixelRatio || 1, modest ? 1.25 : 2);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(u.res, width, height);
    };

    // Everything eases, so the orb never jumps between states.
    const eased = { level: 0, think: 0, speak: 0 };
    let frame = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      frame = 0;
      if (document.hidden) return;
      const current = stateRef.current;
      eased.level += (Math.min(1, level.current) - eased.level) * (level.current > eased.level ? 0.35 : 0.12);
      eased.think += ((current === 'thinking' ? 1 : 0) - eased.think) * 0.06;
      eased.speak += ((current === 'speaking' ? 1 : 0) - eased.speak) * 0.08;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.time, ((now - t0) / 1000) % 1000);
      gl.uniform1f(u.level, eased.level);
      gl.uniform1f(u.think, eased.think);
      gl.uniform1f(u.speak, eased.speak);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still) frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const sizer = new ResizeObserver(() => {
      resize();
      // A still orb is redrawn at its new size; a moving one is next frame anyway.
      if (still) resume();
    });
    resize();
    sizer.observe(canvas);
    document.addEventListener('visibilitychange', resume);
    canvas.dataset.on = '';
    resume();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      sizer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      delete canvas.dataset.on;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [level]);

  return (
    <span className={`roxi-orb${className ? ` ${className}` : ''}`} data-state={state} aria-hidden="true">
      <span className="roxi-sphere" />
      <canvas ref={canvasRef} className="roxi-orb-canvas" />
    </span>
  );
}
