'use client';

import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Speak instead of type, for a text field of a form (the owner's idea of
 * 13 November 2026: posting for people who do not type easily).
 *
 * The browser's own speech recognition does the listening; what it hears is
 * added to the end of the field, where the member can read and correct it
 * before publishing. Nothing is sent anywhere by Yavaya. The browser may send
 * the sound to its maker to be transcribed (Chrome does, to Google), which
 * the hint says. Where the browser cannot do it (Firefox, for one), the
 * button is not shown at all.
 */
export function Dictate({ target, lang, labels }: { target: string; lang: string; labels: { start: string; stop: string; hint: string; failed: string } }) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAvailable(recognitionCtor() !== null);
    return () => recognition.current?.stop();
  }, []);

  const field = () => anchor.current?.closest('form')?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${target}"]`) ?? null;

  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const listener = new Ctor();
    listener.lang = lang === 'en' ? 'en-US' : 'es-419';
    listener.interimResults = false;
    listener.continuous = true;
    listener.onresult = (event) => {
      const input = field();
      if (!input) return;
      let heard = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) heard += result[0]?.transcript ?? '';
      }
      heard = heard.trim();
      if (!heard) return;
      const before = input.value.trimEnd();
      const max = input.maxLength > 0 ? input.maxLength : Infinity;
      input.value = `${before}${before ? ' ' : ''}${heard.charAt(0).toUpperCase()}${heard.slice(1)}`.slice(0, max);
      // Let the form's own checks see the change, as if it had been typed.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    listener.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') setFailed(true);
    };
    listener.onend = () => setListening(false);
    recognition.current = listener;
    setFailed(false);
    try {
      listener.start();
      setListening(true);
    } catch {
      setFailed(true);
    }
  };

  if (!available) return <div ref={anchor} hidden />;
  return (
    <div ref={anchor} className="dictate">
      <button type="button" className={listening ? 'btn btn-gold dictate-btn is-on' : 'btn btn-line dictate-btn'} aria-pressed={listening} onClick={toggle}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
        {listening ? labels.stop : labels.start}
      </button>
      <span className="hint">{failed ? labels.failed : labels.hint}</span>
    </div>
  );
}
