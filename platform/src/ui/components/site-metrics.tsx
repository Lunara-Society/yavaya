'use client';

import { useParams, usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect, useRef } from 'react';

/**
 * Tells Yavaya's own statistics (/api/metrics) that a page was seen, and how
 * fast it was for this visitor. No cookie, no storage, no identifier: each
 * report is a page's route, a kind of screen, where the visit came from (a
 * site's host name, never its address) and the browser's own speed
 * measurements. The server counts them per day and keeps nothing else.
 *
 * Nothing is sent from Espacio Violeta or the panels, nor by a browser that
 * asks sites not to track it (Global Privacy Control or Do Not Track).
 *
 * Ids in the address are replaced by their name before anything leaves the
 * page: a listing is counted as /mercadito/[id], never as itself.
 */

type Event =
  | { k: 'view'; p: string; d: string; s: string; e: boolean }
  | { k: 'vital'; p: string; d: string; m: string; v: number };

const SKIP = /^\/(violeta|admin|api)(\/|$)/;

function declined(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

function device(): 'phone' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  return width < 640 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
}

/** /mercadito/3f2a… → /mercadito/[id], using the route's own parameter names. */
function routeOf(pathname: string, params: Record<string, string | string[]> | null): string {
  if (!params) return pathname;
  const names = new Map<string, string>();
  for (const [name, value] of Object.entries(params)) {
    for (const part of Array.isArray(value) ? value : [value]) names.set(part, name);
  }
  return pathname
    .split('/')
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // keep the raw segment
      }
      const name = names.get(segment) ?? names.get(decoded);
      return name ? `[${name}]` : segment;
    })
    .join('/');
}

const queue: Event[] = [];

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 12) });
  const blob = new Blob([body], { type: 'application/json' });
  if (!navigator.sendBeacon?.('/api/metrics', blob)) {
    fetch('/api/metrics', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
  }
  if (queue.length) flush();
}

export function SiteMetrics() {
  const pathname = usePathname();
  const params = useParams();
  // Read through a ref: the effect below must run once per address, not whenever the params object is rebuilt.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const first = useRef(true);
  const route = useRef('');
  const off = useRef(false);

  useEffect(() => {
    off.current = declined();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useEffect(() => {
    if (!pathname || off.current) return;
    const p = routeOf(pathname, paramsRef.current as Record<string, string | string[]> | null);
    route.current = p;
    if (SKIP.test(p)) return;
    const own = window.location.hostname;
    let event: Event;
    if (first.current) {
      first.current = false;
      // The page this browser opened: a visit begins here if it came from outside and is not a reload or a step back.
      let from = '';
      try {
        from = document.referrer ? new URL(document.referrer).hostname : '';
      } catch {
        from = '';
      }
      const navigation = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
      const fresh = !navigation || navigation.type === 'navigate' || navigation.type === 'prerender';
      event = { k: 'view', p, d: device(), s: from, e: fresh && from !== own };
    } else {
      event = { k: 'view', p, d: device(), s: own, e: false };
    }
    queue.push(event);
    // Views go out promptly so a visit that ends abruptly is still counted; speed waits for the page to settle.
    flush();
  }, [pathname]);

  useReportWebVitals((metric) => {
    if (off.current || !route.current || SKIP.test(route.current)) return;
    if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(metric.name)) return;
    queue.push({ k: 'vital', p: route.current, d: device(), m: metric.name, v: Math.round(metric.value * 1000) / 1000 });
    if (queue.length >= 8) flush();
  });

  return null;
}
