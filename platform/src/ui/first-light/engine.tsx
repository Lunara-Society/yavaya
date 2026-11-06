'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { sound } from './sound';
import { chooseTier, readDeviceSignals, type Tier } from './tier';

/**
 * The First Light's behaviour, added to the server-rendered page: nothing
 * here renders, and without it the page is complete — every door is a link,
 * the search a form, the picture still.
 *
 * - The tier (tier.ts): the page arrives as `lite`, and a capable device is
 *   upgraded to `full` once the page has loaded; asking for less motion makes
 *   it `still` at once.
 * - Light that follows the pointer or the finger (full tier): two numbers
 *   for the hero and two for the Guardian, set once per frame.
 * - The Guardian's moment: a touch brings its light up for a second, rarely
 *   (the cooldown is the sound engine's), and only as decoration.
 * - The doors: each one opens into its district. The picture in the door
 *   grows to fill the screen while the district loads underneath, then
 *   dissolves into it, so the visitor sees the place they chose become the
 *   page. The links are prefetched once the doors are in view.
 * - Everything pauses when the tab is hidden or the hero is scrolled away.
 */
export function FirstLightEngine() {
  const router = useRouter();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-fl]');
    if (!root) return;
    const hero = root.querySelector<HTMLElement>('[data-fl-hero]');
    const guardian = root.querySelector<HTMLElement>('[data-fl-guardian]');
    const doors = root.querySelector<HTMLElement>('[data-fl-doors]');
    const off: Array<() => void> = [];
    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Document | Window, type: K | string, fn: (event: never) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, options);
      off.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    /*
     * Less motion is honoured at once. The full scene (light maps, breathing,
     * mist, the light that follows the pointer) waits until the page has
     * loaded and the browser is idle: it adds nothing the first paint needs,
     * and switching it on earlier made the largest paint wait behind it.
     */
    let tier: Tier = 'lite';
    const settle = (next: Tier) => {
      tier = next;
      root.dataset.tier = next;
    };
    let gone = false;
    off.push(() => {
      gone = true;
    });
    const upgrade = () => {
      if (!gone && root.dataset.tier === 'lite' && chooseTier(readDeviceSignals()) === 'full') settle('full');
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(upgrade, { timeout: 2000 });
      else window.setTimeout(upgrade, 300);
    };
    const first = chooseTier(readDeviceSignals());
    if (first === 'still') settle('still');
    else if (first === 'full') {
      if (document.readyState === 'complete') whenIdle();
      else listen(window, 'load', whenIdle, { once: true });
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const retier = () => settle(chooseTier(readDeviceSignals()));
    motion.addEventListener('change', retier);
    off.push(() => motion.removeEventListener('change', retier));

    // Pause: a hidden tab, or a hero scrolled out of view, animates nothing.
    const onVisibility = () => root.toggleAttribute('data-paused', document.hidden);
    listen(document, 'visibilitychange', onVisibility);
    if (hero && 'IntersectionObserver' in window) {
      const away = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry) root.toggleAttribute('data-hero-away', !entry.isIntersecting);
      }, { threshold: 0.02 });
      away.observe(hero);
      off.push(() => away.disconnect());
    }

    // Light that follows the pointer or the finger.
    if (hero && guardian) {
      // The layers that drift with the pointer carry its position themselves (first-light.css says why).
      const drifting = [root.querySelector<HTMLElement>('.fl-horizon'), root.querySelector<HTMLElement>('.fl-sun'), guardian].filter((element): element is HTMLElement => element !== null);
      let frame = 0;
      let last: PointerEvent | null = null;
      const apply = () => {
        frame = 0;
        if (!last || tier !== 'full') return;
        const h = hero.getBoundingClientRect();
        const g = guardian.getBoundingClientRect();
        const mx = clamp((last.clientX - h.left) / h.width).toFixed(3);
        const my = clamp((last.clientY - h.top) / h.height).toFixed(3);
        for (const element of drifting) {
          element.style.setProperty('--mx', mx);
          element.style.setProperty('--my', my);
        }
        guardian.style.setProperty('--gx', clamp((last.clientX - g.left) / g.width, -0.2, 1.2).toFixed(3));
        guardian.style.setProperty('--gy', clamp((last.clientY - g.top) / g.height, -0.2, 1.2).toFixed(3));
        hero.dataset.lit = '';
      };
      const move = (event: PointerEvent) => {
        last = event;
        if (!frame) frame = window.requestAnimationFrame(apply);
      };
      // Let go: the light drifts back to rest (the properties are registered, so they ease).
      const leave = () => {
        last = null;
        delete hero.dataset.lit;
        for (const element of drifting) for (const name of ['--mx', '--my']) element.style.removeProperty(name);
        for (const name of ['--gx', '--gy']) guardian.style.removeProperty(name);
      };
      listen(hero, 'pointermove', move as (event: never) => void, { passive: true });
      listen(hero, 'pointerdown', move as (event: never) => void, { passive: true });
      listen(hero, 'pointerleave', leave);
      listen(hero, 'pointerup', ((event: PointerEvent) => {
        if (event.pointerType !== 'mouse') window.setTimeout(leave, 900);
      }) as (event: never) => void);
      off.push(() => window.cancelAnimationFrame(frame));

      // The Guardian's moment.
      let momentUntil = 0;
      listen(guardian, 'pointerdown', (() => {
        const now = performance.now();
        if (now < momentUntil) return;
        momentUntil = now + 8000;
        sound().play('guardian');
        if (tier === 'still') return;
        root.classList.add('fl-moment');
        window.setTimeout(() => root.classList.remove('fl-moment'), 1600);
      }) as (event: never) => void);
    }

    // A little pull toward the pointer, on buttons, for a mouse only.
    if (window.matchMedia('(pointer: fine)').matches) {
      root.querySelectorAll<HTMLElement>('[data-fl-magnetic]').forEach((element) => {
        const pull = (event: PointerEvent) => {
          if (tier !== 'full') return;
          const r = element.getBoundingClientRect();
          const dx = (event.clientX - (r.left + r.width / 2)) / (r.width / 2);
          const dy = (event.clientY - (r.top + r.height / 2)) / (r.height / 2);
          element.style.setProperty('--tx', `${(clamp(dx, -1, 1) * 5).toFixed(1)}px`);
          element.style.setProperty('--ty', `${(clamp(dy, -1, 1) * 4).toFixed(1)}px`);
        };
        const rest = () => {
          element.style.removeProperty('--tx');
          element.style.removeProperty('--ty');
        };
        listen(element, 'pointermove', pull as (event: never) => void, { passive: true });
        listen(element, 'pointerleave', rest);
      });
    }

    // The doors.
    if (doors) {
      if ('IntersectionObserver' in window) {
        const warm = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            doors.querySelectorAll<HTMLAnchorElement>('a[data-fl-door]').forEach((a) => router.prefetch(a.getAttribute('href') ?? '/'));
            warm.disconnect();
          },
          { rootMargin: '200px' },
        );
        warm.observe(doors);
        off.push(() => warm.disconnect());
      }
      listen(doors, 'click', ((event: MouseEvent) => {
        const a = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-fl-door]');
        if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const href = a.getAttribute('href');
        if (!href || !href.startsWith('/')) return;
        event.preventDefault();
        sound().play('door', { pitch: Number(a.dataset.pitch ?? 0) });
        window.setTimeout(() => sound().play('transition'), 90);
        if (tier === 'still') {
          router.push(href);
          return;
        }
        openDoor(a, href, () => router.push(href));
      }) as (event: never) => void);
    }

    return () => off.forEach((fn) => fn());
  }, [router]);

  return null;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The door's picture becomes the screen. Built outside React and inline-styled
 * on purpose: it has to outlive this page, whose components and stylesheet go
 * away as the district arrives, and dissolve over the page that replaces it.
 *
 * Only transform, clip-path and opacity animate, which the browser composites
 * without laying the page out again.
 */
function openDoor(a: HTMLAnchorElement, href: string, go: () => void) {
  const frame = a.querySelector<HTMLElement>('[data-fl-door-frame]') ?? a;
  const picture = frame.querySelector<HTMLImageElement>('img');
  const source = picture?.currentSrc || picture?.src;
  if (!source || !picture?.naturalWidth) {
    go();
    return;
  }
  const d = frame.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const iw = picture.naturalWidth;
  const ih = picture.naturalHeight;
  const fill = Math.max(vw / iw, vh / ih);
  const inDoor = Math.max(d.width / iw, d.height / ih);
  const width = iw * fill;
  const height = ih * fill;

  const veil = document.createElement('div');
  veil.setAttribute('aria-hidden', 'true');
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    overflow: 'hidden',
    background: '#07060a',
    pointerEvents: 'none',
    willChange: 'clip-path, opacity',
  } satisfies Partial<CSSStyleDeclaration>);
  const img = document.createElement('img');
  img.alt = '';
  img.src = source;
  Object.assign(img.style, {
    position: 'absolute',
    left: `${(vw - width) / 2}px`,
    top: `${(vh - height) / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: 'none',
    willChange: 'transform',
  } satisfies Partial<CSSStyleDeclaration>);
  const edge = document.createElement('div');
  Object.assign(edge.style, {
    position: 'absolute',
    inset: '0',
    boxShadow: 'inset 0 0 0 1px rgba(243, 215, 123, 0.55), inset 0 0 160px rgba(7, 6, 10, 0.55)',
    background: `radial-gradient(120% 80% at 50% 100%, ${a.dataset.acc ?? '#e2bf63'}33, transparent 60%)`,
  } satisfies Partial<CSSStyleDeclaration>);
  veil.append(img, edge);
  document.body.append(veil);

  const rx = d.width / 2;
  const ry = d.height / 3;
  const from = `inset(${d.top}px ${vw - d.right}px ${vh - d.bottom}px ${d.left}px round ${rx}px ${rx}px 16px 16px / ${ry}px ${ry}px 16px 16px)`;
  const to = 'inset(0px 0px 0px 0px round 0px 0px 0px 0px / 0px 0px 0px 0px)';
  const timing: KeyframeAnimationOptions = { duration: 640, easing: 'cubic-bezier(0.22, 0.8, 0.18, 1)', fill: 'forwards' };
  veil.animate([{ clipPath: from }, { clipPath: to }], timing);
  img.animate(
    [
      { transform: `translate(${d.left + d.width / 2 - vw / 2}px, ${d.top + d.height / 2 - vh / 2}px) scale(${inDoor / fill})` },
      { transform: 'translate(0px, 0px) scale(1.04)' },
    ],
    timing,
  );

  const started = performance.now();
  const target = new URL(href, window.location.href).pathname;
  go();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const fade = veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' });
    fade.onfinish = () => veil.remove();
  };
  // Dissolve once the district is the page and the door has finished opening; never later than 5 s.
  const wait = () => {
    if (finished) return;
    if (window.location.pathname === target && performance.now() - started > 640) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
      return;
    }
    window.setTimeout(wait, 60);
  };
  wait();
  window.setTimeout(finish, 5000);
}
