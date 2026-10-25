'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Sections rise into view once, as they arrive. That is all this does now.
 *
 * Until 25 October 2026 it also tilted cards toward the pointer, leaned
 * buttons at it, swung a light after the mouse and drew a reading hairline;
 * none of that told anyone anything, and on an inexpensive phone it cost
 * frames. The rule since (DESIGN-SYSTEM.md, "Motion with a reason"): the site
 * moves to show something arriving or changing, never to decorate.
 *
 * Nothing here is needed to use the site: without JavaScript, or with
 * reduced motion requested, the pages are simply still and complete.
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    const timers: number[] = [];
    const settled = (element: Element) => element.classList.remove('rv', 'in');
    const waiting = new Set<HTMLElement>();

    const reveal = (element: HTMLElement, order: number) => {
      if (!waiting.delete(element)) return;
      revealer.unobserve(element);
      // Things arriving together come in one after another.
      const delay = Math.min(order, 6) * 60;
      element.style.setProperty('--rv-delay', `${delay}ms`);
      element.classList.add('in');
      timers.push(window.setTimeout(() => settled(element), 900 + delay));
    };

    const revealer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, index) => reveal(entry.target as HTMLElement, index));
      },
      // Start a little before the section enters, so a quick flick never meets an empty band.
      { rootMargin: '0px 0px 12% 0px', threshold: 0 },
    );

    // An observer only reports what it saw intersect in some frame. A jump —
    // an anchor link, a fast fling on a phone dropping frames, the End key —
    // can carry a short section from below the screen to above it between
    // two frames, and it would stay invisible. So after any scroll, whatever
    // has already passed the bottom of the screen is shown, observed or not.
    let frame = 0;
    const sweep = () => {
      frame = 0;
      const bottom = window.innerHeight;
      let order = 0;
      for (const element of waiting) {
        if (element.getBoundingClientRect().top < bottom) reveal(element, order++);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sweep);
    };

    // Only what is still below the fold waits to rise, so nothing already on screen ever blinks out.
    const fold = window.innerHeight * 0.92;
    for (const element of document.querySelectorAll<HTMLElement>(REVEAL)) {
      if (element.getBoundingClientRect().top < fold) continue;
      element.classList.add('rv');
      waiting.add(element);
      revealer.observe(element);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    root.classList.add('alive');

    return () => {
      window.removeEventListener('scroll', onScroll);
      revealer.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
      for (const element of document.querySelectorAll('.rv')) settled(element);
      root.classList.remove('alive');
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
