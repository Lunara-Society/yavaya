'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RoxiLabels, RoxiPresenceLabels } from './labels';
import type { RoxiMember, RoxiOpening } from './roxi-panel';
import { RoxiPresence } from './presence';
import { RoxiSettingsSheet } from './settings-sheet';
import { RoxiWelcomeNote, type RoxiWelcome } from './welcome-note';

const RoxiPanel = dynamic(() => import('./roxi-panel'), { ssr: false });

type Session =
  | { enabled: false }
  | { enabled: true; locale: string; member: RoxiMember; labels: RoxiLabels; presence: RoxiPresenceLabels; welcome: RoxiWelcome | null };

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
 *
 * Besides the panel it holds what Roxi does on her own, each within what the
 * member allowed: a welcome voice note for its one recipient, the check-in
 * and the simulated call (presence.tsx), and her settings.
 */
export function RoxiRoot() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<RoxiOpening>('none');
  const [settings, setSettings] = useState(false);
  const [welcome, setWelcome] = useState<RoxiWelcome | null>(null);
  const quiet = QUIET.test(pathname);

  useEffect(() => {
    if (session?.enabled || quiet) return;
    let cancelled = false;
    fetch('/api/roxi/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((body: Session) => {
        if (cancelled) return;
        setSession(body);
        if (body.enabled) setWelcome(body.welcome ?? null);
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

  const show = (how: RoxiOpening) => {
    setWelcome(null);
    setOpening(how);
    setOpen(true);
  };

  return (
    <div className="roxi" data-open={open || undefined}>
      {open ? (
        <RoxiPanel
          member={session.member}
          locale={session.locale}
          labels={session.labels}
          openedBy={opening}
          onSettings={() => setSettings(true)}
          onClose={() => {
            setOpen(false);
            setOpening('none');
          }}
        />
      ) : (
        <button type="button" className="roxi-launch" onClick={() => show('none')} aria-label={session.labels.open}>
          <span className="roxi-launch-orb" aria-hidden="true">
            <span className="roxi-sphere" />
          </span>
          <span className="roxi-launch-text" aria-hidden="true">
            <strong>{session.labels.name}</strong>
            <small>{session.labels.role}</small>
          </span>
        </button>
      )}
      {welcome && !open ? <RoxiWelcomeNote welcome={welcome} onTalk={() => show('none')} onDone={() => setWelcome(null)} /> : null}
      <RoxiPresence
        labels={session.presence}
        engaged={open || welcome !== null || settings}
        onOpen={() => show('checkin')}
        onAnswer={() => show('call')}
        onSettings={() => setSettings(true)}
      />
      {settings ? <RoxiSettingsSheet labels={session.presence} onClose={() => setSettings(false)} /> : null}
    </div>
  );
}
