'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ROXI_RULES } from '@/config/business-rules';
import type { RoxiPresenceLabels } from './labels';
import { PRESENCE_KEY, readPrefs, writePrefs, type RoxiPrefs } from './prefs';
import { afterCall, afterCheckIn, callAfterMinutes, callDue, checkInDue, FORM_PAGE, type PresenceMemory } from './presence-rules';

/**
 * Roxi stepping forward on her own, only as far as the member allowed in her
 * settings (presence-rules.ts decides when):
 *
 * - Available: one small check-in a day at most, after a while of browsing,
 *   that tucks itself away after a few seconds. On a form it offers help
 *   finishing it.
 * - Proactive (chosen by the member): also a simulated call inside the page.
 *   It rings for at most ROXI_RULES.callRingSeconds, with Answer and Decline;
 *   declining or letting it ring out rests calls for a day. It is a page
 *   element, not a phone call: it cannot ring with the site closed, and the
 *   card says so.
 *
 * Both say why they appeared and offer to turn themselves off. Counts of what
 * happened go to /api/roxi/presence (numbers per day, no one's identity), so
 * the owner can see whether this helps people finish things, not just whether
 * it gets clicks.
 */

const BROWSE_KEY = 'roxi.browse.v1';
const TICK_MS = 15_000;

export type PresenceEvent =
  | 'checkin_shown'
  | 'checkin_opened'
  | 'checkin_dismissed'
  | 'checkin_silenced'
  | 'call_rang'
  | 'call_answered'
  | 'call_declined'
  | 'call_missed';

export function reportPresence(event: PresenceEvent | 'prompted_task'): void {
  void fetch('/api/roxi/presence', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
}

function readMemory(): PresenceMemory {
  try {
    const value = JSON.parse(window.localStorage.getItem(PRESENCE_KEY) ?? 'null') as PresenceMemory | null;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeMemory(memory: PresenceMemory): void {
  try {
    window.localStorage.setItem(PRESENCE_KEY, JSON.stringify(memory));
  } catch {
    // Without storage the rules still hold for this page: nothing repeats within it.
  }
}

function readBrowse(): { seconds: number; ringAt: number } {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(BROWSE_KEY) ?? 'null') as { seconds?: number; ringAt?: number } | null;
    if (value && typeof value.seconds === 'number' && typeof value.ringAt === 'number') return { seconds: value.seconds, ringAt: value.ringAt };
  } catch {
    // fall through
  }
  return { seconds: 0, ringAt: callAfterMinutes(Math.random()) };
}

/** A soft two-note chime every two seconds, made in the page (no audio file, no autoplay of media). */
function startRingtone(): () => void {
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    void context.resume().catch(() => undefined);
  } catch {
    return () => undefined;
  }
  const ctx = context;
  const chime = () => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.22, 660],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.55);
    }
  };
  chime();
  const timer = window.setInterval(chime, 2000);
  return () => {
    window.clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
}

export function RoxiPresence({
  labels,
  engaged,
  onOpen,
  onAnswer,
  onSettings,
}: {
  labels: RoxiPresenceLabels;
  /** Roxi is open, or a welcome note is showing: nothing else steps forward. */
  engaged: boolean;
  onOpen: () => void;
  onAnswer: () => void;
  onSettings: () => void;
}) {
  const [prefs, setPrefs] = useState<RoxiPrefs | null>(null);
  const [showing, setShowing] = useState<'checkin' | 'call' | null>(null);
  const [onForm, setOnForm] = useState(false);
  const browse = useRef<{ seconds: number; ringAt: number } | null>(null);
  const stopRing = useRef<(() => void) | null>(null);

  useEffect(() => {
    setPrefs(readPrefs());
    const onChange = () => setPrefs(readPrefs());
    window.addEventListener('roxi:prefs', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('roxi:prefs', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const hide = useCallback(() => {
    stopRing.current?.();
    stopRing.current = null;
    setShowing(null);
  }, []);

  // Opening Roxi any other way puts away whatever was showing.
  useEffect(() => {
    if (engaged) hide();
  }, [engaged, hide]);

  // Count visible browsing time in this tab, and ask the rules every tick.
  useEffect(() => {
    if (!prefs || prefs.mode === 'quiet') return;
    browse.current ??= readBrowse();
    const tick = () => {
      const state = browse.current!;
      const visible = document.visibilityState === 'visible';
      if (visible && !engaged) state.seconds += TICK_MS / 1000;
      try {
        window.sessionStorage.setItem(BROWSE_KEY, JSON.stringify(state));
      } catch {
        // counted in memory only
      }
      if (showing) return;
      const context = { now: new Date(), pathname: window.location.pathname, prefs, memory: readMemory(), browsingMinutes: state.seconds / 60, engaged, visible };
      if (callDue(context, state.ringAt)) {
        writeMemory(afterCall(context.memory, context.now));
        setShowing('call');
        reportPresence('call_rang');
      } else if (checkInDue(context)) {
        writeMemory(afterCheckIn(context.memory, context.now));
        // The address says a form lives here; whether it is on screen depends on
        // the member (an employer not yet verified sees a notice instead).
        setOnForm(FORM_PAGE.test(context.pathname) && document.querySelector('main form') !== null);
        setShowing('checkin');
        reportPresence('checkin_shown');
      }
    };
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [prefs, engaged, showing]);

  // The check-in goes away by itself; the call rings out.
  useEffect(() => {
    if (showing === 'checkin') {
      const timer = window.setTimeout(() => {
        hide();
        reportPresence('checkin_dismissed');
      }, ROXI_RULES.checkInVisibleSeconds * 1000);
      return () => window.clearTimeout(timer);
    }
    if (showing === 'call') {
      stopRing.current = startRingtone();
      if ('vibrate' in navigator) navigator.vibrate?.([300, 200, 300]);
      const timer = window.setTimeout(() => {
        hide();
        reportPresence('call_missed');
      }, ROXI_RULES.callRingSeconds * 1000);
      return () => {
        window.clearTimeout(timer);
        stopRing.current?.();
        stopRing.current = null;
      };
    }
  }, [showing, hide]);

  if (!showing || !prefs) return null;

  if (showing === 'checkin') {
    return (
      <aside className="roxi-checkin" role="status" aria-live="polite">
        <span className="roxi-note-orb" aria-hidden="true">
          <span className="roxi-sphere" />
        </span>
        <p>{onForm ? labels['checkin.form'] : labels['checkin.text']}</p>
        <div className="roxi-checkin-actions">
          <button
            type="button"
            className="roxi-note-link is-strong"
            onClick={() => {
              hide();
              reportPresence('checkin_opened');
              onOpen();
            }}
          >
            {labels['checkin.open']}
          </button>
          <button
            type="button"
            className="roxi-note-link"
            onClick={() => {
              hide();
              reportPresence('checkin_dismissed');
            }}
          >
            {labels['checkin.later']}
          </button>
          <button
            type="button"
            className="roxi-note-link"
            onClick={() => {
              writePrefs({ ...prefs, mode: 'quiet' });
              hide();
              reportPresence('checkin_silenced');
            }}
          >
            {labels['checkin.never']}
          </button>
        </div>
        <button type="button" className="roxi-why" onClick={onSettings}>
          {labels['checkin.why']}
        </button>
      </aside>
    );
  }

  return (
    <aside className="roxi-call" role="alertdialog" aria-labelledby="roxi-call-title" aria-describedby="roxi-call-sub">
      <span className="roxi-call-orb" aria-hidden="true">
        <span className="roxi-sphere" />
      </span>
      <div className="roxi-call-text">
        <strong id="roxi-call-title">{labels['call.title']}</strong>
        <small id="roxi-call-sub">{labels['call.sub']}</small>
      </div>
      <div className="roxi-call-actions">
        <button
          type="button"
          className="roxi-call-btn is-decline"
          onClick={() => {
            hide();
            reportPresence('call_declined');
          }}
        >
          {labels['call.decline']}
        </button>
        <button
          type="button"
          className="roxi-call-btn is-answer"
          onClick={() => {
            hide();
            reportPresence('call_answered');
            onAnswer();
          }}
        >
          {labels['call.answer']}
        </button>
      </div>
      <p className="roxi-call-why">
        {labels['call.why']}{' '}
        <button
          type="button"
          className="roxi-why"
          onClick={() => {
            writePrefs({ ...prefs, mode: 'available' });
            hide();
            reportPresence('call_declined');
          }}
        >
          {labels['call.off']}
        </button>
      </p>
    </aside>
  );
}
