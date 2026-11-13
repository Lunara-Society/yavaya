'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameLabels } from './game';

/**
 * Brings the game in after its page has painted. The 3D engine is by far the
 * heaviest thing on Yavaya, so it is fetched here and nowhere else: no other
 * page, and not this one's first paint, pays for it.
 */
export function PlayLoader({ labels, loading, unsupported }: { labels: GameLabels; loading: string; unsupported: string }) {
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
    import('./game')
      .then(({ startGame }) => {
        if (gone) return;
        stop = startGame(node, labels);
        setState('ready');
      })
      .catch(() => setState('unsupported'));
    return () => {
      gone = true;
      stop?.();
    };
    // The labels are the server's and do not change while the page is open.
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
