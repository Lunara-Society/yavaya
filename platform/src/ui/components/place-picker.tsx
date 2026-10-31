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
  searching: string;
  /** Filters only: the choice that means "anywhere". */
  any?: string;
};

const RESTORE_EVENT = 'yavaya:place-restore';
const pendingRestore = new WeakMap<HTMLInputElement, { saved: string; asChoice: boolean }>();

/**
 * Puts a saved place back into a picker by its hidden input (a form sent back
 * with an error). Works whether or not the picker has hydrated yet: one that
 * has hears the event, one that hasn't finds the value when it does.
 *
 * `asChoice` makes it count as the person choosing it (Roxi filling the form
 * in): the form then reacts as it would to a tap, for example switching the
 * price to that place's currency.
 */
export function restorePlace(field: HTMLInputElement, saved: string, options: { asChoice?: boolean } = {}) {
  pendingRestore.set(field, { saved, asChoice: options.asChoice ?? false });
  field.dispatchEvent(new Event(RESTORE_EVENT));
}

/** The hidden input of a place picker, which only `restorePlace` can fill. */
export function isPlacePickerField(field: Element): field is HTMLInputElement {
  return field instanceof HTMLInputElement && field.type === 'hidden' && field.dataset.placePicker !== undefined;
}

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
  // Search results with the query they answer: a reply to an earlier query is never offered for a later one.
  const [found, setFound] = useState<{ query: string; places: PickedPlace[] } | null>(null);
  const [active, setActive] = useState(-1);
  // Enter pressed before the results for what was typed arrived: the best match is chosen when they do.
  const enterWhenFound = useRef<string | null>(null);
  // A place restored as the person's own choice: once it is looked up, the form hears it like a tap.
  const chooseOnLoad = useRef(false);
  const settlements = value === 'id';

  // What the form posts. It lives in state and is rendered as the hidden
  // input's value, never written into the DOM by hand: React 19 re-applies a
  // hidden input's defaultValue on every render, so a value set directly was
  // wiped by the very re-render that showed the choice — the field read
  // "Nandaime" and the form posted no place at all.
  const [posted, setPosted] = useState(initial ?? '');
  // A saved value from outside (the page, or a form sent back with an error) still to be shown by name.
  const [lookup, setLookup] = useState(initial ?? '');
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    // The page brought a different saved value (a filter applied); it replaces whatever was here.
    setSeenInitial(initial);
    setPosted(initial ?? '');
    setLookup(initial ?? '');
    setPicked(null);
    setText('');
  }

  // Show the saved place by name.
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    fetch(`/api/places?${value}=${encodeURIComponent(lookup)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { places: PickedPlace[] }) => {
        const place = data.places[0] ?? null;
        if (place) {
          setPicked(place);
          setText(place.name);
        }
        onLoad?.(place);
        if (chooseOnLoad.current) {
          chooseOnLoad.current = false;
          if (place) onChange?.(place);
        }
      })
      .catch(() => {});
    return () => controller.abort();
    // Only a new saved value warrants a new lookup, not a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, value]);

  // A place put back after the form came back with an error.
  useEffect(() => {
    const node = hidden.current;
    if (!node) return;
    const take = () => {
      const pending = pendingRestore.get(node);
      if (!pending) return;
      pendingRestore.delete(node);
      chooseOnLoad.current = pending.asChoice;
      setPosted(pending.saved);
      setLookup(pending.saved);
      setPicked(null);
      setText('');
    };
    take();
    node.addEventListener(RESTORE_EVENT, take);
    return () => node.removeEventListener(RESTORE_EVENT, take);
  }, []);

  const query = picked && text === picked.name ? '' : text.trim();
  const results = found && found.query === query ? found.places : null;

  const choose = (place: PickedPlace | null) => {
    enterWhenFound.current = null;
    setPicked(place);
    setText(place?.name ?? '');
    setOpen(false);
    setLookup('');
    setPosted(place ? place[value] : anyValue);
    onChange?.(place);
    if (autoSubmit) {
      // After React has written the hidden value.
      window.setTimeout(() => hidden.current?.form?.requestSubmit(), 0);
    }
  };

  // Search as the person types, a beat after they pause.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (settlements) params.set('settlements', '1');
      fetch(`/api/places?${params}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { places: PickedPlace[] }) => {
          // With nothing typed the suggestions are the big cities; forms take only towns and cities anyway.
          setFound({ query, places: data.places });
          // What was typed has its best match ready for Enter. Bare suggestions wait for an arrow key,
          // so Enter in a field that already holds a choice never swaps it for the first big city.
          setActive(query ? 0 : -1);
          if (query && enterWhenFound.current === query && data.places[0]) choose(data.places[0]);
        })
        .catch(() => {});
    }, query ? 140 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `choose` only sets state and calls the latest props; its new identity each render is no reason to search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, settlements]);

  // The field explains itself when a required place is missing.
  useEffect(() => {
    input.current?.setCustomValidity(required && !picked ? labels.required : '');
  }, [picked, required, labels.required]);

  const options: Array<PickedPlace | null> = [...(labels.any && !text.trim() ? [null] : []), ...(results ?? [])];
  const searching = open && results === null;
  const showEmpty = open && results !== null && results.length === 0 && query.length >= 2;

  return (
    <div className={`place-picker${open ? ' is-open' : ''}`}>
      <input type="hidden" name={name} ref={hidden} value={posted} data-place-picker="" />
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
          aria-busy={searching}
          autoComplete="off"
          spellCheck={false}
          placeholder={picked ? picked.name : labels.any ?? labels.placeholder}
          value={text}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          // A field that already has focus opens again when clicked, to change the place.
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setOpen(true);
            enterWhenFound.current = null;
            // What is typed is not a choice: the old one is gone until another is made.
            setLookup('');
            setPosted('');
            if (picked) setPicked(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open) {
              if (active >= 0 && active < options.length) {
                event.preventDefault();
                choose(options[active] ?? null);
              } else if (query && searching) {
                // Not a half-typed place sent with the form: the best match is chosen once it arrives.
                event.preventDefault();
                enterWhenFound.current = query;
              } else {
                setOpen(false);
              }
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
          {!query && results && results.length > 0 ? (
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
              // The field keeps focus, and the list stays where it is, until the click lands.
              // Choosing on mousedown removed the list from under the pointer, so the click went
              // to whatever was there next: inside the <label> every form wraps a picker in, that
              // focused the field again and reopened the list.
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                // Nor may the click itself reach that label, which would do the same.
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
          {searching ? <li className="pp-empty">{labels.searching}</li> : null}
          {showEmpty ? <li className="pp-empty">{labels.empty}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
