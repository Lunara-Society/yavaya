'use client';

import { useEffect, useRef } from 'react';

/**
 * The home page's header lies over the hero's photograph with nothing behind
 * it, as the owner's design draws it. Once the page scrolls, the header needs
 * a ground of its own to stay readable over whatever passes under it: this
 * marks it (`data-scrolled`) and home.css draws the ground. A marker inside the
 * header rather than a wrapper around it, so the header stays a server
 * component; without JavaScript the header simply keeps its photograph.
 */
export function TopScroll() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = marker.current?.closest('header');
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.toggleAttribute('data-scrolled', window.scrollY > 8);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return <span ref={marker} hidden />;
}
