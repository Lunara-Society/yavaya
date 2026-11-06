'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ROXI_ASK_EVENT } from '@/ui/roxi/ask';
import { COMPLETED_MS, IDLE_RAW, readRoxiState, subscribeRoxiState, toVisual, type RoxiRaw, type RoxiVisual } from '@/ui/roxi/state-bus';
import { sound } from './sound';

export type RoxiPresenceLabels = Record<RoxiVisual, string> & {
  name: string;
  talk: string;
  visitor: string;
  enter: string;
};

/**
 * Roxi on the First Light: her orb, and one line saying what she is doing.
 * The state is hers (ui/roxi/state-bus.ts), never animated for show: idle
 * when nothing is happening, and "awaiting" only while a confirmation card
 * really waits for the member.
 *
 * A visitor sees who she is and the way in; a member opens her.
 */
export function RoxiPresence({ labels, signedIn, enterHref }: { labels: RoxiPresenceLabels; signedIn: boolean; enterHref: string }) {
  const [raw, setRaw] = useState<RoxiRaw>(IDLE_RAW);
  const [, setTick] = useState(0);
  const previous = useRef<RoxiVisual>('unavailable');

  useEffect(() => {
    setRaw(readRoxiState());
    return subscribeRoxiState(setRaw);
  }, []);

  const visual = signedIn ? toVisual(raw, Date.now()) : 'unavailable';

  // "completed" lasts a moment, then she is idle again: re-render when it ends.
  useEffect(() => {
    if (visual !== 'completed') return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), COMPLETED_MS - (Date.now() - raw.completedAt) + 30);
    return () => window.clearTimeout(timer);
  }, [visual, raw.completedAt]);

  useEffect(() => {
    if (visual === 'completed' && previous.current !== 'completed') sound().play('roxi-done');
    previous.current = visual;
  }, [visual]);

  const orb = (
    <span className="fl-orb" data-state={visual} aria-hidden="true">
      <i className="fl-orb-halo" />
      <i className="fl-orb-ring fl-orb-ring-a" />
      <i className="fl-orb-ring fl-orb-ring-b" />
      <i className="fl-orb-core">
        <i className="fl-orb-iris" />
      </i>
      <i className="fl-orb-spark" />
    </span>
  );

  if (!signedIn) {
    return (
      <div className="fl-roxi is-visitor">
        {orb}
        <p className="fl-roxi-text">
          <strong>{labels.name}</strong>
          <span>{labels.visitor}</span>
        </p>
        <Link className="fl-roxi-go" href={enterHref} data-fl-magnetic>
          {labels.enter}
        </Link>
      </div>
    );
  }

  const ready = raw.available;
  return (
    <div className="fl-roxi" data-state={visual}>
      {orb}
      <p className="fl-roxi-text">
        <strong>{labels.name}</strong>
        <span>{labels[visual]}</span>
      </p>
      <button
        type="button"
        className="fl-roxi-go"
        data-fl-magnetic
        disabled={!ready || raw.open}
        onClick={() => {
          sound().play('roxi');
          window.dispatchEvent(new CustomEvent(ROXI_ASK_EVENT, { detail: { text: '' } }));
        }}
      >
        {labels.talk}
      </button>
    </div>
  );
}
