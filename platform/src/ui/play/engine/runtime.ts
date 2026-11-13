import * as THREE from 'three';

/**
 * The screen and the clock every Yavaya Play activity runs on (docs/PLAY.md).
 *
 * One renderer for the whole visit: the studio, the course and (soon) the
 * plaza are "modes" that each bring a scene, a camera and a step, and the
 * runtime shows one at a time. A phone keeps one graphics context, and
 * switching activity costs a scene, never a new context.
 *
 * - A fixed step for the simulation (120 a second), so a jump is the same on
 *   a slow phone as on a fast one; drawing happens as often as the phone can.
 *   Up to a quarter of a second is caught up, so a phone drawing few frames
 *   plays at real speed rather than in slow motion.
 * - It draws at most 1.5 pixels per point, and fewer if frames come slowly.
 * - The page never zooms, and if a browser magnifies it anyway the game
 *   keeps itself inside what can be seen (the owner's first real-phone run).
 */

export type Mode = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The simulation, at a fixed step. */
  step?(dt: number): void;
  /** Once per drawn frame, before drawing: cameras, animation, the screen over the game. */
  frame?(dt: number, now: number): void;
  /** The camera's field of view for a screen of this shape. */
  fov?(aspect: number): number;
  dispose(): void;
  /** For the browser tests: where things stand, read-only. */
  state?(): unknown;
};

export type Runtime = {
  host: HTMLElement;
  renderer: THREE.WebGLRenderer;
  listen(target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions): void;
  show(mode: Mode): void;
  /** A line in the `?debug` box, for whoever asked for one. */
  debug: ((line: string) => void) | null;
  dispose(): void;
};

export const STEP = 1 / 120;

export function createRuntime(host: HTMLElement): Runtime {
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.domElement.className = 'yp-canvas';
  host.append(renderer.domElement);

  const off: Array<() => void> = [];
  const listen: Runtime['listen'] = (target, type, handler, options) => {
    target.addEventListener(type, handler as EventListener, options);
    off.push(() => target.removeEventListener(type, handler as EventListener, options));
  };

  let mode: Mode | null = null;
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    if (!mode) return;
    const aspect = width / Math.max(1, height);
    mode.camera.aspect = aspect;
    mode.camera.fov = mode.fov ? mode.fov(aspect) : aspect < 0.8 ? 62 : 55;
    mode.camera.updateProjectionMatrix();
  };
  listen(window, 'resize', resize as (event: never) => void);

  const stage = (host.closest('.yp') as HTMLElement | null) ?? host;
  const view = window.visualViewport;
  const fit = () => {
    if (!view) return;
    const zoomed = view.scale > 1.01;
    stage.style.left = zoomed ? `${view.offsetLeft}px` : '';
    stage.style.top = zoomed ? `${view.offsetTop}px` : '';
    stage.style.width = zoomed ? `${view.width}px` : '';
    stage.style.height = zoomed ? `${view.height}px` : '';
    stage.style.right = zoomed ? 'auto' : '';
    stage.style.bottom = zoomed ? 'auto' : '';
    resize();
  };
  if (view) {
    listen(view, 'resize', fit as (event: never) => void);
    listen(view, 'scroll', fit as (event: never) => void);
    fit();
  }
  // Two thumbs are steering and jumping, never a pinch; two quick taps are two jumps, never a zoom.
  // A sheet of choices still scrolls with one finger.
  const noZoom = (event: Event) => {
    const touches = (event as TouchEvent).touches;
    if (touches && touches.length === 1 && (event.target as Element | null)?.closest?.('.yp-sheet')) return;
    if (event.cancelable) event.preventDefault();
  };
  listen(stage, 'touchmove', noZoom as (event: never) => void, { passive: false });
  listen(stage, 'gesturestart', noZoom as (event: never) => void, { passive: false });
  listen(stage, 'dblclick', noZoom as (event: never) => void);

  const debugBox = new URLSearchParams(window.location.search).has('debug') ? document.createElement('div') : null;
  let debugLines: string[] = [];
  if (debugBox) {
    debugBox.className = 'yp-debug';
    host.append(debugBox);
  }

  let frame = 0;
  let last = 0;
  let owed = 0;
  let slow = 0;
  let fps = 60;
  let stopped = false;
  const draw = (now: number) => {
    if (stopped) return;
    frame = window.requestAnimationFrame(draw);
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (!mode) return;
    owed += dt;
    while (owed >= STEP) {
      mode.step?.(STEP);
      owed -= STEP;
    }
    mode.frame?.(dt, now);
    renderer.render(mode.scene, mode.camera);
    if (debugBox) {
      fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
      debugBox.textContent = [`${fps.toFixed(0)} fps · x${ratio} · ${renderer.info.render.calls} draws`, ...debugLines].join('\n');
      debugLines = [];
    }
    // A phone that cannot keep up draws fewer pixels rather than fewer frames.
    slow = dt > 0.04 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 50 && ratio > 1) {
      ratio = Math.max(1, ratio - 0.25);
      renderer.setPixelRatio(ratio);
      resize();
      slow = 0;
    }
  };
  frame = window.requestAnimationFrame(draw);
  listen(document, 'visibilitychange', (() => {
    last = 0;
    owed = 0;
  }) as (event: never) => void);

  return {
    host,
    renderer,
    listen,
    debug: debugBox ? (line: string) => debugLines.push(line) : null,
    show(next) {
      const previous = mode;
      mode = next;
      owed = 0;
      resize();
      previous?.dispose();
      (host as HTMLElement & { ypState?: () => unknown }).ypState = () => mode?.state?.();
    },
    dispose() {
      stopped = true;
      window.cancelAnimationFrame(frame);
      off.forEach((undo) => undo());
      mode?.dispose();
      mode = null;
      renderer.dispose();
      host.replaceChildren();
    },
  };
}

/** Frees everything a scene holds on the graphics card. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
