'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoxiWelcomeLabels } from './labels';

const BARS = 28;

export type RoxiWelcome = { delayMs: number; text: string; labels: RoxiWelcomeLabels };

/**
 * A voice note from Roxi, for the one person the server says it is for
 * (src/server/domains/roxi/welcome.ts), ten seconds after they sign in.
 *
 * It tries to play by itself; most browsers refuse sound before the visitor
 * has touched the page, and then the card simply waits with a play button —
 * nothing pretends it played. The words are always there to read. Playing
 * it, or closing it, tells the server this login heard its note, so it is
 * not offered again on this login.
 */
export function RoxiWelcomeNote({ welcome, onTalk, onDone }: { welcome: RoxiWelcome; onTalk: () => void; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const recorded = useRef(false);

  const record = () => {
    if (recorded.current) return;
    recorded.current = true;
    void fetch('/api/roxi/welcome', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), welcome.delayMs);
    return () => window.clearTimeout(timer);
  }, [welcome.delayMs]);

  useEffect(() => {
    if (!visible || !audio.current) return;
    audio.current.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }, [visible]);

  if (!visible) return null;

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (playing) {
      element.pause();
      return;
    }
    if (ended) element.currentTime = 0;
    void element.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  };

  const close = () => {
    audio.current?.pause();
    record();
    onDone();
  };

  return (
    <aside className="roxi-note" role="dialog" aria-label={welcome.labels.title} data-playing={playing || undefined}>
      <audio
        ref={audio}
        src="/api/roxi/welcome/audio"
        preload="auto"
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          record();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          setProgress(1);
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (element.duration) setProgress(element.currentTime / element.duration);
        }}
      />
      <div className="roxi-note-head">
        <span className="roxi-note-orb" aria-hidden="true">
          <span className="roxi-sphere" />
        </span>
        <strong>{welcome.labels.title}</strong>
        <button type="button" className="roxi-icon" onClick={close} aria-label={welcome.labels.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <div className="roxi-note-player">
        <button type="button" className="roxi-note-play" onClick={toggle} aria-label={playing ? welcome.labels.pause : ended ? welcome.labels.again : welcome.labels.play}>
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </button>
        <span className="roxi-note-wave" aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => (
            <i key={i} data-done={i / BARS < progress || undefined} />
          ))}
        </span>
      </div>
      {blocked && !playing ? <p className="roxi-note-hint">{welcome.labels.tap}</p> : null}
      {reading ? <p className="roxi-note-text">{welcome.text}</p> : null}
      <div className="roxi-note-actions">
        <button type="button" className="roxi-note-link" onClick={() => setReading((value) => !value)} aria-expanded={reading}>
          {welcome.labels.read}
        </button>
        <button
          type="button"
          className="roxi-note-link is-strong"
          onClick={() => {
            audio.current?.pause();
            record();
            onTalk();
          }}
        >
          {welcome.labels.talk}
        </button>
      </div>
    </aside>
  );
}
