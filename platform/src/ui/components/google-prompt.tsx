'use client';

import { useEffect } from 'react';

type GoogleId = {
  initialize: (options: Record<string, unknown>) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

/**
 * Google's sign-in prompt, offered as soon as a signed-out visitor arrives:
 * "Continuar como Ana", one tap. Someone who already used Google here and has
 * a single Google account open goes straight in (auto-select) — except right
 * after signing out, when the prompt waits to be tapped instead of undoing the
 * sign-out.
 *
 * Google decides when not to show it (dismissed recently, no Google session in
 * the browser); the page never insists. Without JavaScript the buttons remain.
 *
 * It waits until the page has loaded and the browser is idle: Google's script
 * is 87 KB, and on a phone's data it was competing with the page's own first
 * picture. The prompt still arrives within a few seconds of landing.
 */
export function GooglePrompt({ locale, afterSignOut }: { locale: string; afterSignOut: boolean }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await pageSettled();
      if (cancelled) return;
      const setup = (await fetch('/auth/google/onetap', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as
        | { available: boolean; clientId?: string; nonce?: string }
        | null;
      if (cancelled || !setup?.available || !setup.clientId || !setup.nonce) return;
      await loadScript(`https://accounts.google.com/gsi/client?hl=${encodeURIComponent(locale)}`);
      const id = window.google?.accounts?.id;
      if (cancelled || !id) return;
      if (afterSignOut) id.disableAutoSelect();
      id.initialize({
        client_id: setup.clientId,
        nonce: setup.nonce,
        auto_select: !afterSignOut,
        cancel_on_tap_outside: true,
        context: 'signin',
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }: { credential: string }) => {
          const result = (await fetch('/auth/google/onetap', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credential, next: window.location.pathname + window.location.search }),
          })
            .then((r) => r.json())
            .catch(() => null)) as { ok: boolean; to?: string; reason?: string } | null;
          window.location.assign(result?.ok && result.to ? result.to : `/login?google=${result?.reason ?? 'failed'}`);
        },
      });
      id.prompt();
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, afterSignOut]);
  return null;
}

/** Resolves once the page has loaded and the browser has a moment to spare (or after a few seconds regardless). */
function pageSettled(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 4000 });
      else setTimeout(resolve, 2500);
    };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[data-google-gsi]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.googleGsi = '';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
