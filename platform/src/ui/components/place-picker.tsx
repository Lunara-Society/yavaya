'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * A place, found by typing a few letters of it.
 *
 * Replaces a dropdown of two thousand towns. The visible field is only for
 * searching; the chosen place travels in a hidden input under `name`, so a
 * plain server form posts it exactly as it posted the old select's value.
 *
 * `value="code"` (filters) accepts departments and countries as well as towns
 * and posts the place code; `value="id"` (forms) posts the location id of a
 * town or city. Without JavaScript the hidden input still carries the saved
 * value, and the server validates whatever arrives either way.
 */

export type PickedPlace = {
  id: string;
  code: string;
  level: string;
  name: string;
  context: string;
  countryCode: string;
  currencyCode: string;
  kind: string;
};

export type PlacePickerLabels = {
  placeholder: string;
  empty: string;
  required: string;
  clear: string;
  suggested: string;
  /** Filters only: the choice that means "anywhere". */
  any?: string;
};

export function PlacePicker({
  name,
  labels,
  value = 'id',
  initial,
  required,
  disabled,
  onChange,
  onLoad,
  autoSubmit,
  anyValue = '',
}: {
  name: string;
  labels: PlacePickerLabels;
  value?: 'id' | 'code';
  /** The saved choice: a location id or a place code, matching `value`. */
  initial?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** The person chose (or cleared) a place. */
  onChange?: (place: PickedPlace | null) => void;
  /** The saved place was looked up; null when it no longer exists. */
  onLoad?: (place: PickedPlace | null) => void;
  /** Filters: submit the surrounding form as soon as a place is chosen. */
  autoSubmit?: boolean;
  /** What the "anywhere" choice posts; a filter uses a sentinel so it can override the location bar. */
  anyValue?: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickedPlace[] | null>(null);
  const [active, setActive] = useState(0);
  const settlements = value === 'id';

  // Show the saved place by name.
  useEffect(() => {
    if (!initial) return;
    const controller = new AbortController();
    fetch(`/api/places?${value}=${encodeURIComponent(initial)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { places: PickedPlace[] }) => {
        const place = data.places[0] ?? null;
        if (place) {
          setPicked(place);
          setText(place.name);
        }
        onLoad?.(place);
      })
      .catch(() => {});
    return () => controller.abort();
    // Only a new saved value warrants a new lookup, not a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, value]);

  // Search as the person types, a beat after they pause.
  useEffect(() => {
    if (!open) return;
    const query = picked && text === picked.name ? '' : text.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (settlements) params.set('settlements', '1');
      fetch(`/api/places?${params}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { places: PickedPlace[] }) => {
          // With nothing typed the suggestions are the big cities; forms take only towns and cities anyway.
          setResults(data.places);
          setActive(0);
        })
        .catch(() => {});
    }, query ? 140 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, open, picked, settlements]);

  // The field explains itself when a required place is missing.
  useEffect(() => {
    input.current?.setCustomValidity(required && !picked ? labels.required : '');
  }, [picked, required, labels.required]);

  const choose = (place: PickedPlace | null) => {
    setPicked(place);
    setText(place?.name ?? '');
    setOpen(false);
    onChange?.(place);
    if (hidden.current) hidden.current.value = place ? place[value] : anyValue;
    if (autoSubmit) {
      // After React has written the hidden value.
      window.setTimeout(() => hidden.current?.form?.requestSubmit(), 0);
    }
  };

  const options: Array<PickedPlace | null> = [...(labels.any && !text.trim() ? [null] : []), ...(results ?? [])];
  const showEmpty = open && results !== null && results.length === 0 && text.trim().length >= 2;

  return (
    <div className={`place-picker${open ? ' is-open' : ''}`}>
      <input type="hidden" name={name} ref={hidden} defaultValue={initial ?? ''} />
      <div className="pp-field">
        <svg className="pp-pin" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="10" r="2.6" fill="currentColor" />
        </svg>
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={picked ? picked.name : labels.any ?? labels.placeholder}
          value={text}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setOpen(true);
            if (picked) {
              // Typing over a choice starts a new search; the old choice is gone until another is made.
              setPicked(null);
              if (hidden.current) hidden.current.value = '';
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && options.length > 0) {
              event.preventDefault();
              choose(options[active] ?? null);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {picked ? <span className="pp-context">{picked.context}</span> : null}
        {picked && !required && !disabled ? (
          <button type="button" className="pp-clear" aria-label={labels.clear} onClick={() => choose(null)}>
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="pp-list" id={listId} role="listbox">
          {!text.trim() && results && results.length > 0 ? (
            <li className="pp-head" role="presentation">
              {labels.suggested}
            </li>
          ) : null}
          {options.map((place, index) => (
            <li
              key={place?.id ?? 'any'}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(place);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {place ? (
                <>
                  <span className="pp-name">{place.name}</span>
                  <span className="pp-meta">
                    {place.kind}
                    {place.context ? ` · ${place.context}` : ''}
                  </span>
                </>
              ) : (
                <span className="pp-name">{labels.any}</span>
              )}
            </li>
          ))}
          {showEmpty ? <li className="pp-empty">{labels.empty}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
