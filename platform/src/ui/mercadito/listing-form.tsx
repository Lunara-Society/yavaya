'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlacePicker, type PlacePickerLabels } from '@/ui/components/place-picker';
import { MERCADITO_RULES } from '@/config/business-rules';
import { RoxiPrefill } from '@/ui/roxi/prefill';

/**
 * Publish and edit form.
 *
 * Photos are shrunk in the browser before they are sent: a phone photo is
 * often 4–8 MB, and on a prepaid mobile plan that is real money. The server
 * does not rely on this — it re-validates and re-encodes everything — so a
 * browser that cannot resize simply sends the original.
 *
 * Every label arrives already translated; this component holds no text.
 */

export type ListingFormLabels = Record<
  | 'title'
  | 'titleHint'
  | 'description'
  | 'descriptionHint'
  | 'price'
  | 'currency'
  | 'category'
  | 'condition'
  | 'location'
  | 'photos'
  | 'photosHint'
  | 'photoDark'
  | 'photoBlurry'
  | 'photoSmall'
  | 'remove'
  | 'choose'
  | 'submit'
  | 'preparing'
  | 'submitting'
  | 'networkError',
  string
>;

type Photo = { key: string; kind: 'existing'; mediaId: string } | { key: string; kind: 'new'; file: File; url: string };
type Advice = 'dark' | 'blurry' | 'small';

const RESIZE_EDGE = 2000;

/**
 * The photo coach: a look at each new photo, in the browser, for the three
 * things that most often make a listing hard to buy from. It only ever
 * advises — a photo is never refused or changed because of it.
 *
 * Measured on a copy at most COACH_EDGE pixels wide. The thresholds were set
 * on Yavaya's own photographs: sharp ones measured 300–2 200 on the blur
 * scale (the variance of the image's Laplacian), the same photos blurred
 * until details were gone 2–90; average brightness under 55 of 255 is a
 * photo taken in the dark. A night scene would be called dark too — which,
 * for something on sale, is the right advice.
 */
const COACH_EDGE = 400;
const COACH = { darkBelow: 55, blurryBelow: 40, smallShortEdge: 500 };

async function advise(file: File): Promise<Advice[]> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const advice: Advice[] = [];
    if (Math.min(bitmap.width, bitmap.height) < COACH.smallShortEdge) advice.push('small');
    const scale = Math.min(1, COACH_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(3, Math.round(bitmap.width * scale));
    const height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return advice;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const light = new Float32Array(width * height);
    let sum = 0;
    for (let i = 0; i < light.length; i += 1) {
      const value = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
      light[i] = value;
      sum += value;
    }
    if (sum / light.length < COACH.darkBelow) advice.push('dark');
    let n = 0;
    let mean = 0;
    let m2 = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const lap = 4 * light[i]! - light[i - 1]! - light[i + 1]! - light[i - width]! - light[i + width]!;
        n += 1;
        const delta = lap - mean;
        mean += delta / n;
        m2 += delta * (lap - mean);
      }
    }
    if (n && m2 / n < COACH.blurryBelow) advice.push('blurry');
    return advice;
  } catch {
    // A format the browser cannot read: no advice rather than a wrong one.
    return [];
  }
}

async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, RESIZE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function ListingForm({
  mode,
  listingId,
  labels,
  categories,
  conditions,
  placeLabels,
  initial,
  maxPhotos,
  prefillNotice,
}: {
  mode: 'create' | 'edit';
  listingId: string;
  labels: ListingFormLabels;
  categories: Array<{ value: string; label: string }>;
  conditions: Array<{ value: string; label: string }>;
  placeLabels: PlacePickerLabels;
  initial?: {
    title: string;
    description: string;
    price: string;
    currency: string;
    category: string;
    condition: string;
    locationId: string;
    photoIds: string[];
  };
  maxPhotos: number;
  /** When set, a draft Roxi prepared fills a new listing; the member still publishes it. */
  prefillNotice?: string;
}) {
  const [photos, setPhotos] = useState<Photo[]>(
    () => initial?.photoIds.map((mediaId) => ({ key: mediaId, kind: 'existing' as const, mediaId })) ?? [],
  );
  // The currency of the chosen place's country; undefined until a saved place has been looked up.
  const [placeCurrency, setPlaceCurrency] = useState<string | null | undefined>(initial?.locationId ? undefined : null);
  const [currency, setCurrency] = useState(initial?.currency ?? '');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const [advice, setAdvice] = useState<Record<string, Advice[]>>({});

  const currencies = useMemo(() => {
    // While a saved place is still being looked up, keep the saved currency rather than resetting it.
    if (placeCurrency === undefined) return [...new Set([initial?.currency ?? 'USD', 'USD'])];
    return placeCurrency ? [...new Set([placeCurrency, 'USD'])] : ['USD'];
  }, [placeCurrency, initial?.currency]);

  // Moving the listing to another country resets a currency that no longer applies.
  useEffect(() => {
    if (!currencies.includes(currency)) setCurrency(currencies[0] ?? 'USD');
  }, [currencies, currency]);

  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);

  useEffect(
    () => () => {
      for (const photo of photos) if (photo.kind === 'new') URL.revokeObjectURL(photo.url);
    },
    // Only on unmount; removal revokes its own URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = maxPhotos - photos.length;
    const added = [...list].slice(0, Math.max(0, room)).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      kind: 'new' as const,
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((current) => [...current, ...added]);
    if (fileInput.current) fileInput.current.value = '';
    for (const photo of added) {
      void advise(photo.file).then((found) => {
        if (found.length) setAdvice((current) => ({ ...current, [photo.key]: found }));
      });
    }
  }

  function removePhoto(key: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.key === key);
      if (target?.kind === 'new') URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.key !== key);
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== 'idle') return;
    setError(null);

    const form = new FormData(event.currentTarget);
    form.delete('photos');
    form.set('mode', mode);
    form.set('listingId', listingId);

    setPhase('preparing');
    for (const photo of photos) {
      if (photo.kind === 'existing') form.append('keep', photo.mediaId);
      else form.append('photos', await shrink(photo.file), photo.file.name.replace(/\.\w+$/, '') + '.jpg');
    }

    setPhase('submitting');
    try {
      const response = await fetch('/api/mercadito/listings', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as { ok: boolean; id?: string; message?: string } | null;
      if (body?.ok && body.id) {
        window.location.assign(`/mercadito/${body.id}`);
        return;
      }
      setError(body?.message ?? labels.networkError);
    } catch {
      setError(labels.networkError);
    }
    setPhase('idle');
  }

  const busy = phase !== 'idle';

  return (
    <form className="mk-form" onSubmit={submit} noValidate={false}>
      {mode === 'create' && prefillNotice ? <RoxiPrefill form="mercadito_listing" notice={prefillNotice} /> : null}
      {error ? (
        <div className="mk-error" role="alert" tabIndex={-1} ref={errorBox}>
          {error}
        </div>
      ) : null}

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>{labels.photos}</legend>
        <span className="hint">{labels.photosHint}</span>
        {photos.length > 0 ? (
          <div className="mk-photos">
            {photos.map((photo) => (
              <figure key={photo.key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview or already-processed image */}
                <img src={photo.kind === 'existing' ? `/media/${photo.mediaId}` : photo.url} alt="" />
                <button type="button" onClick={() => removePhoto(photo.key)} disabled={busy}>
                  {labels.remove}
                </button>
                {advice[photo.key]?.length ? (
                  <figcaption className="mk-photo-advice" role="status">
                    {advice[photo.key]!.map((kind) => (
                      <span key={kind}>{kind === 'dark' ? labels.photoDark : kind === 'blurry' ? labels.photoBlurry : labels.photoSmall}</span>
                    ))}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : null}
        {photos.length < maxPhotos ? (
          <input
            ref={fileInput}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(event) => addFiles(event.currentTarget.files)}
          />
        ) : null}
      </fieldset>

      <label>
        {labels.title}
        <span className="hint">{labels.titleHint}</span>
        <input name="title" required minLength={MERCADITO_RULES.titleMinLength} maxLength={MERCADITO_RULES.titleMaxLength} defaultValue={initial?.title} disabled={busy} />
      </label>

      <div className="row">
        <label>
          {labels.category}
          <select name="category" required defaultValue={initial?.category ?? ''} disabled={busy}>
            <option value="" disabled>
              {labels.choose}
            </option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {labels.condition}
          <select name="condition" required defaultValue={initial?.condition ?? ''} disabled={busy}>
            <option value="" disabled>
              {labels.choose}
            </option>
            {conditions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row">
        <label>
          {labels.location}
          <PlacePicker
            name="locationId"
            labels={placeLabels}
            initial={initial?.locationId}
            required
            disabled={busy}
            onLoad={(place) => setPlaceCurrency(place?.currencyCode ?? null)}
            onChange={(place) => {
              setPlaceCurrency(place?.currencyCode ?? null);
              // Buyers there price in the local currency first; dollars stay one click away.
              if (place) setCurrency(place.currencyCode);
            }}
          />
        </label>
        <label>
          {labels.price}
          <input name="price" required inputMode="decimal" defaultValue={initial?.price} disabled={busy} />
        </label>
        <label>
          {labels.currency}
          <select name="currency" required value={currency} onChange={(event) => setCurrency(event.currentTarget.value)} disabled={busy}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        {labels.description}
        <span className="hint">{labels.descriptionHint}</span>
        <textarea name="description" required minLength={MERCADITO_RULES.descriptionMinLength} maxLength={MERCADITO_RULES.descriptionMaxLength} defaultValue={initial?.description} disabled={busy} />
      </label>

      <button className="btn btn-gold" type="submit" disabled={busy} aria-busy={busy}>
        {phase === 'preparing' ? labels.preparing : phase === 'submitting' ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
