'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Asks the browser for the visitor's location, once, when they tap: never on
 * arrival. The position is rounded to two decimals (about a kilometre) before
 * it leaves the device and travels only in this page's address; nothing
 * stores it.
 */
export function LocateButton({ labels, radius }: { labels: { use: string; locating: string; denied: string; unsupported: string }; radius: number }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'unsupported'>('idle');
  const locate = () => {
    if (!('geolocation' in navigator)) {
      setState('unsupported');
      return;
    }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(2);
        const lng = position.coords.longitude.toFixed(2);
        router.push(`/cerca?lat=${lat}&lng=${lng}&r=${radius}`);
        setState('idle');
      },
      () => setState('denied'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  };
  return (
    <div className="btn-row">
      <button type="button" className="btn btn-gold" onClick={locate} disabled={state === 'locating'}>
        {state === 'locating' ? labels.locating : labels.use}
      </button>
      {state === 'denied' || state === 'unsupported' ? (
        <p className="bd-ok" role="status">
          {state === 'denied' ? labels.denied : labels.unsupported}
        </p>
      ) : null}
    </div>
  );
}
