'use client';

import { useEffect, useRef } from 'react';

/**
 * The home page's opening shot: gold dust and fireflies drifting through
 * real depth in front of the night landscape, the camera easing with the
 * pointer (or swaying on its own on a phone) and pushing forward as you
 * scroll.
 *
 * It is one small WebGL program and no library, because most of the people
 * Yavaya is for are on inexpensive Android phones and mobile data:
 *
 * - it starts only after the page has painted, so the photograph stays the
 *   first thing on screen;
 * - it draws fewer particles at a lower resolution on small or modest
 *   devices, and nothing at all with reduced motion or Data Saver on;
 * - it stops drawing whenever the hero is off screen or the tab is hidden.
 *
 * The canvas is opaque black and blended with `screen`, so black adds
 * nothing and every particle reads as light over the photograph. Without
 * WebGL the hero is simply the photograph, as before.
 */

const VERTEX = `
attribute vec4 a_seed;
uniform float u_time;
uniform vec2 u_cam;
uniform float u_push;
uniform vec2 u_res;
uniform float u_dpr;
varying float v_alpha;
varying float v_soft;
varying vec3 v_color;

void main() {
  // Depth runs from far (1) to near (0) and wraps, so the field flows towards the camera forever.
  float z01 = fract(a_seed.z - u_time * (0.012 + a_seed.w * 0.018) - u_push);
  float z = mix(0.18, 2.6, z01);

  vec3 p = vec3((a_seed.x * 2.0 - 1.0) * 3.2, (a_seed.y * 2.0 - 1.0) * 1.5, z);
  p.x += sin(u_time * 0.21 + a_seed.w * 31.0) * 0.06;
  p.y += cos(u_time * 0.17 + a_seed.x * 27.0) * 0.05 + u_time * 0.004 * (a_seed.w - 0.5);

  vec2 screen = (p.xy - u_cam * (1.0 - z01 * 0.6)) / p.z;
  float aspect = u_res.x / u_res.y;
  gl_Position = vec4(screen.x / aspect, screen.y, 0.0, 1.0);

  // A lens focused a little way in: what is nearer or further is larger, softer and dimmer.
  float focus = 0.95;
  float blur = clamp(abs(p.z - focus) * 0.9, 0.0, 1.0);
  float firefly = step(0.93, a_seed.w);
  float base = mix(1.4, 3.2, a_seed.x * a_seed.y) + firefly * 2.0;
  gl_PointSize = clamp(base * (1.0 + blur * 5.0) / p.z * u_dpr * (u_res.y / 900.0), 1.0, 64.0 * u_dpr);

  float fade = smoothstep(1.0, 0.82, z01) * smoothstep(0.0, 0.12, z01);
  float twinkle = 0.65 + 0.35 * sin(u_time * (1.2 + a_seed.z * 2.0) + a_seed.y * 40.0);
  v_alpha = fade * mix(0.55, 1.0, twinkle) * mix(0.9, 0.22, blur) * (1.0 + firefly * 0.8);
  v_soft = blur;
  v_color = mix(vec3(1.0, 0.80, 0.42), vec3(1.0, 0.95, 0.80), a_seed.y);
  v_color = mix(v_color, vec3(1.0, 0.86, 0.45), firefly);
}
`;

const FRAGMENT = `
precision mediump float;
varying float v_alpha;
varying float v_soft;
varying vec3 v_color;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  // In focus: a bright point with a glow. Out of focus: a bokeh disc with a faint rim.
  float core = exp(-d * d * mix(7.0, 1.6, v_soft));
  float disc = smoothstep(1.0, 0.82, d) * (0.35 + 0.25 * smoothstep(0.55, 0.95, d));
  float shape = mix(core, disc, v_soft);
  gl_FragColor = vec4(v_color * shape * v_alpha, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

type Connection = { saveData?: boolean };

export function HeroCinema() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ((navigator as Navigator & { connection?: Connection }).connection?.saveData) return;

    let disposed = false;
    let cleanup = () => {};

    const start = () => {
      if (disposed) return;
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
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

      // Modest devices get a lighter scene; nothing about it is essential.
      const small = window.innerWidth < 700;
      const cores = navigator.hardwareConcurrency || 4;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
      const modest = small || cores <= 4 || memory <= 2;
      const count = modest ? 260 : 720;
      const dpr = Math.min(window.devicePixelRatio || 1, modest ? 1 : 1.5);

      const seeds = new Float32Array(count * 4);
      for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
      const seed = gl.getAttribLocation(program, 'a_seed');
      gl.enableVertexAttribArray(seed);
      gl.vertexAttribPointer(seed, 4, gl.FLOAT, false, 0, 0);

      const u = {
        time: gl.getUniformLocation(program, 'u_time'),
        cam: gl.getUniformLocation(program, 'u_cam'),
        push: gl.getUniformLocation(program, 'u_push'),
        res: gl.getUniformLocation(program, 'u_res'),
        dpr: gl.getUniformLocation(program, 'u_dpr'),
      };
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 1);

      const resize = () => {
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
        gl.uniform2f(u.res, width, height);
        gl.uniform1f(u.dpr, dpr);
      };
      resize();
      const sizer = new ResizeObserver(resize);
      sizer.observe(canvas);

      // The camera eases towards the pointer, so motion stays smooth whatever the input rate.
      const target = { x: 0, y: 0 };
      const cam = { x: 0, y: 0 };
      let push = 0;
      const onPointer = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        target.x = (event.clientX / window.innerWidth) * 2 - 1;
        target.y = -((event.clientY / window.innerHeight) * 2 - 1);
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      let visible = true;
      let frame = 0;
      const t0 = performance.now();
      const draw = (now: number) => {
        frame = 0;
        if (!visible || document.hidden) return;
        const t = (now - t0) / 1000;
        // With no mouse, the camera drifts on its own — slowly, like a crane shot.
        const sway = { x: Math.sin(t * 0.11) * 0.25, y: Math.cos(t * 0.08) * 0.12 };
        cam.x += (target.x * 0.35 + sway.x - cam.x) * 0.04;
        cam.y += (target.y * 0.2 + sway.y - cam.y) * 0.04;
        const scrolled = Math.min(1, window.scrollY / Math.max(1, canvas.clientHeight));
        push += (scrolled * 0.35 - push) * 0.08;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(u.time, t);
        gl.uniform2f(u.cam, cam.x, cam.y);
        gl.uniform1f(u.push, push);
        gl.drawArrays(gl.POINTS, 0, count);
        frame = requestAnimationFrame(draw);
      };
      const resume = () => {
        if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
      };
      const watcher = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        resume();
      });
      watcher.observe(canvas);
      document.addEventListener('visibilitychange', resume);
      canvas.classList.add('is-on');
      resume();

      cleanup = () => {
        if (frame) cancelAnimationFrame(frame);
        sizer.disconnect();
        watcher.disconnect();
        window.removeEventListener('pointermove', onPointer);
        document.removeEventListener('visibilitychange', resume);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    // After first paint, so the photograph and the words are never waiting on this.
    const idle = 'requestIdleCallback' in window;
    const handle = idle ? window.requestIdleCallback(start, { timeout: 1200 }) : window.setTimeout(start, 400);

    return () => {
      disposed = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      cleanup();
    };
  }, []);

  return <canvas ref={ref} className="hero-cinema" aria-hidden="true" />;
}
