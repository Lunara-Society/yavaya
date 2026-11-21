'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlaySetup } from './play';

/** The smallest WebAssembly module there is: whether this document's policy lets the page compile one. */
const EMPTY_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
async function wasmAllowed(): Promise<boolean> {
  try {
    await WebAssembly.compile(EMPTY_MODULE);
    return true;
  } catch {
    return false;
  }
}

const RELOADED = 'yavaya.play.reloaded';
/** Reloads the page unless it was just reloaded for the same reason (so a policy that really refuses never loops). */
function reloadOnce(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOADED)) {
      window.sessionStorage.removeItem(RELOADED);
      return false;
    }
    window.sessionStorage.setItem(RELOADED, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
function forgetReload() {
  try {
    window.sessionStorage.removeItem(RELOADED);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

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
    wasmAllowed()
      .then((allowed) => {
        // Arrived by a client-side link: this document still has the previous page's security policy, which refuses
        // the WebAssembly Genesis decodes its files with. Load /play as its own document, once (middleware.ts).
        if (!allowed && reloadOnce()) return new Promise<never>(() => undefined);
        if (allowed) forgetReload();
        return import('./play');
      })
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
