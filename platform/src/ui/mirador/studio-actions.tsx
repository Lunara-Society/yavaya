'use client';

import { useState } from 'react';

/**
 * The small buttons of Mirador's studio and creator pages: publish or keep a
 * video to oneself, take it down, follow a creator, unblock someone, choose
 * one's hashtags or start Para ti over. Each one calls its route and reloads
 * the page, which then shows the server's truth rather than a guess.
 */

async function call(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return Boolean(response?.ok);
}

export function VideoActions({ id, published, ready, labels }: { id: string; published: boolean; ready: boolean; labels: { publish: string; unpublish: string; remove: string; confirm: string; view: string; error: string } }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const act = async (run: () => Promise<boolean>) => {
    setBusy(true);
    setFailed(false);
    if (await run()) window.location.reload();
    else {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="ms-actions">
      {ready && published ? <a href={`/mirador/v/${id}`}>{labels.view}</a> : null}
      <button type="button" disabled={busy} onClick={() => void act(() => call(`/api/mirador/videos/${id}`, 'PATCH', { details: { publish: !published } }))}>
        {published ? labels.unpublish : labels.publish}
      </button>
      <button type="button" disabled={busy} onClick={() => window.confirm(labels.confirm) && void act(() => call(`/api/mirador/videos/${id}`, 'DELETE', {}))}>
        {labels.remove}
      </button>
      {failed ? <span className="mu-error">{labels.error}</span> : null}
    </div>
  );
}

export function FollowButton({ creatorId, following, signedIn, loginHref, labels }: { creatorId: string; following: boolean; signedIn: boolean; loginHref: string; labels: { follow: string; following: string } }) {
  const [on, setOn] = useState(following);
  return (
    <button
      type="button"
      className={on ? 'mu-line' : 'mf-cta'}
      aria-pressed={on}
      onClick={async () => {
        if (!signedIn) return void (window.location.href = loginHref);
        const next = !on;
        setOn(next);
        if (!(await call(`/api/mirador/creators/${creatorId}`, 'POST', { action: next ? 'follow' : 'unfollow' }))) setOn(!next);
      }}
    >
      {on ? labels.following : labels.follow}
    </button>
  );
}

export function UnblockButton({ userId, label }: { userId: string; label: string }) {
  return (
    <button type="button" className="mu-line" onClick={async () => (await call(`/api/mirador/creators/${userId}`, 'POST', { action: 'unblock' })) && window.location.reload()}>
      {label}
    </button>
  );
}

export function PreferencesForm({ interests, labels }: { interests: string[]; labels: { interests: string; hint: string; save: string; reset: string; saved: string; reset_done: string } }) {
  const [value, setValue] = useState(interests.map((tag) => `#${tag}`).join(' '));
  const [note, setNote] = useState<string | null>(null);
  return (
    <form
      className="mu-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await call('/api/mirador/preferences', 'POST', { interests: value })) setNote(labels.saved);
      }}
    >
      <label className="mu-field">
        {labels.interests}
        <input value={value} onChange={(event) => setValue(event.target.value)} maxLength={300} />
        <small>{labels.hint}</small>
      </label>
      <div className="mu-row">
        <button type="submit" className="mf-cta">
          {labels.save}
        </button>
        <button
          type="button"
          className="mu-line"
          onClick={async () => {
            if (await call('/api/mirador/preferences', 'POST', { reset: true })) {
              setValue('');
              setNote(labels.reset_done);
            }
          }}
        >
          {labels.reset}
        </button>
      </div>
      {note ? <p role="status" className="muted">{note}</p> : null}
    </form>
  );
}
