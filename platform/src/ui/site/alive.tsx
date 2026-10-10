'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The site's response to the person in front of it.
 *
 * - The home landscape shifts with the pointer and settles away as you
 *   scroll, each layer by its depth, so the scene has distance in it; the
 *   seal turns towards the pointer like a coin in the hand.
 * - District gateways and cards tilt toward the pointer, their layers
 *   separate in depth, and they catch a gold light where it rests.
 * - Sections rise out of depth as they come into view, one after another.
 * - A soft light follows the mouse across the dark, and buttons lean
 *   towards it.
 * - A hairline of gold along the top marks how far down the page you are.
 *
 * It only writes CSS variables and classes; every visual decision stays in
 * site.css. Nothing here is needed to use the site: without JavaScript, or
 * with reduced motion requested, the pages are simply still and complete.
 */

/** What rises into view. Site sections only — never a form someone is filling in. */
const REVEAL = [
  '.section .section-head',
  '.section .grid > *',
  '.section .gates > *',
  '.section .split > *',
  '.section .steps > li',
  '.section .table-wrap',
  '.section .quote',
  '.section .ornament',
  // District storefronts: listings, shops and animals step in as you browse.
  '.mk-grid > *',
  '.go-stores > li',
  '.an-grid > *',
].join(', ');

export function Alive() {
  // The shell is the same between pages; the content it reveals is not.
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const root = document.documentElement;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    let tiltTarget: HTMLElement | null = null;
    let tiltEvent: PointerEvent | null = null;
    let magnet: HTMLElement | null = null;
    const spot = document.querySelector<HTMLElement>('.cine-spot');

    const render = () => {
      frame = 0;
      const hero = document.querySelector<HTMLElement>('.hero');
      if (hero) {
        if (pointer) {
          hero.style.setProperty('--px', ((pointer.x / window.innerWidth) * 2 - 1).toFixed(3));
          hero.style.setProperty('--py', ((pointer.y / window.innerHeight) * 2 - 1).toFixed(3));
        }
        const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight)));
        hero.style.setProperty('--sy', progress.toFixed(3));
      }

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty('--read', scrollable > 0 ? (window.scrollY / scrollable).toFixed(4) : '0');

      // Written on the light itself, not the root, so following the mouse restyles one element.
      if (spot && pointer) spot.style.transform = `translate3d(${pointer.x.toFixed(0)}px, ${pointer.y.toFixed(0)}px, 0)`;

      if (tiltTarget && tiltEvent) {
        const box = tiltTarget.getBoundingClientRect();
        const x = (tiltEvent.clientX - box.left) / box.width;
        const y = (tiltEvent.clientY - box.top) / box.height;
        tiltTarget.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        tiltTarget.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        tiltTarget.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(2));
        tiltTarget.style.setProperty('--ry', ((x - 0.5) * 16).toFixed(2));
      }

      if (magnet && tiltEvent) {
        const box = magnet.getBoundingClientRect();
        const dx = tiltEvent.clientX - (box.left + box.width / 2);
        const dy = tiltEvent.clientY - (box.top + box.height / 2);
        magnet.style.setProperty('--bx', `${(dx * 0.18).toFixed(1)}px`);
        magnet.style.setProperty('--by', `${(dy * 0.28).toFixed(1)}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    const release = (element: HTMLElement | null, ...names: string[]) => {
      for (const name of names) element?.style.removeProperty(name);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      const element = event.target as Element | null;
      const target = element?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (target !== tiltTarget) {
        release(tiltTarget, '--rx', '--ry');
        tiltTarget = target;
      }
      const button = element?.closest<HTMLElement>('.btn') ?? null;
      if (button !== magnet) {
        release(magnet, '--bx', '--by');
        magnet = button;
      }
      tiltEvent = event;
      schedule();
    };
    const onLeave = () => {
      release(tiltTarget, '--rx', '--ry');
      release(magnet, '--bx', '--by');
      tiltTarget = null;
      magnet = null;
    };

    // ── Rising into view ──────────────────────────────────────────────
    // Only what is still below the fold waits to rise, so nothing already on
    // screen ever blinks out. Print shows everything (see site.css).
    const timers: number[] = [];
    const settled = (element: Element) => element.classList.remove('rv', 'in');
    const revealer = new IntersectionObserver(
      (entries) => {
        const arriving = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
        arriving.forEach((element, index) => {
          revealer.unobserve(element);
          // Things arriving together come in one after another, like a cast taking the stage.
          const delay = Math.min(index, 6) * 90;
          element.style.setProperty('--rv-delay', `${delay}ms`);
          element.classList.add('in');
          timers.push(window.setTimeout(() => settled(element), 1500 + delay));
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const fold = window.innerHeight * 0.92;
    for (const element of document.querySelectorAll<HTMLElement>(REVEAL)) {
      if (element.getBoundingClientRect().top < fold) continue;
      element.classList.add('rv');
      revealer.observe(element);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    root.classList.add('alive');
    if (finePointer) root.classList.add('pointer-fine');
    schedule();

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerleave', onLeave);
      revealer.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
      for (const element of document.querySelectorAll('.rv')) settled(element);
      root.classList.remove('alive', 'pointer-fine');
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
