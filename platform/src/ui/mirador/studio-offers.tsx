'use client';

import { useState } from 'react';
import { OfferFields, type OfferDraft, type OfferLabels } from './upload';

/**
 * The studio's commerce and voice controls (docs/mirador/README.md, "Offers"
 * and "Voiceover"): put an offer on a video or close it, answer the requests
 * that came in, follow one's own, and give a video Roxi's voice. Each one
 * calls its route and reloads the page, which then shows the server's truth.
 */

type Result = { ok: boolean; error: string | null; details: Record<string, unknown> };

async function call(url: string, method: string, body: unknown): Promise<Result> {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!response) return { ok: false, error: null, details: {} };
  const data = (await response.json().catch(() => null)) as { error?: unknown; details?: Record<string, unknown> } | null;
  return { ok: response.ok, error: typeof data?.error === 'string' ? data.error : null, details: data?.details ?? {} };
}

const fill = (text: string, values: Record<string, unknown>) => text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

/** The refusal in words, its numbers filled from what the server said. */
const say = (result: Result, labels: { error: string; errors: Record<string, string> }) => {
  const message = result.error ? labels.errors[result.error] : undefined;
  return message ? fill(message, result.details) : labels.error;
};

export type OfferEditorLabels = {
  add: string;
  change: string;
  close: string;
  confirm_close: string;
  save: string;
  cancel: string;
  error: string;
  errors: Record<string, string>;
  offer: OfferLabels;
};

export function OfferEditor({ videoId, initial, summary, labels, hoursList, foodMaxHours }: { videoId: string; initial: OfferDraft; summary: string | null; labels: OfferEditorLabels; hoursList: readonly number[]; foodMaxHours: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OfferDraft>(initial.kind ? initial : { ...initial, kind: 'sale' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (method: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const result = await call(`/api/mirador/videos/${videoId}/offer`, method, body);
    if (result.ok) return window.location.reload();
    setBusy(false);
    setError(say(result, labels));
  };
  if (!editing) {
    return (
      <div className="ms-offer">
        {summary ? <p className="ms-offer-summary">{summary}</p> : null}
        <div className="ms-actions">
          <button type="button" onClick={() => setEditing(true)}>
            {summary ? labels.change : labels.add}
          </button>
          {summary ? (
            <button type="button" disabled={busy} onClick={() => window.confirm(labels.confirm_close) && void run('DELETE', {})}>
              {labels.close}
            </button>
          ) : null}
        </div>
        {error ? <p className="mu-error">{error}</p> : null}
      </div>
    );
  }
  return (
    <form
      className="ms-offer mu-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.kind) void run('POST', { offer: draft });
      }}
    >
      <OfferFields value={draft} onChange={setDraft} labels={labels.offer} hoursList={hoursList} foodMaxHours={foodMaxHours} required />
      <div className="mu-row">
        <button type="submit" className="mf-cta" disabled={busy || !draft.kind}>
          {labels.save}
        </button>
        <button type="button" className="mu-line" onClick={() => setEditing(false)}>
          {labels.cancel}
        </button>
      </div>
      {error ? (
        <p className="mu-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function RequestActions({ id, side, status, labels }: { id: string; side: 'incoming' | 'outgoing'; status: string; labels: { accept: string; decline: string; cancel: string; confirm_cancel: string; error: string; errors: Record<string, string> } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true);
    setError(null);
    const result = await call(`/api/mirador/requests/${id}`, 'POST', { action });
    if (result.ok) return window.location.reload();
    setBusy(false);
    setError(say(result, labels));
  };
  return (
    <div className="ms-actions">
      {side === 'incoming' && status === 'pending' ? (
        <>
          <button type="button" className="is-yes" disabled={busy} onClick={() => void act('accept')}>
            {labels.accept}
          </button>
          <button type="button" disabled={busy} onClick={() => void act('decline')}>
            {labels.decline}
          </button>
        </>
      ) : null}
      {side === 'outgoing' && (status === 'pending' || status === 'accepted') ? (
        <button type="button" disabled={busy} onClick={() => window.confirm(labels.confirm_cancel) && void act('cancel')}>
          {labels.cancel}
        </button>
      ) : null}
      {error ? <span className="mu-error">{error}</span> : null}
    </div>
  );
}

export type VoiceLabels = {
  open: string;
  script: string;
  script_hint: string;
  counter: string;
  starter: string;
  language: string;
  lang_es: string;
  lang_en: string;
  volume: string;
  volume_value: string;
  price: string;
  confirm: string;
  not_enough: string;
  buy: string;
  note: string;
  started: string;
  cancel: string;
  error: string;
  errors: Record<string, string>;
};

/**
 * "Ponerle voz": the script (limited to what the video's length can carry),
 * the voice's language, how loud the video's own sound stays, and the price
 * against the member's balance — all before anything is charged.
 */
export function VoiceForm({ videoId, maxChars, shortChars, prices, balance, starter, language, labels }: { videoId: string; maxChars: number; shortChars: number; prices: { short: number; long: number | null }; balance: number; starter: string; language: 'es' | 'en'; labels: VoiceLabels }) {
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState<'es' | 'en'>(language);
  const [volume, setVolume] = useState(25);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = script.trim().length;
  const cost = length > shortChars ? prices.long : prices.short;
  const short = cost !== null && balance < cost;
  if (started) return <p className="ms-voice-state" role="status">{labels.started}</p>;
  if (!open) {
    return (
      <div className="ms-actions">
        <button type="button" onClick={() => setOpen(true)}>
          {labels.open}
        </button>
      </div>
    );
  }
  return (
    <form
      className="ms-voice mu-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (cost === null || short) return;
        setBusy(true);
        setError(null);
        const result = await call(`/api/mirador/videos/${videoId}/voice`, 'POST', { script, language: voice, originalVolume: volume });
        setBusy(false);
        if (!result.ok) return setError(say(result, labels));
        setStarted(true);
        // The voice takes seconds; the page then shows the narrated video and the tokens spent.
        window.setTimeout(() => window.location.reload(), 20_000);
      }}
    >
      <label className="mu-field">
        {labels.script}
        <textarea value={script} onChange={(event) => setScript(event.target.value)} maxLength={maxChars} rows={4} required />
        <small>
          {labels.script_hint} · {fill(labels.counter, { count: length, max: maxChars })}
        </small>
      </label>
      {starter ? (
        <button type="button" className="mu-line" onClick={() => setScript(starter.slice(0, maxChars))}>
          {labels.starter}
        </button>
      ) : null}
      <div className="mu-pair">
        <label className="mu-field">
          {labels.language}
          <select value={voice} onChange={(event) => setVoice(event.target.value === 'en' ? 'en' : 'es')}>
            <option value="es">{labels.lang_es}</option>
            <option value="en">{labels.lang_en}</option>
          </select>
        </label>
        <label className="mu-field">
          {labels.volume}
          <input type="range" min={0} max={100} step={5} value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          <small>{fill(labels.volume_value, { percent: volume })}</small>
        </label>
      </div>
      {cost !== null ? <p className="ms-voice-price">{fill(labels.price, { count: cost, balance })}</p> : null}
      <p className="mu-note">{labels.note}</p>
      {short ? (
        <p className="mu-note">
          {labels.not_enough}{' '}
          <a href="/tokens">{labels.buy}</a>
        </p>
      ) : null}
      <div className="mu-row">
        <button type="submit" className="mf-cta" disabled={busy || cost === null || short || length < 10}>
          {fill(labels.confirm, { count: cost ?? 0 })}
        </button>
        <button type="button" className="mu-line" onClick={() => setOpen(false)}>
          {labels.cancel}
        </button>
      </div>
      {error ? (
        <p className="mu-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
