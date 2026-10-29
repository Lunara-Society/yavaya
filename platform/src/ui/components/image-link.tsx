'use client';

import { useId, useRef, useState } from 'react';

export type ImageLinkLabels = {
  label: string;
  hint: string;
  placeholder: string;
  add: string;
  adding: string;
  added: string;
  full: string;
  network: string;
};

/**
 * A photo from a link, for whoever has the picture online rather than on the
 * phone in their hand.
 *
 * Put inside a form that has a photo input. The server downloads the image
 * (`/api/media/link`), and it goes into that input exactly as if it had been
 * chosen from the phone — so each form keeps its one way of sending photos,
 * a client form's own photo list sees it arrive, and the server checks it
 * like any other upload. The link field has no name, so it is never sent.
 */
export function ImageLink({ labels, max }: { labels: ImageLinkLabels; max?: number }) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function add() {
    if (!link.trim() || busy) return;
    const input = anchor.current?.closest('form')?.querySelector<HTMLInputElement>('input[type="file"]');
    // A form that already holds all its photos shows no photo input.
    const kept = input?.multiple ? [...(input.files ?? [])] : [];
    if (!input || (max !== undefined && kept.length >= max)) {
      setMessage({ error: true, text: labels.full });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/media/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: link.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setMessage({ error: true, text: body?.message ?? labels.network });
        return;
      }
      const blob = await response.blob();
      const transfer = new DataTransfer();
      for (const file of kept) transfer.items.add(file);
      transfer.items.add(new File([blob], response.headers.get('x-image-name') ?? 'foto.jpg', { type: blob.type }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setLink('');
      setMessage({ error: false, text: labels.added });
    } catch {
      setMessage({ error: true, text: labels.network });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-link" ref={anchor}>
      <label htmlFor={id}>{labels.label}</label>
      <span className="hint">{labels.hint}</span>
      <div className="image-link-row">
        {/* Text, not type="url": a half-typed link must never stop the form itself from being sent. */}
        <input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={labels.placeholder}
          value={link}
          disabled={busy}
          onChange={(event) => setLink(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Enter brings the photo in; it does not send the whole form.
              event.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="btn btn-line" onClick={() => void add()} disabled={busy || !link.trim()} aria-busy={busy}>
          {busy ? labels.adding : labels.add}
        </button>
      </div>
      {message ? (
        <p className={message.error ? 'mk-error' : 'hint'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
