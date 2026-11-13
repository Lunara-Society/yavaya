'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlaySetup } from './play';

/**
 * Brings the game in after its page has painted. The 3D engine is by far the
 * heaviest thing on Yavaya, so it is fetched here and nowhere else: no other
 * page, and not this one's first paint, pays for it.
 */
export function PlayLoader({ setup, loading, unsupported }: { setup: PlaySetup; loading: string; unsupported: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unsupported'>('loading');

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let stop: (() => void) | undefined;
    let gone = false;
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') ?? probe.getContext('webgl'))) {
      setState('unsupported');
      return;
    }
    import('./play')
      .then(({ startPlay }) => {
        if (gone) return;
        stop = startPlay(node, setup);
        setState('ready');
      })
      .catch(() => setState('unsupported'));
    return () => {
      gone = true;
      stop?.();
    };
    // The setup is the server's and does not change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={host} className="yp-host" />
      {state === 'ready' ? null : (
        <p className="yp-wait" role="status">
          {state === 'loading' ? loading : unsupported}
        </p>
      )}
    </>
  );
}
