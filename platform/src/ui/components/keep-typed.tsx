'use client';

import { useEffect, useRef } from 'react';
import { restorePlace } from './place-picker';

type Kept = { name: string; value: string; checked?: boolean; place?: boolean };

/** Long enough for the server's answer to come back; short enough that an old draft never resurfaces. */
const KEEP_FOR_MS = 5 * 60_000;
const SKIPPED_TYPES = new Set(['file', 'password', 'submit', 'button', 'reset', 'image']);

function fields(form: HTMLFormElement) {
  return [...form.elements].filter(
    (element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) &&
      Boolean(element.name) &&
      !element.disabled &&
      !SKIPPED_TYPES.has(element.type) &&
      // Hidden inputs come from the server, except the place a picker holds.
      (element.type !== 'hidden' || Boolean(element.closest('.place-picker'))),
  );
}

function collect(form: HTMLFormElement): Kept[] {
  return fields(form).map((field) => {
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      return { name: field.name, value: field.value, checked: field.checked };
    }
    return { name: field.name, value: field.value, place: field.type === 'hidden' };
  });
}

function restore(form: HTMLFormElement, kept: Kept[]) {
  // Fields are matched by name and by position among fields of that name, so a group of checkboxes comes back whole.
  const seen = new Map<string, number>();
  for (const field of fields(form)) {
    const index = seen.get(field.name) ?? 0;
    seen.set(field.name, index + 1);
    const entry = kept.filter((item) => item.name === field.name)[index];
    if (!entry) continue;
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      if (entry.value === field.value) field.checked = Boolean(entry.checked);
    } else if (field instanceof HTMLInputElement && field.type === 'hidden') {
      if (entry.place && entry.value) restorePlace(field, entry.value);
    } else if (field instanceof HTMLSelectElement) {
      if ([...field.options].some((option) => option.value === entry.value)) field.value = entry.value;
    } else if (entry.value) {
      field.value = entry.value;
    }
  }
}

/** What this tab kept for a form, removed as it is read. */
function take(key: string): { at: number; fields: Kept[] } | null {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as { at: number; fields: Kept[] } | null;
    window.sessionStorage.removeItem(key);
    return kept;
  } catch {
    return null;
  }
}

/**
 * Put inside a plain server form that sends the member back with `?error=`.
 * What they wrote is kept in this tab when they send it and put back if the
 * form comes back with an error, so one field the server refused never costs
 * them everything else they typed. Without JavaScript the form still works; it
 * just comes back empty, as it always did.
 *
 * Kept in this tab's sessionStorage only, for minutes, and taken out the next
 * time the form opens whether it is used or not. Files and passwords are never
 * kept.
 */
export function KeepTyped({ form }: { form: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const target = anchor.current?.closest('form');
    if (!target) return;
    const key = `yavaya:typed:${form}`;
    const kept = take(key);
    const sentBack = new URLSearchParams(window.location.search).has('error');
    if (kept && sentBack && Date.now() - kept.at < KEEP_FOR_MS && Array.isArray(kept.fields)) restore(target, kept.fields);

    const keep = () => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), fields: collect(target) }));
      } catch {
        // Private browsing or a full storage: the form is sent all the same.
      }
    };
    target.addEventListener('submit', keep);
    return () => target.removeEventListener('submit', keep);
  }, [form]);

  return <span ref={anchor} hidden />;
}
