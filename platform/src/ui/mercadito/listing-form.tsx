'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryOption } from '@/server/domains/mercadito/service';
import { MERCADITO_RULES } from '@/config/business-rules';

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
  | 'remove'
  | 'choose'
  | 'submit'
  | 'preparing'
  | 'submitting'
  | 'networkError',
  string
>;

type Photo = { key: string; kind: 'existing'; mediaId: string } | { key: string; kind: 'new'; file: File; url: string };

const RESIZE_EDGE = 2000;

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
  countries,
  initial,
  maxPhotos,
}: {
  mode: 'create' | 'edit';
  listingId: string;
  labels: ListingFormLabels;
  categories: Array<{ value: string; label: string }>;
  conditions: Array<{ value: string; label: string }>;
  countries: CountryOption[];
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
}) {
  const [photos, setPhotos] = useState<Photo[]>(
    () => initial?.photoIds.map((mediaId) => ({ key: mediaId, kind: 'existing' as const, mediaId })) ?? [],
  );
  const [locationId, setLocationId] = useState(initial?.locationId ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? '');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);

  const countryCurrency = useMemo(() => {
    for (const country of countries) {
      if (country.places.some((place) => place.id === locationId)) return country.currencyCode;
    }
    return null;
  }, [countries, locationId]);
  const currencies = countryCurrency ? [...new Set([countryCurrency, 'USD'])] : ['USD'];

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
          <select
            name="locationId"
            required
            value={locationId}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setLocationId(next);
              // Buyers there price in the local currency first; dollars stay one click away.
              const country = countries.find((option) => option.places.some((place) => place.id === next));
              if (country) setCurrency(country.currencyCode);
            }}
            disabled={busy}
          >
            <option value="" disabled>
              {labels.choose}
            </option>
            {countries.map((country) => (
              <optgroup key={country.code} label={country.name}>
                {country.places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
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
