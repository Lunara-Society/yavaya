import type { Runtime } from './runtime';

/**
 * The thumbs (docs/PLAY.md): the stick on the left, Saltar on the right, and
 * a button for whatever is in reach ("Entrar", "Sentarse") that appears only
 * when there is something to do. The keyboard does the same on a computer.
 *
 * Lessons from the owner's phone, each kept on purpose:
 * - The stick waits, always visible, at the bottom left, and a thumb on its
 *   arrow runs at once. A stick that appeared under the thumb was pressed in
 *   its centre every time, and the run was a crawl.
 * - It is a direction, not a throttle: past a small dead middle the run is
 *   full speed, and near enough to straight ahead (about 20°) is straight
 *   ahead.
 * - Every tap of Saltar is a whole jump, and a jump pressed a moment before
 *   landing or after leaving an edge still counts (the body's job).
 * - One thumb can leave the stick to press Saltar: where the stick last
 *   pointed is remembered for a moment, and the jump takes that run.
 */
export type Controls = {
  /** Where the player is asking to go: x and z (−1…1), screen-right being −x. */
  axis(): { x: number; z: number; asked: number };
  /** A jump was pressed within the last moment and has not been used. */
  jumpWaiting(): boolean;
  useJump(): void;
  /** Ages the jump buffer; call once per simulation step. */
  tick(dt: number): void;
  /** Where the stick pointed when the thumb left it, and when (performance.now). */
  released(): { x: number; z: number; at: number };
  /** Shows the interact button with this label and action, or hides it (null). */
  offer(label: string | null, action?: () => void): void;
  show(visible: boolean): void;
  dispose(): void;
};

const STICK_REACH = 52;
const STICK_DEAD = 9;
const STICK_HOME_GRAB = 100;
const JUMP_BUFFER = 0.14;

export function createControls(runtime: Runtime, labels: { jump: string }): Controls {
  const host = runtime.host;
  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) => {
    target.addEventListener(type, handler as EventListener, options);
    off.push(() => target.removeEventListener(type, handler as EventListener, options));
  };

  const stick = document.createElement('div');
  stick.className = 'yp-stick';
  const knob = document.createElement('div');
  knob.className = 'yp-knob';
  stick.append(knob);
  const jumpButton = document.createElement('button');
  jumpButton.type = 'button';
  jumpButton.className = 'yp-jump';
  jumpButton.textContent = labels.jump;
  const actButton = document.createElement('button');
  actButton.type = 'button';
  actButton.className = 'yp-act';
  actButton.hidden = true;
  host.append(stick, jumpButton, actButton);

  const input = { x: 0, z: 0 };
  const keys = new Set<string>();
  let buffered = 0;
  let released = { x: 0, z: 0, at: -1e9 };
  let enabled = true;
  let action: (() => void) | null = null;

  const pressJump = () => {
    if (enabled) buffered = JUMP_BUFFER;
  };

  // --- The stick ---
  let stickId = -1;
  let stickX = 0;
  let stickY = 0;
  const home = () => {
    const box = host.getBoundingClientRect();
    return { x: box.left + 26 + 62, y: box.bottom - 40 - 62 };
  };
  const showStickAt = (x: number, y: number) => {
    const box = host.getBoundingClientRect();
    stick.style.left = `${x - box.left}px`;
    stick.style.top = `${y - box.top}px`;
  };
  const park = () => {
    const spot = home();
    showStickAt(spot.x, spot.y);
    knob.style.transform = 'translate(-50%, -50%)';
    stick.classList.remove('is-on');
  };
  const steer = (clientX: number, clientY: number) => {
    let dx = clientX - stickX;
    let dy = clientY - stickY;
    const length = Math.hypot(dx, dy);
    if (length > STICK_REACH) {
      dx = (dx / length) * STICK_REACH;
      dy = (dy / length) * STICK_REACH;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const run = length < STICK_DEAD ? 0 : 1 / length;
    input.x = -(clientX - stickX) * run;
    input.z = -(clientY - stickY) * run;
    if (input.z > 0.94) {
      input.x = 0;
      input.z = 1;
    }
  };
  listen(
    host,
    'pointerdown',
    ((event: PointerEvent) => {
      if (!enabled) return;
      if ((event.target as Element).closest('button, a, .yp-sheet')) return;
      if (event.pointerType === 'mouse') return;
      const box = host.getBoundingClientRect();
      if (event.clientX - box.left < box.width * 0.55 && stickId === -1) {
        stickId = event.pointerId;
        const spot = home();
        const grabbed = Math.hypot(event.clientX - spot.x, event.clientY - spot.y) < STICK_HOME_GRAB;
        stickX = grabbed ? spot.x : event.clientX;
        stickY = grabbed ? spot.y : event.clientY;
        showStickAt(stickX, stickY);
        stick.classList.add('is-on');
        steer(event.clientX, event.clientY);
      } else if (event.clientX - box.left >= box.width * 0.55) {
        pressJump();
      }
    }) as (event: never) => void,
    { passive: true },
  );
  listen(
    host,
    'pointermove',
    ((event: PointerEvent) => {
      if (event.pointerId === stickId) steer(event.clientX, event.clientY);
    }) as (event: never) => void,
    { passive: true },
  );
  const lift = (event: PointerEvent) => {
    if (event.pointerId !== stickId) return;
    stickId = -1;
    released = { x: input.x, z: input.z, at: performance.now() };
    input.x = 0;
    input.z = 0;
    park();
  };
  listen(host, 'pointerup', lift as (event: never) => void);
  listen(host, 'pointercancel', lift as (event: never) => void);
  listen(jumpButton, 'pointerdown', ((event: PointerEvent) => {
    event.stopPropagation();
    pressJump();
  }) as (event: never) => void);
  listen(actButton, 'click', (() => action?.()) as (event: never) => void);

  // --- Keys ---
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    if (event.repeat || !enabled) return;
    if ((event.target as Element | null)?.closest?.('input, textarea')) return;
    keys.add(event.code);
    if (event.code === 'Space') {
      event.preventDefault();
      pressJump();
    }
    if ((event.code === 'KeyE' || event.code === 'Enter') && action && !actButton.hidden) action();
  }) as (event: never) => void);
  listen(window, 'keyup', ((event: KeyboardEvent) => keys.delete(event.code)) as (event: never) => void);
  listen(window, 'resize', (() => stickId === -1 && park()) as (event: never) => void);
  park();

  return {
    axis() {
      let x = input.x;
      let z = input.z;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) x += 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) x -= 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) z += 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) z -= 1;
      const asked = Math.hypot(x, z);
      if (asked > 1) {
        x /= asked;
        z /= asked;
      }
      return { x, z, asked: Math.min(1, asked) };
    },
    jumpWaiting: () => buffered > 0,
    useJump() {
      buffered = 0;
    },
    tick(dt) {
      buffered -= dt;
    },
    released: () => released,
    offer(label, next) {
      action = label ? (next ?? null) : null;
      actButton.hidden = !label;
      if (label && actButton.textContent !== label) actButton.textContent = label;
    },
    show(visible) {
      enabled = visible;
      stick.hidden = !visible;
      jumpButton.hidden = !visible;
      if (!visible) {
        actButton.hidden = true;
        input.x = input.z = 0;
        keys.clear();
        stickId = -1;
      }
    },
    dispose() {
      off.forEach((undo) => undo());
      stick.remove();
      jumpButton.remove();
      actButton.remove();
    },
  };
}
