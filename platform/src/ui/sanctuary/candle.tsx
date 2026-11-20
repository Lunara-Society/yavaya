'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Encender una vela por alguien" (docs/sanctuary/CANDLE.md).
 *
 * The candle is a film made once — Blender for the candle and its flame,
 * HyperFrames for the light that comes down from the prayer to light it and
 * the warm dark around it (tools/sanctuary-candle) — in two pieces: the
 * lighting, and a burning loop that its last frame runs into. The day's
 * prayer is real text laid over the dark above the flame, so it is the
 * reader's own language and size and can be read aloud by their phone.
 *
 * Sending uses the phone's own share sheet (Web Share): the apps the person
 * has installed appear, and they choose the app and then whom. Where the
 * phone can share files, the film itself can be sent too. Without a share
 * sheet (most computers), WhatsApp and copying the link remain.
 */

export type CandleFilm = { light: string; loop: string; unlit: string; lit: string; share: string };

export type CandleLabels = Record<
  | 'today' | 'for_label' | 'for_placeholder' | 'intention_label' | 'intention_placeholder' | 'anonymous' | 'light' | 'lighting' | 'lit_title' | 'lit_text'
  | 'for_line' | 'send' | 'send_video' | 'copy' | 'copied' | 'whatsapp' | 'view' | 'another' | 'share_title' | 'share_text' | 'share_text_named' | 'error' | 'stage',
  string
> & { errors: Record<string, string> };

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

/**
 * The stage: the prayer above, the candle, and whoever it is for beneath the
 * flame. `phase` decides which film shows; the lighting's last frame stays
 * under the loop until the loop is really playing, so the change is unseen.
 */
export function CandleStage({ film, prayer, prayerLabel, phase, onLit, below, label }: { film: CandleFilm; prayer: string; prayerLabel: string; phase: 'unlit' | 'lighting' | 'lit'; onLit?: () => void; below?: React.ReactNode; label: string }) {
  const lighting = useRef<HTMLVideoElement>(null);
  const loop = useRef<HTMLVideoElement>(null);
  const [looping, setLooping] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (phase !== 'lighting') return;
    if (reduced) {
      onLit?.();
      return;
    }
    const video = lighting.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => onLit?.());
  }, [phase, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'lit' || reduced) return;
    const video = loop.current;
    if (!video) return;
    void video.play().catch(() => undefined);
  }, [phase, reduced]);

  return (
    <div className="vela-stage" data-phase={phase} role="img" aria-label={label}>
      {/* The unlit candle, then the lighting; its last frame is the loop's first. */}
      <video
        ref={lighting}
        className="vela-film"
        src={film.light}
        poster={film.unlit}
        muted
        playsInline
        preload="auto"
        data-on={phase !== 'lit' || !looping ? '' : undefined}
        onEnded={() => onLit?.()}
      />
      {phase === 'lit' && !reduced ? <video ref={loop} className="vela-film" src={film.loop} poster={film.lit} muted playsInline loop preload="auto" data-on={looping ? '' : undefined} onPlaying={() => setLooping(true)} /> : null}
      {/* With reduced motion: the lit candle, still. */}
      {phase === 'lit' && reduced ? (
        // eslint-disable-next-line @next/next/no-img-element -- a still of the film, in /public
        <img className="vela-film" src={film.lit} alt="" data-on="" />
      ) : null}
      <div className="vela-prayer">
        <p className="vela-eyebrow">{prayerLabel}</p>
        <blockquote>{prayer}</blockquote>
      </div>
      {below ? <div className="vela-below">{below}</div> : null}
    </div>
  );
}

export function CandleLighter({ film, prayer, labels, days }: { film: CandleFilm; prayer: string; labels: CandleLabels; days: number }) {
  const [phase, setPhase] = useState<'unlit' | 'lighting' | 'lit'>('unlit');
  const [name, setName] = useState('');
  const [intention, setIntention] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);
  const stageBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
    try {
      const probe = new File([new Blob([''], { type: 'video/mp4' })], 'vela.mp4', { type: 'video/mp4' });
      setCanShareFile(typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
  }, []);

  const url = path && typeof window !== 'undefined' ? `${window.location.origin}${path}` : '';
  const who = name.trim();
  const text = who ? fill(labels.share_text_named, { name: who }) : labels.share_text;

  async function light() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/sanctuary/candles', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ forName: name, intention, anonymous }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; path?: string; error?: string } | null;
    setBusy(false);
    if (!response?.ok || !body?.path) return setError((body?.error && labels.errors[body.error]) || labels.error);
    setPath(body.path);
    setPhase('lighting');
    // The form folds away as the light comes down: bring the candle into view, so the lighting is seen, not missed below.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stageBox.current?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }

  async function send() {
    if (!url) return;
    try {
      await navigator.share({ title: labels.share_title, text, url });
    } catch {
      // Closed without choosing: nothing to do.
    }
  }

  async function sendFilm() {
    if (!url) return;
    try {
      const blob = await (await fetch(film.share)).blob();
      const file = new File([blob], 'vela.mp4', { type: 'video/mp4' });
      // The film carries no name; the words and the link go with it, so they open the candle that is theirs.
      await navigator.share({ files: [file], title: labels.share_title, text: `${text} ${url}` });
    } catch {
      // Closed, or the app took the file without the words: the link button remains.
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="vela">
      <div ref={stageBox}>
        <CandleStage
          film={film}
          prayer={prayer}
          prayerLabel={labels.today}
          phase={phase}
          label={labels.stage}
          onLit={() => setPhase('lit')}
          below={
            phase === 'lit' ? (
              <>
                {who ? <p className="vela-for">{fill(labels.for_line, { name: who })}</p> : null}
                {/* The one thing to do next, on the candle itself, where the eyes already are. */}
                {canShare ? (
                  <button type="button" className="vela-light vela-send" onClick={() => void send()}>
                    {labels.send}
                  </button>
                ) : (
                  <a className="vela-light vela-send" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
                    {labels.whatsapp}
                  </a>
                )}
              </>
            ) : null
          }
        />
      </div>
      {phase === 'unlit' ? (
        <form
          className="vela-form"
          onSubmit={(event) => {
            event.preventDefault();
            void light();
          }}
        >
          <label className="vela-field">
            {labels.for_label}
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder={labels.for_placeholder} autoComplete="off" />
          </label>
          <label className="vela-field">
            {labels.intention_label}
            <input value={intention} onChange={(event) => setIntention(event.target.value)} maxLength={140} placeholder={labels.intention_placeholder} autoComplete="off" />
          </label>
          <label className="vela-check">
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> {labels.anonymous}
          </label>
          <button className="vela-light" type="submit" disabled={busy}>
            {busy ? labels.lighting : labels.light}
          </button>
          {error ? (
            <p className="vela-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {phase === 'lit' ? (
        <section className="vela-sent" aria-live="polite">
          <h2>{labels.lit_title}</h2>
          <p>{fill(labels.lit_text, { days })}</p>
          <div className="vela-actions">
            {canShareFile ? (
              <button type="button" className="vela-line" onClick={() => void sendFilm()}>
                {labels.send_video}
              </button>
            ) : null}
            <button type="button" className="vela-line" onClick={() => void copy()}>
              {copied ? labels.copied : labels.copy}
            </button>
          </div>
          <p className="vela-more">
            {path ? <a href={path}>{labels.view}</a> : null}
            <button
              type="button"
              className="vela-link"
              onClick={() => {
                setPhase('unlit');
                setPath(null);
                setName('');
                setIntention('');
                setCopied(false);
              }}
            >
              {labels.another}
            </button>
          </p>
        </section>
      ) : null}
    </div>
  );
}

/** The page the candle is sent to: it lights itself once, then burns; or, burned out, rests. */
export function CandleShrine({ film, prayer, prayerLabel, burning, label, lead, children }: { film: CandleFilm; prayer: string; prayerLabel: string; burning: boolean; label: string; /** Who lit it and for whom: on the candle, once alight. */ lead: React.ReactNode; children: React.ReactNode }) {
  const [phase, setPhase] = useState<'unlit' | 'lighting' | 'lit'>(burning ? 'lighting' : 'unlit');
  return (
    <div className="vela">
      <CandleStage film={film} prayer={prayer} prayerLabel={prayerLabel} phase={phase} label={label} onLit={() => setPhase('lit')} below={phase === 'lit' || !burning ? lead : null} />
      {/* The words come once the flame has caught, as if it had brought them; a candle burned out shows them at once. */}
      {phase === 'lit' || !burning ? <div className="vela-after">{children}</div> : null}
    </div>
  );
}
