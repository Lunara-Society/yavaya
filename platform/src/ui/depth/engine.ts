import { createPhotoRenderer, type PhotoRenderer } from './photo';
import { DEPTH_CSS } from './styles';

/**
 * The districts in depth (docs/DISTRICTS-3D.md): the classic home page's
 * district cards, given near and far.
 *
 * Nothing here renders the page. The cards arrive from the server exactly as
 * the classic design draws them, and this is added afterwards, only on a
 * device that can afford it (gate.tsx), with its styles (styles.ts): every
 * card is still the same link to its district, and stopping this — a slow device, a lost graphics context,
 * someone asking for less motion — puts the classic cards back.
 *
 * One idea runs through all of it: where is the viewer's eye, relative to the
 * card? Everything follows from that single answer, so the parts agree.
 *
 * - Scrolling: a card above the middle of the screen is seen from below.
 * - A phone tilted in the hand is seen from the side it leans away from.
 * - A card under the mouse turns to face the pointer (a real rotation, in
 *   CSS), which puts the eye on its other side.
 *
 * From the eye: the photograph's near parts shift away from it and its far
 * parts toward it (photo.ts); the medallion, which floats in front, slides
 * away from it; and the light on the card's surface follows it, as your own
 * reflection does in glass.
 *
 * Three levels, each one a complete page:
 *   2  everything above;
 *   1  no WebGL: the photograph slides behind its frame as a whole;
 *   0  the classic cards.
 * The level only ever goes down, and only when frames are measurably slow.
 */

/** Degrees a card turns toward the mouse; fewer under a finger, which is also scrolling. */
const TILT = 6;
const TOUCH_TILT = 3.2;
/** How far a card comes toward the mouse, in pixels of depth, and how much it gives under a press. */
const LIFT = 16;
const PRESS = 0.024;
/** How much each cause moves the eye (1 is the edge of the card). */
const SCROLL_EYE = 0.75;
const POINTER_EYE = 0.9;
const AMBIENT_EYE = 0.11;
/** Pixels the medallion slides against the card, and the whole photograph behind its frame at level 1. */
const MEDAL_REACH = 6;
const FLAT_REACH = 9;
/** Degrees of leaning that move the eye all the way, and how soon a new way of holding the phone becomes "level". */
const LEAN_RANGE = 14;
const LEAN_SETTLE_MS = 2600;
/**
 * A phone in a hand is never still. Leaning less than this from how it is
 * held moves nothing, a change smaller than LEAN_STEP is not worth a frame,
 * and only a lean past LEAN_MEANT counts as the person doing something.
 */
const LEAN_DEAD = 0.6;
const LEAN_STEP = 0.3;
const LEAN_MEANT = 1.8;
/** The pictures keep drifting this long after the last touch, scroll or lean, then rest: a still page draws nothing. */
const AMBIENT_MS = 12_000;
/** Slower than this, on average, across two runs of frames, and a level is given up. */
const SLOW_FRAME_MS = 30;
const JUDGED_FRAMES = 45;

/** Remembered for the visit, so a phone that struggled is not asked again on the next page. */
export const DEPTH_MEMORY = 'yavaya.depth';

type Level = 0 | 1 | 2;

type Card = {
  key: string;
  li: HTMLElement;
  link: HTMLElement;
  art: HTMLElement;
  photo: HTMLImageElement | null;
  emblem: HTMLElement | null;
  /** Where the card is on the page, measured from layout so that its own movement never feeds back. */
  x: number;
  y: number;
  w: number;
  h: number;
  focusX: number;
  focusY: number;
  near: boolean;
  seen: boolean;
  /** Where the pointer is on the card (−1…1), whether it hovers and whether it presses: the targets. */
  aimX: number;
  aimY: number;
  hover: number;
  held: number;
  touch: boolean;
  /** The same, eased frame by frame. */
  tiltX: number;
  tiltY: number;
  lift: number;
  press: number;
  glow: number;
  canvas: HTMLCanvasElement | null;
  pen: CanvasRenderingContext2D | null;
  medal: HTMLImageElement | null;
  glare: HTMLElement | null;
  glint: HTMLElement | null;
  glintAt: number;
  phase: number;
  /** The eye the photograph was last drawn from: a card nothing has moved is not drawn again. */
  drawnX: number;
  drawnY: number;
};

const clamp = (value: number, min = -1, max = 1) => Math.min(max, Math.max(min, value));

function remembered(): Level {
  try {
    const value = window.sessionStorage.getItem(DEPTH_MEMORY);
    return value === '0' ? 0 : value === '1' ? 1 : 2;
  } catch {
    return 2;
  }
}

function remember(level: Level) {
  try {
    window.sessionStorage.setItem(DEPTH_MEMORY, String(level));
  } catch {
    // Private browsing with storage refused: the next page asks again, which is only a wasted second.
  }
}

/** Starts the depth on the district section; the returned function puts the classic cards back. */
export function startDepth(root: HTMLElement): () => void {
  const list = root.querySelector<HTMLElement>('.hx-cards');
  let level = remembered();
  if (!list || level === 0) return () => undefined;

  const off: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) => {
    target.addEventListener(type, handler as EventListener, options);
    off.push(() => target.removeEventListener(type, handler as EventListener, options));
  };

  /* A style is written only when it changes: most frames move two or three cards, not thirteen. */
  const written = new WeakMap<HTMLElement, Map<string, string>>();
  const put = (element: HTMLElement, name: string, value: string) => {
    let known = written.get(element);
    if (!known) {
      known = new Map();
      written.set(element, known);
    }
    if (known.get(name) === value) return;
    known.set(name, value);
    element.style.setProperty(name, value);
  };

  const cards: Card[] = [];
  list.querySelectorAll<HTMLElement>('li[data-district]').forEach((li, index) => {
    const link = li.querySelector<HTMLElement>('.hx-card-link');
    const art = li.querySelector<HTMLElement>('.hx-card-art');
    if (!link || !art) return;
    cards.push({
      key: li.dataset.district ?? '',
      li,
      link,
      art,
      photo: art.querySelector<HTMLImageElement>('img.hx-card-photo'),
      emblem: li.querySelector<HTMLElement>('.hx-emblem'),
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      focusX: 0.5,
      focusY: 0.5,
      near: false,
      seen: false,
      aimX: 0,
      aimY: 0,
      hover: 0,
      held: 0,
      touch: false,
      tiltX: 0,
      tiltY: 0,
      lift: 0,
      press: 0,
      glow: 0,
      canvas: null,
      pen: null,
      medal: null,
      glare: null,
      glint: null,
      glintAt: 0,
      // Each card drifts on its own beat, so the row never sways in step.
      phase: index * 1.7,
      drawnX: 9,
      drawnY: 9,
    });
  });
  if (!cards.length) return () => undefined;

  // The styles come with the engine (styles.ts says why) and wait for data-depth="on".
  if (!document.querySelector('style[data-depth-styles]')) {
    const styles = document.createElement('style');
    styles.dataset.depthStyles = '';
    styles.textContent = DEPTH_CSS;
    document.head.append(styles);
  }

  let renderer: PhotoRenderer | null = level === 2 ? createPhotoRenderer() : null;
  if (!renderer) level = 1;
  root.dataset.depth = 'on';
  root.dataset.depthLevel = String(level);

  // --- Where everything is ------------------------------------------------------

  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let ratio = Math.min(window.devicePixelRatio || 1, 2);
  const measure = () => {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const card of cards) {
      // Layout positions, summed up the tree: a bounding box would include the card's own tilt and rise.
      let x = 0;
      let y = 0;
      for (let node: HTMLElement | null = card.li; node; node = node.offsetParent as HTMLElement | null) {
        x += node.offsetLeft;
        y += node.offsetTop;
      }
      card.x = x;
      card.y = y;
      card.w = card.li.offsetWidth;
      card.h = card.li.offsetHeight;
      if (card.photo) {
        const [fx = '50%', fy = '50%'] = getComputedStyle(card.photo).objectPosition.split(' ');
        card.focusX = fx.endsWith('%') ? Number.parseFloat(fx) / 100 : 0.5;
        card.focusY = fy.endsWith('%') ? Number.parseFloat(fy) / 100 : 0.5;
      }
      if (card.canvas) size(card);
    }
  };
  const size = (card: Card) => {
    if (!card.canvas) return;
    const width = Math.max(1, Math.round(card.w * ratio));
    const height = Math.max(1, Math.round(card.h * ratio));
    if (card.canvas.width !== width || card.canvas.height !== height) {
      card.canvas.width = width;
      card.canvas.height = height;
      // Resizing a canvas empties it: draw this card again whether or not anything moved.
      card.drawnX = 9;
      card.drawnY = 9;
    }
  };
  measure();

  // --- What each card is given as it comes near -----------------------------------

  const dress = (card: Card) => {
    if (!card.glare) {
      const glare = document.createElement('span');
      glare.className = 'dz-glare';
      glare.setAttribute('aria-hidden', 'true');
      card.link.append(glare);
      card.glare = glare;
    }
    if (!card.medal && card.emblem && card.key) {
      const emblem = card.emblem;
      const medal = new Image();
      medal.className = 'dz-medal';
      medal.alt = '';
      medal.decoding = 'async';
      medal.onload = () => {
        emblem.classList.add('dz-medalled');
        const glint = document.createElement('span');
        glint.className = 'dz-glint';
        emblem.append(glint);
        card.glint = glint;
        if (card.near) shine(card, 500);
      };
      // No medallion (a district added without one): the drawn mark stays, floating as it is.
      medal.onerror = () => medal.remove();
      medal.src = `/art/depth/medal-${card.key}.webp`;
      emblem.append(medal);
      card.medal = medal;
    }
    if (renderer && card.photo && card.key && !card.canvas) {
      const canvas = document.createElement('canvas');
      canvas.className = 'dz-photo';
      canvas.setAttribute('aria-hidden', 'true');
      const pen = canvas.getContext('2d', { alpha: false });
      if (pen) {
        card.photo.after(canvas);
        card.canvas = canvas;
        card.pen = pen;
        size(card);
        renderer.prepare(card.key, card.photo, `/art/depth/home-card-${card.key}.webp`);
      }
    }
  };

  /** Far away again: the heavy things go (the canvas and its two textures); the medallion is a small picture and stays. */
  const undressPhoto = (card: Card) => {
    renderer?.release(card.key);
    card.canvas?.remove();
    card.canvas = null;
    card.pen = null;
    card.drawnX = 9;
    card.drawnY = 9;
  };

  /** A line of light across the medallion: once, when it arrives and when it is touched. Never on a loop. */
  const shine = (card: Card, delay = 0) => {
    const now = performance.now();
    if (!card.glint || now - card.glintAt < 4000 || typeof card.glint.animate !== 'function') return;
    card.glintAt = now;
    card.glint.animate([{ transform: 'translateX(-220%) skewX(-18deg)' }, { transform: 'translateX(420%) skewX(-18deg)' }], {
      pseudoElement: '::before',
      duration: 1100,
      delay,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    });
  };

  /*
   * Rising into place as the page scrolls is the browser's own doing (a
   * scroll-driven animation in depth.css, where the browser has them). A card
   * already on screen when this starts must not jump into it, so it is given
   * the animation only once it has been scrolled away.
   */
  const inView = (card: Card) => card.y - window.scrollY < viewH && card.y + card.h - window.scrollY > 0;
  for (const card of cards) {
    if (inView(card)) card.seen = true;
    else card.li.classList.add('dz-rise');
  }

  let sectionNear = true;
  if ('IntersectionObserver' in window) {
    const byElement = new Map<Element, Card>(cards.map((card) => [card.li, card]));
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const card = byElement.get(entry.target);
          if (!card) continue;
          card.near = entry.isIntersecting;
          if (card.near) {
            dress(card);
            shine(card, 350);
          } else {
            undressPhoto(card);
            if (card.seen) {
              card.seen = false;
              card.li.classList.add('dz-rise');
            }
          }
        }
        request();
      },
      // A little before the card arrives, so its medallion and depth are there when it does.
      { rootMargin: '35% 0px 35% 0px' },
    );
    for (const card of cards) watch.observe(card.li);
    off.push(() => watch.disconnect());
    const section = new IntersectionObserver((entries) => {
      sectionNear = entries[entries.length - 1]?.isIntersecting ?? true;
      if (sectionNear) request();
    });
    section.observe(root);
    off.push(() => section.disconnect());
  } else {
    for (const card of cards) {
      card.near = true;
      dress(card);
    }
  }

  // --- The pointer ---------------------------------------------------------------

  for (const card of cards) {
    const aim = (event: PointerEvent) => {
      card.aimX = clamp(((event.pageX - card.x) / Math.max(1, card.w)) * 2 - 1);
      card.aimY = clamp(((event.pageY - card.y) / Math.max(1, card.h)) * 2 - 1);
    };
    const rest = () => {
      card.hover = 0;
      card.held = 0;
      card.aimX = 0;
      card.aimY = 0;
      request();
    };
    listen(card.link, 'pointerenter', ((event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      card.touch = false;
      card.hover = 1;
      aim(event);
      shine(card);
      wake();
    }) as (event: never) => void);
    listen(
      card.link,
      'pointermove',
      ((event: PointerEvent) => {
        if (event.pointerType === 'touch' && !card.held) return;
        aim(event);
        wake();
      }) as (event: never) => void,
      { passive: true },
    );
    listen(
      card.link,
      'pointerdown',
      ((event: PointerEvent) => {
        card.touch = event.pointerType === 'touch';
        card.held = 1;
        aim(event);
        shine(card);
        wake();
      }) as (event: never) => void,
      { passive: true },
    );
    listen(card.link, 'pointerup', ((event: PointerEvent) => {
      card.held = 0;
      if (event.pointerType === 'touch') rest();
      else request();
    }) as (event: never) => void);
    // A finger that starts to scroll: the browser takes the touch back, and the card lets go.
    listen(card.link, 'pointercancel', rest as (event: never) => void);
    listen(card.link, 'pointerleave', rest as (event: never) => void);
  }

  // --- The phone in the hand -------------------------------------------------------

  /*
   * Android tells a page how the phone is held without asking anyone. iOS
   * tells it nothing until the person has agreed to a question, and a
   * permission question is too much to ask for decoration: so this listens
   * and never asks. Where nothing is told, the cards follow the finger and
   * the scroll only.
   *
   * (Do not test for DeviceOrientationEvent.requestPermission to tell the two
   * apart: Chrome has that function too, and the test switched this off on
   * every Android phone.)
   */
  let lean: { x: number; y: number } | null = null;
  /** The lean the last frame used, and the way the phone has lately been held ("level"). */
  let leanUsed: { x: number; y: number } | null = null;
  let level0: { x: number; y: number } | null = null;
  let leanAt = 0;
  let leanX = 0;
  let leanY = 0;
  listen(
    window,
    'deviceorientation',
    ((event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null || !sectionNear) return;
      // Which way is "right" depends on how the screen is turned.
      const turned = window.screen.orientation?.angle ?? 0;
      let x = event.gamma;
      let y = event.beta;
      if (turned === 90) [x, y] = [event.beta, -event.gamma];
      else if (turned === 270) [x, y] = [-event.beta, event.gamma];
      else if (turned === 180) [x, y] = [-x, -y];
      lean = { x, y };
      if (leanUsed && Math.abs(x - leanUsed.x) < LEAN_STEP && Math.abs(y - leanUsed.y) < LEAN_STEP) return;
      if (level0 && Math.max(Math.abs(x - level0.x), Math.abs(y - level0.y)) > LEAN_MEANT) wake();
      else request();
    }) as (event: never) => void,
    { passive: true },
  );

  // --- The frame -------------------------------------------------------------------

  let frame = 0;
  let last = 0;
  let lastDrawn = 0;
  let ambientUntil = performance.now() + AMBIENT_MS;
  let ambient = 0;
  let odd = false;
  let busyUntil = 0;
  let stopped = false;
  const request = () => {
    if (!frame && !stopped && !document.hidden) frame = window.requestAnimationFrame(draw);
  };
  /** Something moved: follow it at full rate, and let the pictures drift a while after. */
  const wake = () => {
    const now = performance.now();
    busyUntil = now + 250;
    ambientUntil = now + AMBIENT_MS;
    request();
  };

  let judged = 0;
  let average = 16;
  let strikes = 0;
  const lower = () => {
    if (level === 2) {
      level = 1;
      for (const card of cards) undressPhoto(card);
      renderer?.dispose();
      renderer = null;
      root.dataset.depthLevel = '1';
      remember(1);
    } else {
      remember(0);
      stop();
    }
  };

  function draw(now: number) {
    frame = 0;
    if (stopped) return;
    const elapsed = last ? now - last : 16;
    last = now;
    const busy = now < busyUntil;

    if (renderer?.lost()) {
      lower();
      if (stopped) return;
    }
    // Only frames that were following something are judged: resting ones are slow on purpose.
    if (busy && elapsed < 250) {
      average += (elapsed - average) * 0.12;
      judged += 1;
      if (judged >= JUDGED_FRAMES) {
        judged = 0;
        strikes = average > SLOW_FRAME_MS ? strikes + 1 : 0;
        if (strikes >= 2) {
          strikes = 0;
          lower();
          if (stopped) return;
        }
      }
    } else if (!busy) {
      judged = 0;
    }

    // Half the frames are enough for anything that is not following a finger, a scroll or a lean.
    odd = !odd;
    if (!busy && odd) {
      request();
      return;
    }
    const step = Math.min(64, lastDrawn ? now - lastDrawn : 16);
    lastDrawn = now;

    const ease = 1 - Math.exp(-step / 110);
    const scrollY = window.scrollY;

    // The phone's lean, against the way it has lately been held.
    if (lean) {
      const since = leanAt ? now - leanAt : 0;
      leanAt = now;
      // Turned over, or picked up after lying flat: start again from here rather than swing across.
      if (!level0 || !leanUsed || Math.abs(lean.x - level0.x) > 55 || Math.abs(lean.y - level0.y) > 55) {
        level0 = { ...lean };
      } else {
        // "Level" follows how the phone was held up to now, so that the lean that woke this frame still counts.
        const settle = 1 - Math.exp(-since / LEAN_SETTLE_MS);
        level0.x += (leanUsed.x - level0.x) * settle;
        level0.y += (leanUsed.y - level0.y) * settle;
      }
      leanUsed = { ...lean };
      const past = (degrees: number) => Math.sign(degrees) * Math.max(0, Math.abs(degrees) - LEAN_DEAD);
      // Leaning the right edge away puts the eye to the left of the screen, and the top edge away puts it below.
      leanX += (clamp(-past(lean.x - level0.x) / LEAN_RANGE) - leanX) * ease;
      leanY += (clamp(-past(lean.y - level0.y) / LEAN_RANGE) - leanY) * ease;
    }
    const resting = now >= ambientUntil;
    ambient += ((resting ? 0 : clamp((ambientUntil - now) / 2500, 0, 1)) - ambient) * ease;

    let moving = Math.abs(leanX) > 0.004 || Math.abs(leanY) > 0.004;
    for (const card of cards) {
      const top = card.y - scrollY;
      if (!card.near || top > viewH + 60 || top + card.h < -60) continue;
      if (top < viewH && top + card.h > 0) card.seen = true;

      const turn = card.touch ? TOUCH_TILT / TILT : 1;
      card.tiltX += (card.aimX * turn * Math.max(card.hover, card.held) - card.tiltX) * ease;
      card.tiltY += (card.aimY * turn * Math.max(card.hover, card.held) - card.tiltY) * ease;
      card.lift += (card.hover * (1 - card.held) - card.lift) * ease;
      card.press += (card.held - card.press) * ease;
      if (Math.abs(card.tiltX) + Math.abs(card.tiltY) + card.lift + card.press > 0.003 || card.hover || card.held) moving = true;

      const driftX = Math.sin(now / 2600 + card.phase) * AMBIENT_EYE * ambient;
      const driftY = Math.cos(now / 3400 + card.phase) * AMBIENT_EYE * 0.7 * ambient;
      // The eye for everything that is not a real rotation of the card…
      const flatX = leanX + driftX;
      const flatY = clamp((viewH / 2 - (top + card.h / 2)) / (viewH / 2)) * SCROLL_EYE + leanY + driftY;
      // …and for the photograph, which the rotation does not reach: a card turned toward the pointer is seen from its other side.
      const eyeX = clamp(flatX - card.tiltX * POINTER_EYE, -1.5, 1.5);
      const eyeY = clamp(flatY - card.tiltY * POINTER_EYE, -1.5, 1.5);

      put(card.link, '--rx', (-card.tiltY * TILT).toFixed(2));
      put(card.link, '--ry', (card.tiltX * TILT).toFixed(2));
      put(card.link, '--lz', (card.lift * LIFT).toFixed(1));
      put(card.link, '--ps', (1 - card.press * PRESS).toFixed(4));
      if (card.emblem) {
        put(card.emblem, '--mx', (-flatX * MEDAL_REACH).toFixed(1));
        put(card.emblem, '--my', (-flatY * MEDAL_REACH).toFixed(1));
      }
      if (card.glare) {
        // Under the pointer while there is one; otherwise where the eye is, as a reflection would be.
        const pointed = Math.max(card.lift, card.press);
        const glow = clamp(Math.max(pointed, Math.hypot(leanX, leanY) * 1.4, ambient * 0.35), 0, 1);
        card.glow += (glow - card.glow) * ease;
        put(card.glare, '--gx', ((card.tiltX * pointed + flatX * (1 - pointed) * 0.8) * card.w * 0.5).toFixed(1));
        put(card.glare, '--gy', ((card.tiltY * pointed + flatY * (1 - pointed) * 0.8) * card.h * 0.5).toFixed(1));
        put(card.glare, '--ga', card.glow.toFixed(3));
      }
      if (renderer && card.pen && card.canvas) {
        if (Math.abs(eyeX - card.drawnX) > 0.0015 || Math.abs(eyeY - card.drawnY) > 0.0015) {
          if (renderer.draw(card.key, card.pen, { width: card.w, height: card.h, focusX: card.focusX, focusY: card.focusY }, eyeX, eyeY)) {
            card.drawnX = eyeX;
            card.drawnY = eyeY;
            card.canvas.classList.add('is-on');
          } else {
            moving = true; // its pictures are still arriving: look again next frame
          }
        }
      } else if (card.photo) {
        // Behind the frame, so toward the eye.
        put(card.photo, '--px', (eyeX * FLAT_REACH).toFixed(1));
        put(card.photo, '--py', (eyeY * FLAT_REACH).toFixed(1));
      }
    }

    if (moving || busy || (!resting && sectionNear) || ambient > 0.01) request();
  }

  listen(window, 'scroll', wake as (event: never) => void, { passive: true });
  let measuring = 0;
  const remeasure = () => {
    if (measuring) return;
    measuring = window.requestAnimationFrame(() => {
      measuring = 0;
      measure();
      request();
    });
  };
  listen(window, 'resize', remeasure as (event: never) => void, { passive: true });
  if ('ResizeObserver' in window) {
    const resized = new ResizeObserver(remeasure);
    resized.observe(list);
    off.push(() => resized.disconnect());
  }
  listen(document, 'visibilitychange', (() => {
    // Back from another tab: do not count the time away as one very slow frame.
    last = 0;
    lastDrawn = 0;
    request();
  }) as (event: never) => void);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onCalm = () => {
    if (calm.matches) stop();
  };
  calm.addEventListener('change', onCalm);
  off.push(() => calm.removeEventListener('change', onCalm));

  function stop() {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(measuring);
    off.forEach((undo) => undo());
    renderer?.dispose();
    renderer = null;
    root.dataset.depth = '';
    delete root.dataset.depthLevel;
    for (const card of cards) {
      card.canvas?.remove();
      card.medal?.remove();
      card.glare?.remove();
      card.glint?.remove();
      card.emblem?.classList.remove('dz-medalled');
      card.li.classList.remove('dz-rise');
      for (const [element, names] of [
        [card.link, ['--rx', '--ry', '--lz', '--ps']],
        [card.emblem, ['--mx', '--my']],
        [card.photo, ['--px', '--py']],
      ] as const) {
        if (element) for (const name of names) element.style.removeProperty(name);
      }
    }
  }

  request();
  return stop;
}
