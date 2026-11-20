'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Putting a video on Mirador (docs/mirador/README.md, "Upload").
 *
 * The upload starts the moment the member chooses the file, in parts, while
 * they write what it is about: on a slow connection the minutes go by while
 * they type, not after. A part that fails is sent again (three times) before
 * the member is told; "Cancelar" throws the parts away.
 *
 * The phone checks the length first, so a video that is too long is refused
 * before a single byte is sent. The server checks everything again.
 */

export type UploadLabels = Record<
  | 'title' | 'choose' | 'choose_hint' | 'caption' | 'caption_hint' | 'place' | 'link' | 'link_none' | 'publish_when_ready' | 'publish' | 'save_draft'
  | 'cancel' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'retry' | 'too_long' | 'too_large' | 'not_video' | 'error'
  | 'view' | 'studio' | 'another' | 'rights' | 'hashtags_found',
  string
> & { linkKinds: Record<string, string>; errors: Record<string, string> };

type Choice = { type: string; id: string; title: string };

const MAX_TRIES = 3;

function api(url: string, init: RequestInit) {
  return fetch(url, { credentials: 'same-origin', ...init })
    .then(async (response) => ({ ok: response.ok, status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null }))
    .catch(() => ({ ok: false, status: 0, body: null }));
}

export function MiradorUpload(props: { labels: UploadLabels; choices: Choice[]; maxSeconds: number; maxBytes: number; placePicker: ReactNode; locale: string }) {
  const { labels } = props;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'uploaded' | 'sending' | 'processing' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [publish, setPublish] = useState(true);
  const form = useRef<HTMLFormElement>(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const message = (key: unknown) => (typeof key === 'string' && props.labels.errors[key]) || labels.error;

  async function lengthOf(chosen: File): Promise<number> {
    return new Promise((resolve) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => resolve(probe.duration);
      probe.onerror = () => resolve(Number.NaN);
      probe.src = URL.createObjectURL(chosen);
    });
  }

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    if (chosen.size > props.maxBytes) return setError(labels.too_large);
    const seconds = await lengthOf(chosen);
    // Unknown length (a format the phone cannot preview) is left to the server to judge.
    if (Number.isFinite(seconds) && seconds > props.maxSeconds + 1) return setError(labels.too_long);
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
    void upload(chosen);
  }

  async function upload(chosen: File) {
    cancelled.current = false;
    setPhase('uploading');
    setProgress(0);
    const type = chosen.type || (chosen.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
    const started = await api('/api/mirador/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: chosen.size, type }) });
    if (!started.ok || !started.body) {
      setPhase('idle');
      return setError(message(started.body?.error));
    }
    const id = String(started.body.videoId);
    const partBytes = Number(started.body.partBytes);
    const parts = Number(started.body.parts);
    setVideoId(id);
    for (let n = 1; n <= parts; n++) {
      if (cancelled.current) return;
      const slice = chosen.slice((n - 1) * partBytes, Math.min(chosen.size, n * partBytes));
      let sent = false;
      for (let attempt = 0; attempt < MAX_TRIES && !sent; attempt++) {
        const result = await api(`/api/mirador/uploads/${id}/parts/${n}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: slice });
        sent = result.ok;
        if (!sent && result.status >= 400 && result.status < 500 && result.status !== 429) break;
        if (!sent) await new Promise((wait) => setTimeout(wait, 1500 * (attempt + 1)));
      }
      if (!sent) {
        setPhase('idle');
        return setError(labels.error);
      }
      setProgress(Math.round((n / parts) * 100));
    }
    setPhase('uploaded');
  }

  function details() {
    const data = form.current ? new FormData(form.current) : null;
    const link = String(data?.get('link') ?? '');
    const [type, id] = link ? link.split(':') : ['', ''];
    return { caption, locationId: String(data?.get('locationId') ?? '') || null, link: type ? { type, id } : null, publish };
  }

  async function finish() {
    if (!videoId || phase !== 'uploaded') return;
    setPhase('sending');
    const result = await api(`/api/mirador/uploads/${videoId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details: details() }) });
    if (!result.ok) {
      setPhase('uploaded');
      return setError(message(result.body?.error));
    }
    if (result.body?.detailsError) setError(message(result.body.detailsError));
    setPhase('processing');
  }

  // While it is processing, the page asks every few seconds how it went.
  useEffect(() => {
    if (phase !== 'processing' || !videoId) return;
    const timer = window.setInterval(async () => {
      const result = await api(`/api/mirador/videos/${videoId}`, { headers: { accept: 'application/json' } });
      const video = result.body?.video as { status?: string; failureReason?: string } | undefined;
      if (video?.status === 'ready') setPhase('ready');
      if (video?.status === 'failed') {
        setPhase('failed');
        setError(message(video.failureReason));
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [phase, videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel() {
    cancelled.current = true;
    if (videoId && (phase === 'uploading' || phase === 'uploaded')) await api(`/api/mirador/uploads/${videoId}`, { method: 'DELETE' });
    setFile(null);
    setPreview(null);
    setVideoId(null);
    setPhase('idle');
    setProgress(0);
  }

  const tags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!.toLocaleLowerCase(props.locale));

  if (phase === 'processing' || phase === 'ready' || phase === 'failed') {
    return (
      <section className="mu-done" aria-live="polite">
        {preview ? <video src={preview} muted playsInline loop autoPlay className="mu-preview" /> : null}
        <h2>{phase === 'ready' ? labels.ready : phase === 'failed' ? labels.failed : labels.processing}</h2>
        {error ? <p className="mu-error">{error}</p> : null}
        <div className="mu-row">
          {phase === 'ready' && videoId ? (
            <a className="mf-cta" href={`/mirador/v/${videoId}`}>
              {labels.view}
            </a>
          ) : null}
          <a className="mu-line" href="/mirador/estudio">
            {labels.studio}
          </a>
          <a className="mu-line" href="/mirador/subir">
            {labels.another}
          </a>
        </div>
      </section>
    );
  }

  return (
    <form
      ref={form}
      className="mu-form"
      onSubmit={(event) => {
        event.preventDefault();
        void finish();
      }}
    >
      {!file ? (
        <label className="mu-pick">
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span>{labels.choose}</span>
          <small>{labels.choose_hint}</small>
          <input type="file" accept="video/*" onChange={(event) => void choose(event.currentTarget.files?.[0])} />
        </label>
      ) : (
        <div className="mu-file">
          {preview ? <video src={preview} muted playsInline loop autoPlay className="mu-preview" /> : null}
          <div className="mu-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={labels.uploading}>
            <span style={{ width: `${progress}%` }} />
          </div>
          {/* Only what is true: "uploaded" once every part is in, nothing while it is not (the error above says why). */}
          {phase === 'uploading' ? <p className="mu-status">{`${labels.uploading} ${progress}%`}</p> : null}
          {phase === 'uploaded' ? <p className="mu-status">{labels.uploaded}</p> : null}
          {phase === 'idle' && file ? (
            <button type="button" className="mu-line" onClick={() => void upload(file)}>
              {labels.retry}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="mu-error" role="alert">{error}</p> : null}

      <label className="mu-field">
        {labels.caption}
        <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={300} rows={3} />
        <small>
          {labels.caption_hint} · {caption.length}/300
        </small>
        {tags.length ? (
          <small className="mu-tags">
            {labels.hashtags_found}: {[...new Set(tags)].slice(0, 8).map((tag) => `#${tag}`).join(' ')}
          </small>
        ) : null}
      </label>
      <div className="mu-field">
        <span>{labels.place}</span>
        {props.placePicker}
      </div>
      {props.choices.length ? (
        <label className="mu-field">
          {labels.link}
          <select name="link" defaultValue="">
            <option value="">{labels.link_none}</option>
            {props.choices.map((choice) => (
              <option key={`${choice.type}:${choice.id}`} value={`${choice.type}:${choice.id}`}>
                {labels.linkKinds[choice.type]}
                {choice.title ? ` · ${choice.title}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="mu-check">
        <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> {labels.publish_when_ready}
      </label>
      <p className="mu-rights">{labels.rights}</p>
      <div className="mu-row">
        <button className="mf-cta" type="submit" disabled={phase !== 'uploaded'}>
          {publish ? labels.publish : labels.save_draft}
        </button>
        {file ? (
          <button type="button" className="mu-line" onClick={() => void cancel()}>
            {labels.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
