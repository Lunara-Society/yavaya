'use client';

import { useEffect } from 'react';
import { chooseTier, readDeviceSignals } from '@/ui/first-light/tier';

/**
 * Whether this device is given the districts in depth, and when
 * (docs/DISTRICTS-3D.md). Renders nothing.
 *
 * The page arrives as the classic one and stays that way on an inexpensive
 * phone, a slow connection, Data Saver, or for anyone who asked their device
 * for less motion (the same test as the First Light: ui/first-light/tier.ts),
 * and on a phone that struggled with it earlier in this visit. Those never
 * download the engine, its styles, the depth maps or the medallions.
 *
 * Everyone else gets them once the page has loaded and the browser is idle,
 * so the first paint is the classic page's, byte for byte.
 */
export function DepthGate() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-depth]');
    if (!root || chooseTier(readDeviceSignals()) !== 'full') return;
    try {
      // The engine's own memory of this visit (engine.ts, DEPTH_MEMORY): '0' is "this phone could not keep up".
      if (window.sessionStorage.getItem('yavaya.depth') === '0') return;
    } catch {
      // Storage refused: ask the device again.
    }
    let gone = false;
    let stop: (() => void) | undefined;
    const start = () => {
      if (gone) return;
      import('./engine')
        .then(({ startDepth }) => {
          if (!gone) stop = startDepth(root);
        })
        // The connection dropped before the engine arrived: the classic cards are already there.
        .catch(() => undefined);
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 2500 });
      else window.setTimeout(start, 400);
    };
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
    return () => {
      gone = true;
      window.removeEventListener('load', whenIdle);
      stop?.();
    };
  }, []);
  return null;
}
