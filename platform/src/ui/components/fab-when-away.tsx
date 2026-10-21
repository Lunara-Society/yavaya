'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A floating button that shows only once the page's own copy of it has
 * scrolled out of sight. Two identical buttons on one screen read as a
 * mistake, and the floating one covers whatever is beneath it.
 *
 * It starts hidden: without JavaScript the button in the page is still there.
 * Where IntersectionObserver is missing, or the watched element is not on the
 * page, it simply shows.
 */
export function FabWhenAway({ href, watch, className, children }: { href: string; watch: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const fab = ref.current;
    if (!fab) return;
    const target = document.querySelector(watch);
    if (!target || typeof IntersectionObserver === 'undefined') {
      fab.dataset.away = 'yes';
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      fab.dataset.away = entry?.isIntersecting ? 'no' : 'yes';
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <Link ref={ref} className={className} href={href} data-away="no">
      {children}
    </Link>
  );
}
