'use client';

import { useEffect, useState } from 'react';
import type { RoxiLabels } from './labels';

/**
 * The review card (docs/roxi/FLAGSHIP.md): the listing Roxi drafted, shown
 * back to the member in her panel before any form opens. Photos, title,
 * price, place, what kind of thing it is, and its description; the member
 * can change the words and take photos out here, and every change is saved
 * on the server at once, so the draft is the same on every device.
 *
 * Nothing on the card publishes. "Revisar y publicar" opens the real form,
 * filled in from the draft, and the member publishes from there.
 *
 * The card reads the draft from the server rather than from the
 * conversation, so it can only show what is really kept: a draft that was
 * published, discarded or ran out of time says so.
 */
export type RoxiDraftView = {
  id: string;
  fields: Record<string, string>;
  photos: Array<{ id: string; url: string }>;
  place: { id: string; label: string; currency: string } | null;
  category: string | null;
  condition: string | null;
  source: 'web' | 'whatsapp';
  expiresAt: string;
  openUrl: string;
};

type State = { kind: 'loading' } | { kind: 'ready'; draft: RoxiDraftView } | { kind: 'gone' } | { kind: 'discarded' };

/** Drafts the panel already holds (it just made one), so their card shows without asking again. */
const known = new Map<string, RoxiDraftView>();
export function primeDraft(draft: RoxiDraftView): void {
  known.set(draft.id, draft);
}

function day(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-419', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function RoxiReviewCard({
  draftId,
  labels,
  locale,
  onOpen,
  onDiscarded,
  inForm = false,
}: {
  draftId: string;
  labels: RoxiLabels;
  locale: string;
  /** The member has this draft's form open: they review it there. */
  inForm?: boolean;
  /** The member tapped "Revisar y publicar": the form opens with the draft as it now is. */
  onOpen: (draft: RoxiDraftView) => void;
  onDiscarded: () => void;
}) {
  const [state, setState] = useState<State>(() => {
    const draft = known.get(draftId);
    return draft ? { kind: 'ready', draft } : { kind: 'loading' };
  });
  const [title, setTitle] = useState(() => known.get(draftId)?.fields.title ?? '');
  const [price, setPrice] = useState(() => known.get(draftId)?.fields.price ?? '');
  const [description, setDescription] = useState(() => known.get(draftId)?.fields.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const show = (draft: RoxiDraftView) => {
    known.set(draft.id, draft);
    setState({ kind: 'ready', draft });
    setTitle(draft.fields.title ?? '');
    setPrice(draft.fields.price ?? '');
    setDescription(draft.fields.description ?? '');
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/roxi/drafts/${draftId}`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ok?: boolean; draft?: RoxiDraftView | null } | null) => {
        if (cancelled || !body?.ok) return;
        if (body.draft) show(body.draft);
        else setState((current) => (current.kind === 'discarded' ? current : { kind: 'gone' }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (state.kind === 'loading') return null;
  if (state.kind !== 'ready') {
    return <li className="roxi-msg is-note">{state.kind === 'discarded' ? labels['review.discarded'] : labels['review.gone']}</li>;
  }
  const { draft } = state;
  const changed = title !== (draft.fields.title ?? '') || price !== (draft.fields.price ?? '') || description !== (draft.fields.description ?? '');

  async function save(body: { fields?: Record<string, string>; removePhotos?: string[] }): Promise<RoxiDraftView | null> {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch(`/api/roxi/drafts/${draftId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; draft?: RoxiDraftView } | null;
      if (response.status === 404) {
        setState({ kind: 'gone' });
        return null;
      }
      if (!result?.ok || !result.draft) {
        setError(true);
        return null;
      }
      show(result.draft);
      return result.draft;
    } catch {
      setError(true);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function open() {
    const latest = changed ? await save({ fields: { title, price, description } }) : draft;
    if (latest) onOpen(latest);
  }

  async function discard() {
    setSaving(true);
    try {
      const response = await fetch(`/api/roxi/drafts/${draftId}`, { method: 'DELETE', credentials: 'same-origin' });
      if (response.ok || response.status === 404) {
        known.delete(draftId);
        setState({ kind: 'discarded' });
        onDiscarded();
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const kind = [draft.category, draft.condition].filter(Boolean).join(' · ');

  if (inForm) {
    return (
      <li className="roxi-review">
        <span className="roxi-results-title">{labels['review.title']}</span>
        <p className="roxi-review-card roxi-review-in-form">
          <strong>{draft.fields.title ?? ''}</strong>
          <span>{labels['review.in_form']}</span>
        </p>
      </li>
    );
  }

  return (
    <li className="roxi-review" aria-busy={saving || undefined}>
      <span className="roxi-results-title">{labels['review.title']}</span>
      <div className="roxi-review-card">
        {draft.photos.length > 0 ? (
          <ul className="roxi-review-photos" aria-label={labels['review.photos']}>
            {draft.photos.map((photo) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the member's own draft photo, from its private route */}
                <img src={photo.url} alt="" />
                <button type="button" onClick={() => void save({ removePhotos: [photo.id] })} disabled={saving} aria-label={labels['review.remove_photo']} title={labels['review.remove_photo']}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="roxi-review-field">
          <span>{labels['review.title_label']}</span>
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={90} disabled={saving} />
        </label>
        <div className="roxi-review-row">
          <label className="roxi-review-field">
            <span>{labels['review.price']}</span>
            <span className="roxi-review-price">
              <input value={price} onChange={(event) => setPrice(event.currentTarget.value)} inputMode="decimal" maxLength={20} disabled={saving} />
              {draft.place ? <em>{draft.place.currency}</em> : null}
            </span>
          </label>
          <div className="roxi-review-field">
            <span>{labels['review.place']}</span>
            <p>{draft.place?.label ?? labels['review.place_missing']}</p>
          </div>
        </div>
        {kind ? <p className="roxi-review-kind">{kind}</p> : null}
        <label className="roxi-review-field">
          <span>{labels['review.description']}</span>
          <textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} rows={3} maxLength={4000} disabled={saving} />
        </label>
        {error ? (
          <p className="roxi-review-error" role="alert">
            {labels['review.error']}
          </p>
        ) : null}
        <span className="roxi-confirm-actions">
          <button type="button" className="roxi-retry is-go" onClick={() => void open()} disabled={saving}>
            {saving ? labels['review.saving'] : labels['review.open']}
          </button>
          <button type="button" className="roxi-retry is-quiet" onClick={() => void discard()} disabled={saving}>
            {labels['review.discard']}
          </button>
        </span>
        <p className="roxi-review-fine">
          {labels['review.fine']} {labels['review.until'].replace('{date}', day(draft.expiresAt, locale))}
        </p>
      </div>
    </li>
  );
}
