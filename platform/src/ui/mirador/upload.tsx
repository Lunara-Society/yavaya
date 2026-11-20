'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MIRADOR_RULES } from '@/config/business-rules';

/**
 * Putting something on Mirador (docs/mirador/README.md, "Upload").
 *
 * A video, or up to four photos Yavaya turns into a short video for free.
 * A video starts uploading the moment it is chosen, in parts, while the
 * member writes what it is about: on a slow connection the minutes go by
 * while they type. A part that fails is sent again (three times) before the
 * member is told; "Cancelar" throws the parts away. Photos are small and go
 * up together with the words when the member taps Publicar.
 *
 * "¿Lo ofreces?" turns the post into an offer — sold, given away, given for
 * whatever the other person wants to give, or given to soup kitchens — so
 * whoever sees it can ask for it at once with "Lo quiero".
 *
 * The phone checks the length of a video first, so one too long is refused
 * before a single byte is sent. The server checks everything again.
 */

export type OfferLabels = Record<
  | 'heading' | 'none' | 'kind_sale' | 'kind_free' | 'kind_contribution' | 'kind_donation' | 'kind_donation_hint' | 'what' | 'price' | 'price_hint' | 'unit' | 'unit_hint'
  | 'quantity' | 'category' | 'ingredients' | 'ingredients_hint' | 'rules' | 'rules_list' | 'pickup' | 'pickup_hint' | 'until' | 'place_needed' | 'free_note',
  string
> & { categories: Record<string, string>; hours: Record<string, string> };

export type UploadLabels = Record<
  | 'title' | 'choose' | 'choose_hint' | 'caption' | 'caption_hint' | 'place' | 'link' | 'link_none' | 'publish_when_ready' | 'publish' | 'save_draft'
  | 'cancel' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'retry' | 'too_long' | 'too_large' | 'not_video' | 'error'
  | 'view' | 'studio' | 'another' | 'rights' | 'hashtags_found' | 'photos_ready' | 'photos_hint',
  string
> & { linkKinds: Record<string, string>; errors: Record<string, string>; offer: OfferLabels };

type Choice = { type: string; id: string; title: string };
export type OfferDraft = { kind: string; category: string; title: string; price: string; unit: string; quantity: number; ingredients: string; foodRules: boolean; pickupDetails: string; hours: number };

const MAX_TRIES = 3;
const FOOD = ['food', 'baked'];
export const EMPTY_OFFER: OfferDraft = { kind: '', category: 'food', title: '', price: '', unit: '', quantity: 1, ingredients: '', foodRules: false, pickupDetails: '', hours: 6 };

function api(url: string, init: RequestInit) {
  return fetch(url, { credentials: 'same-origin', ...init })
    .then(async (response) => ({ ok: response.ok, status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null }))
    .catch(() => ({ ok: false, status: 0, body: null }));
}

/** The offer's fields: the same on the upload page and in the studio. */
export function OfferFields({ value, onChange, labels, hoursList, foodMaxHours, required = false }: { value: OfferDraft; onChange: (next: OfferDraft) => void; labels: OfferLabels; hoursList: readonly number[]; foodMaxHours: number; /** In the studio an offer is closed with its own button, so "nothing" is not offered. */ required?: boolean }) {
  const set = (change: Partial<OfferDraft>) => onChange({ ...value, ...change });
  const food = FOOD.includes(value.category);
  const hours = hoursList.filter((h) => !food || h <= foodMaxHours);
  return (
    <fieldset className="mu-offer">
      <legend>{labels.heading}</legend>
      <div className="mu-kinds" role="radiogroup">
        {(required ? ['sale', 'free', 'contribution', 'donation'] : ['', 'sale', 'free', 'contribution', 'donation']).map((kind) => (
          <label key={kind || 'none'} className="mu-kind" data-on={value.kind === kind ? '' : undefined}>
            <input type="radio" name="offer-kind" checked={value.kind === kind} onChange={() => set({ kind })} />
            {kind ? labels[`kind_${kind}` as 'kind_sale'] : labels.none}
          </label>
        ))}
      </div>
      {value.kind === 'donation' ? <p className="mu-note">{labels.kind_donation_hint}</p> : null}
      {value.kind === 'free' || value.kind === 'contribution' ? <p className="mu-note">{labels.free_note}</p> : null}
      {value.kind ? (
        <>
          <label className="mu-field">
            {labels.category}
            <select value={value.category} onChange={(event) => set({ category: event.target.value, hours: FOOD.includes(event.target.value) ? Math.min(value.hours, foodMaxHours) : value.hours })}>
              {Object.entries(labels.categories).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="mu-field">
            {labels.what}
            <input value={value.title} onChange={(event) => set({ title: event.target.value })} maxLength={MIRADOR_RULES.offerTitleMaxLength} required />
          </label>
          <div className="mu-pair">
            {value.kind === 'sale' ? (
              <label className="mu-field">
                {labels.price}
                <input value={value.price} onChange={(event) => set({ price: event.target.value })} inputMode="decimal" placeholder="80" required />
                <small>{labels.price_hint}</small>
              </label>
            ) : null}
            <label className="mu-field">
              {labels.quantity}
              <input type="number" min={1} max={MIRADOR_RULES.offerMaxQuantity} value={value.quantity} onChange={(event) => set({ quantity: Math.max(1, Math.min(MIRADOR_RULES.offerMaxQuantity, Number(event.target.value) || 1)) })} />
            </label>
            <label className="mu-field">
              {labels.unit}
              <input value={value.unit} onChange={(event) => set({ unit: event.target.value })} maxLength={30} placeholder={labels.unit_hint} />
            </label>
          </div>
          {food ? (
            <>
              <label className="mu-field">
                {labels.ingredients}
                <textarea value={value.ingredients} onChange={(event) => set({ ingredients: event.target.value })} maxLength={MIRADOR_RULES.offerIngredientsMaxLength} rows={2} required />
                <small>{labels.ingredients_hint}</small>
              </label>
              <div className="mu-rules">
                <p>{labels.rules_list}</p>
                <label className="mu-check">
                  <input type="checkbox" checked={value.foodRules} onChange={(event) => set({ foodRules: event.target.checked })} /> {labels.rules}
                </label>
              </div>
            </>
          ) : null}
          <label className="mu-field">
            {labels.until}
            <select value={value.hours} onChange={(event) => set({ hours: Number(event.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {labels.hours[String(h)]}
                </option>
              ))}
            </select>
          </label>
          <label className="mu-field">
            {labels.pickup}
            <input value={value.pickupDetails} onChange={(event) => set({ pickupDetails: event.target.value })} maxLength={MIRADOR_RULES.offerPickupMaxLength} />
            <small>{labels.pickup_hint}</small>
          </label>
          <p className="mu-note">{labels.place_needed}</p>
        </>
      ) : null}
    </fieldset>
  );
}

export function MiradorUpload(props: {
  labels: UploadLabels;
  choices: Choice[];
  maxSeconds: number;
  maxBytes: number;
  maxPhotos: number;
  offerHours: readonly number[];
  foodMaxHours: number;
  placePicker: ReactNode;
  locale: string;
}) {
  const { labels } = props;
  const [file, setFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'uploaded' | 'sending' | 'processing' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [publish, setPublish] = useState(true);
  const [offer, setOffer] = useState<OfferDraft>(EMPTY_OFFER);
  const form = useRef<HTMLFormElement>(null);
  const cancelled = useRef(false);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

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

  async function choose(list: FileList | null) {
    const chosen = [...(list ?? [])];
    if (!chosen.length) return;
    setError(null);
    const images = chosen.filter((item) => item.type.startsWith('image/'));
    if (images.length) {
      // Photos: up to four, sent with the words when the member taps Publicar.
      const kept = images.slice(0, props.maxPhotos);
      setPhotos(kept);
      setPreviews(kept.map((item) => URL.createObjectURL(item)));
      setPhase('uploaded');
      return;
    }
    const video = chosen[0]!;
    if (video.size > props.maxBytes) return setError(labels.too_large);
    const seconds = await lengthOf(video);
    // Unknown length (a format the phone cannot preview) is left to the server to judge.
    if (Number.isFinite(seconds) && seconds > props.maxSeconds + 1) return setError(labels.too_long);
    setFile(video);
    setPreviews([URL.createObjectURL(video)]);
    void upload(video);
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

  const offerBody = () => (offer.kind ? offer : null);

  async function finish() {
    if (phase !== 'uploaded') return;
    setPhase('sending');
    setError(null);
    let result: Awaited<ReturnType<typeof api>>;
    if (photos.length) {
      const body = new FormData();
      for (const photo of photos) body.append('photos', photo);
      body.append('details', JSON.stringify(details()));
      if (offerBody()) body.append('offer', JSON.stringify(offerBody()));
      result = await api('/api/mirador/photos', { method: 'POST', body });
      if (result.ok) setVideoId(String(result.body?.videoId));
    } else {
      if (!videoId) return;
      result = await api(`/api/mirador/uploads/${videoId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ details: details(), offer: offerBody() }) });
    }
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
    if (videoId && file && (phase === 'uploading' || phase === 'uploaded')) await api(`/api/mirador/uploads/${videoId}`, { method: 'DELETE' });
    setFile(null);
    setPhotos([]);
    setPreviews([]);
    setVideoId(null);
    setPhase('idle');
    setProgress(0);
  }

  const tags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!.toLocaleLowerCase(props.locale));
  const chosen = Boolean(file || photos.length);

  if (phase === 'processing' || phase === 'ready' || phase === 'failed') {
    return (
      <section className="mu-done" aria-live="polite">
        {file && previews[0] ? <video src={previews[0]} muted playsInline loop autoPlay className="mu-preview" /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- the member's own photo, from their phone */}
        {photos.length && previews[0] ? <img src={previews[0]} alt="" className="mu-preview" /> : null}
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
      {!chosen ? (
        <label className="mu-pick">
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span>{labels.choose}</span>
          <small>{labels.choose_hint}</small>
          <small>{labels.photos_hint}</small>
          <input type="file" accept="video/*,image/*" multiple onChange={(event) => void choose(event.currentTarget.files)} />
        </label>
      ) : file ? (
        <div className="mu-file">
          {previews[0] ? <video src={previews[0]} muted playsInline loop autoPlay className="mu-preview" /> : null}
          <div className="mu-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={labels.uploading}>
            <span style={{ width: `${progress}%` }} />
          </div>
          {/* Only what is true: "uploaded" once every part is in, nothing while it is not (the error above says why). */}
          {phase === 'uploading' ? <p className="mu-status">{`${labels.uploading} ${progress}%`}</p> : null}
          {phase === 'uploaded' ? <p className="mu-status">{labels.uploaded}</p> : null}
          {phase === 'idle' ? (
            <button type="button" className="mu-line" onClick={() => void upload(file)}>
              {labels.retry}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mu-file">
          <div className="mu-photos">
            {previews.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- the member's own photo, from their phone
              <img key={url} src={url} alt="" />
            ))}
          </div>
          <p className="mu-status">{labels.photos_ready}</p>
        </div>
      )}
      {error ? (
        <p className="mu-error" role="alert">
          {error}
        </p>
      ) : null}

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
      <OfferFields value={offer} onChange={setOffer} labels={labels.offer} hoursList={props.offerHours} foodMaxHours={props.foodMaxHours} />
      {props.choices.length && !offer.kind ? (
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
        {chosen ? (
          <button type="button" className="mu-line" onClick={() => void cancel()}>
            {labels.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
