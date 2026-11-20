'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RoxiLabels, RoxiPresenceLabels } from './labels';
import type { RoxiMember, RoxiOpening } from './roxi-panel';
import { RoxiPresence } from './presence';
import { ROXI_ASK_EVENT, ROXI_PHOTO_EVENT, type RoxiPhotoHandoff } from './ask';
import { RoxiWelcomeNote, type RoxiWelcome } from './welcome-note';
import { publishRoxiState } from './state-bus';
import { ROXI_PUBLISHED_EVENT, takePublished } from './receipt';

const RoxiPanel = dynamic(() => import('./roxi-panel'), { ssr: false });
// Opened from the panel or the check-in, rarely: it loads when asked for, not with every page.
const RoxiSettingsSheet = dynamic(() => import('./settings-sheet').then((module) => module.RoxiSettingsSheet), { ssr: false });

type Session =
  | { enabled: false }
  | {
      enabled: true;
      locale: string;
      member: RoxiMember;
      labels: RoxiLabels;
      refusals: Record<string, string>;
      presence: RoxiPresenceLabels;
      welcome: RoxiWelcome | null;
      /** The listing flagship: drafts on the server, the review card, the receipt (docs/roxi/FLAGSHIP.md). */
      review?: boolean;
      /** Her face: the Halo (docs/roxi/HALO.md), or the gold orb while that look is off. */
      halo?: boolean;
    };

/**
 * Pages where Roxi is not offered, and where an open conversation ends:
 * Espacio Violeta, whose whole point is that what is said there stays there,
 * and the sign-in and appeal flows, where someone is not yet (or no longer)
 * a member in good standing.
 */
const QUIET = /^\/(violeta|login|register|verify|reset|apelacion|auth|play)(\/|$)/;

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
/** The language the widget last asked its labels for (one tab, one widget). */
let askedFor = '';

export function RoxiRoot() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<RoxiOpening>('none');
  const [settings, setSettings] = useState(false);
  const [welcome, setWelcome] = useState<RoxiWelcome | null>(null);
  const [ask, setAsk] = useState<{ text: string; id: number } | null>(null);
  const [photo, setPhoto] = useState<(RoxiPhotoHandoff & { id: number }) | null>(null);
  const [published, setPublished] = useState<{ listingId: string; id: number } | null>(null);
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

  /*
   * The labels came in the language of the first page. When the member
   * changes language (settings, the language menu) the page's <html lang>
   * changes but this component, in the root layout, stays — and kept saying
   * "Tu asistente de Yavaya" on English pages. On the next page, a different
   * language asks again, keeping an open conversation open.
   */
  useEffect(() => {
    const lang = document.documentElement.lang;
    // Once per language: if the answer still differs, asking again would only loop.
    if (!session?.enabled || !lang || lang === session.locale || askedFor === lang) return;
    askedFor = lang;
    fetch('/api/roxi/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Session | null) => body?.enabled && setSession(body))
      .catch(() => undefined);
  }, [pathname, session]);

  // Whether she is here at all, for the presence shown elsewhere on the page (state-bus.ts).
  const available = Boolean(session?.enabled) && !quiet;
  useEffect(() => {
    publishRoxiState({ available, open: available && open });
  }, [available, open]);

  /*
   * The panel (and with it the voice library) is fetched once the page is idle,
   * not on the first tap. On an iPhone, sound may only start from a tap, and the
   * library unlocks it by listening for taps from the moment it loads: loaded
   * by the tap on "Hablar con Roxi" itself, it arrived too late, and Roxi was
   * heard by nobody while she heard the member perfectly well.
   */
  useEffect(() => {
    if (!available) return;
    const warm = () => void import('./roxi-panel').catch(() => undefined);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(warm, 2500);
    return () => clearTimeout(timer);
  }, [available]);

  // Any page can open Roxi with a request already said (ROXI_ASK_EVENT, { text }), or with a photo chosen on its camera button (ROXI_PHOTO_EVENT, photo-button.tsx).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: unknown } & Partial<RoxiPhotoHandoff>>).detail;
      setWelcome(null);
      setOpening('none');
      setOpen(true);
      if (event.type === ROXI_PHOTO_EVENT) {
        if (detail?.file) setPhoto({ file: detail.file, selling: Boolean(detail.selling), caption: detail.caption, id: Date.now() });
      } else if (typeof detail?.text === 'string' && detail.text.trim()) setAsk({ text: detail.text.trim().slice(0, 300), id: Date.now() });
    };
    window.addEventListener(ROXI_ASK_EVENT, onOpen);
    window.addEventListener(ROXI_PHOTO_EVENT, onOpen);
    return () => {
      window.removeEventListener(ROXI_ASK_EVENT, onOpen);
      window.removeEventListener(ROXI_PHOTO_EVENT, onOpen);
    };
  }, []);


  /*
   * A listing Roxi drafted was just published (receipt.ts): she opens with the
   * receipt, so the member sees what it cost and where it is, and a live
   * conversation is told the same. Taken from storage too, for a publish that
   * happened while she was not on the page.
   */
  const review = Boolean(session?.enabled && session.review);
  const halo = Boolean(session?.enabled && session.halo);
  useEffect(() => {
    if (!review || quiet) return;
    const show = () => {
      const listingId = takePublished();
      if (!listingId) return;
      setWelcome(null);
      setPublished({ listingId, id: Date.now() });
      setOpen(true);
    };
    show();
    window.addEventListener(ROXI_PUBLISHED_EVENT, show);
    return () => window.removeEventListener(ROXI_PUBLISHED_EVENT, show);
  }, [review, quiet, pathname]);

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
          refusals={session.refusals}
          openedBy={opening}
          ask={ask}
          photo={photo}
          review={review}
          halo={halo}
          published={published}
          onSettings={() => setSettings(true)}
          onClose={() => {
            setOpen(false);
            setOpening('none');
          }}
        />
      ) : (
        <button type="button" className="roxi-launch" onClick={() => show('none')} aria-label={session.labels.open}>
          <span className={`roxi-launch-orb${halo ? ' is-halo' : ''}`} aria-hidden="true">
            {/* The Halo as an image (public/roxi/halo-mark.svg), so the launcher on every page carries no extra script; site.css sizes it. */}
            {halo ? <img className="roxi-launch-halo" src="/roxi/halo-mark.svg" alt="" /> : <span className="roxi-sphere" />}
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
