'use client';

import { useRef } from 'react';
import { giveRoxiPhoto } from './ask';

/**
 * A district's camera button (docs/DISTRICT-FOCUS.md): the member takes or
 * chooses a photo right here, and Roxi opens with it, as if it had been sent
 * in her panel. For selling (Mercadito) she drafts the listing; with a
 * caption (Animales) she knows what the photo is for.
 *
 * Without Roxi on the page (signed out, or not configured) the button is a
 * plain link to the form that does the same by hand, so it never leads
 * nowhere.
 */
export function RoxiPhotoButton({ label, selling, caption, fallbackHref, className }: { label: string; selling: boolean; caption?: string; fallbackHref: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <a
        href={fallbackHref}
        className={className}
        onClick={(event) => {
          if (!document.querySelector('.roxi')) return;
          event.preventDefault();
          input.current?.click();
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {label}
      </a>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) giveRoxiPhoto({ file, selling, caption });
        }}
      />
    </>
  );
}
