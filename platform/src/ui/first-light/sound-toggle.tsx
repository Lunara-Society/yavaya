'use client';

import { useEffect, useState } from 'react';
import { readSoundPreference, sound, SOUND_EVENT } from './sound';

/**
 * The one switch for the page's sounds. Off until pressed; the name stays
 * "Sonido" and aria-pressed carries the state, so a screen reader hears a
 * toggle rather than a label that changes under it.
 */
export function SoundToggle({ name, onText, offText }: { name: string; onText: string; offText: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(readSoundPreference());
    const follow = (event: Event) => setOn(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(SOUND_EVENT, follow);
    return () => window.removeEventListener(SOUND_EVENT, follow);
  }, []);

  return (
    <button type="button" className="fl-sound" aria-pressed={on} aria-label={name} data-fl-magnetic onClick={() => sound().setEnabled(!on)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
        {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
      </svg>
      <span aria-hidden="true">{on ? onText : offText}</span>
    </button>
  );
}
