'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RoxiLabels } from './labels';
import type { RoxiMember } from './roxi-panel';

const RoxiPanel = dynamic(() => import('./roxi-panel'), { ssr: false });

type Session = { enabled: false } | { enabled: true; locale: string; member: RoxiMember; labels: RoxiLabels };

/**
 * Pages where Roxi is not offered, and where an open conversation ends:
 * Espacio Violeta, whose whole point is that what is said there stays there,
 * and the sign-in and appeal flows, where someone is not yet (or no longer)
 * a member in good standing.
 */
const QUIET = /^\/(violeta|login|register|verify|reset|apelacion|auth)(\/|$)/;

/**
 * Lives in the root layout, so a conversation survives moving between pages:
 * Roxi can open a form and keep talking while the member fills it in.
 *
 * Asks the server whether to appear at all — only for a signed-in member, and
 * only when an agent is configured — and asks again after navigation while
 * the answer is no, so signing in brings the button without a reload.
 */
export function RoxiRoot() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const quiet = QUIET.test(pathname);

  useEffect(() => {
    if (session?.enabled || quiet) return;
    let cancelled = false;
    fetch('/api/roxi/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((body: Session) => {
        if (!cancelled) setSession(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, quiet, session?.enabled]);

  useEffect(() => {
    if (quiet) setOpen(false);
  }, [quiet]);

  if (!session?.enabled || quiet) return null;

  return (
    <div className="roxi" data-open={open || undefined}>
      {open ? (
        <RoxiPanel member={session.member} locale={session.locale} labels={session.labels} onClose={() => setOpen(false)} />
      ) : (
        <button type="button" className="roxi-launch" onClick={() => setOpen(true)} aria-label={session.labels.open}>
          <span className="roxi-face" aria-hidden="true">
            R
          </span>
          <span className="roxi-launch-name">{session.labels.name}</span>
        </button>
      )}
    </div>
  );
}
