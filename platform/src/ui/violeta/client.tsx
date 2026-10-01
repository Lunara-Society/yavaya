'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Salir rápido": leaves for an ordinary page and replaces this one in the
 * history, so Back does not return here. Esc twice does the same — someone
 * walking in should not have to find a button.
 */
export function QuickExit({ url, label, hint }: { url: string; label: string; hint: string }) {
  useEffect(() => {
    let last = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const now = Date.now();
      if (now - last < 1000) window.location.replace(url);
      last = now;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url]);
  return (
    <a
      className="vt-exit"
      href={url}
      rel="noreferrer"
      title={hint}
      onClick={(event) => {
        event.preventDefault();
        window.location.replace(url);
      }}
    >
      {label}
    </a>
  );
}

/**
 * Keeps the page current without a socket: says "still here" now and then,
 * and re-renders on an interval. It never refreshes while she is typing —
 * a refresh must not eat a half-written message — or while the tab is hidden.
 */
export function LiveRefresh({ seconds, pingSeconds }: { seconds: number; pingSeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let lastPing = 0;
    const ping = () => {
      lastPing = Date.now();
      void fetch('/api/violeta/ping', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => undefined);
    };
    ping();
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPing > pingSeconds * 1000) ping();
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && active.value.trim() !== '') return;
      if (active instanceof HTMLInputElement && active.type === 'text' && active.value.trim() !== '') return;
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds, pingSeconds]);
  return null;
}
