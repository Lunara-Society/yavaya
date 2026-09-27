'use client';

import { useEffect } from 'react';

/**
 * The site's response to the person in front of it.
 *
 * - The home landscape shifts with the pointer and settles away as you
 *   scroll, each layer by its depth, so the scene has distance in it.
 * - District gateways and cards tilt toward the pointer and catch a gold
 *   light where it rests.
 * - A hairline of gold along the top marks how far down the page you are.
 *
 * It only writes CSS variables; every visual decision stays in site.css.
 * Nothing here is needed to use the site: without JavaScript, or with
 * reduced motion requested, the pages are simply still.
 */
export function Alive() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    let tiltTarget: HTMLElement | null = null;
    let tiltEvent: PointerEvent | null = null;

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

      if (tiltTarget && tiltEvent) {
        const box = tiltTarget.getBoundingClientRect();
        const x = (tiltEvent.clientX - box.left) / box.width;
        const y = (tiltEvent.clientY - box.top) / box.height;
        tiltTarget.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        tiltTarget.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        tiltTarget.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2));
        tiltTarget.style.setProperty('--ry', ((x - 0.5) * 8).toFixed(2));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (target !== tiltTarget) {
        tiltTarget?.style.removeProperty('--rx');
        tiltTarget?.style.removeProperty('--ry');
        tiltTarget = target;
      }
      tiltEvent = event;
      schedule();
    };
    const onLeave = () => {
      tiltTarget?.style.removeProperty('--rx');
      tiltTarget?.style.removeProperty('--ry');
      tiltTarget = null;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    root.classList.add('alive');
    schedule();

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerleave', onLeave);
      root.classList.remove('alive');
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
