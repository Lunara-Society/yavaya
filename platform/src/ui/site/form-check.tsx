'use client';

import { useEffect, useState } from 'react';

export type FormCheckLabels = {
  summaryOne: string;
  /** Keeps `{count}`. */
  summaryMany: string;
  required: string;
  choose: string;
  file: string;
  checkbox: string;
  email: string;
  /** Keeps `{min}`. */
  tooShort: string;
  /** Keeps `{max}`. */
  tooLong: string;
  /** Keeps `{min}`. */
  tooLow: string;
  /** Keeps `{max}`. */
  tooHigh: string;
  number: string;
  format: string;
};

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * What a form that will not send says, on every page.
 *
 * A form with a missing or wrong field is stopped by the browser, which says
 * so in a small bubble next to the first field — gone in a few seconds, easy
 * to miss on a phone, and nothing at all when that field is hidden. Members
 * reported forms that "did nothing". Here, when the browser stops a form, each
 * field it stopped on is marked with a sentence under it, the form opens with
 * how many need attention, and the first is brought into view. Each mark goes
 * as soon as its field is put right.
 *
 * Done with attributes (`data-check-error` read by CSS, `aria-invalid`) rather
 * than inserted elements, so the forms React renders are never restructured.
 * A form opts out with `data-no-form-check`. The server checks everything
 * again; this is only what the member sees before sending.
 */
export function FormCheck({ labels }: { labels: FormCheckLabels }) {
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const stopped = new Map<HTMLFormElement, Field[]>();
    let flushing = false;

    const messageFor = (field: Field): string => {
      const v = field.validity;
      const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
      if (v.customError) return field.validationMessage;
      if (v.valueMissing) {
        if (field instanceof HTMLSelectElement) return labels.choose;
        if (field instanceof HTMLInputElement && field.type === 'file') return labels.file;
        if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) return field.type === 'radio' ? labels.choose : labels.checkbox;
        return labels.required;
      }
      if (v.typeMismatch && field instanceof HTMLInputElement && field.type === 'email') return labels.email;
      if (v.tooShort) return fill(labels.tooShort, { min: String((field as HTMLInputElement).minLength) });
      if (v.tooLong) return fill(labels.tooLong, { max: String((field as HTMLInputElement).maxLength) });
      if (v.rangeUnderflow) return fill(labels.tooLow, { min: (field as HTMLInputElement).min });
      if (v.rangeOverflow) return fill(labels.tooHigh, { max: (field as HTMLInputElement).max });
      if (v.badInput) return labels.number;
      return labels.format;
    };

    /** Where the sentence shows: under the place picker, the label around the field, or the field's own box. */
    const holderOf = (field: Field): HTMLElement =>
      (field.closest('.place-picker') as HTMLElement | null) ?? (field.closest('label') as HTMLElement | null) ?? (field.parentElement as HTMLElement);

    const mark = (field: Field) => {
      field.setAttribute('aria-invalid', 'true');
      holderOf(field).setAttribute('data-check-error', messageFor(field));
    };

    const unmark = (field: Field) => {
      field.removeAttribute('aria-invalid');
      const holder = holderOf(field);
      // A label can hold several fields (a group of boxes): it clears when none of them is still wrong.
      const stillWrong = [...holder.querySelectorAll<Field>('[aria-invalid="true"]')].some((other) => other !== field);
      if (!stillWrong) holder.removeAttribute('data-check-error');
    };

    const summaryFor = (count: number) => (count === 1 ? labels.summaryOne : labels.summaryMany.replace('{count}', String(count)));

    const flush = () => {
      flushing = false;
      for (const [form, fields] of stopped) {
        // A group of radio buttons is one question: one mark.
        const key = (field: Field) => (field instanceof HTMLInputElement && field.type === 'radio' ? `radio:${field.name}` : field);
        const unique = fields.filter((field, index) => fields.findIndex((other) => key(other) === key(field)) === index);
        for (const field of unique) mark(field);
        const text = summaryFor(unique.length);
        form.setAttribute('data-check-summary', text);
        setAnnounce(text);
        const first = unique[0];
        if (first) {
          const target = first.offsetParent === null ? holderOf(first) : first;
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (first.offsetParent !== null) first.focus({ preventScroll: true });
        }
      }
      stopped.clear();
    };

    const onInvalid = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      const form = field.form;
      if (!form || form.hasAttribute('data-no-form-check')) return;
      // Our sentence replaces the browser's bubble, which said the same thing for a moment and only for one field.
      event.preventDefault();
      stopped.set(form, [...(stopped.get(form) ?? []), field]);
      if (!flushing) {
        flushing = true;
        window.setTimeout(flush, 0);
      }
    };

    /*
     * Re-checked after any change in a form that has marks: a place chosen
     * from a list, a photo added, a box ticked. A frame later, so a field a
     * component updates (the place picker) has its new validity.
     */
    const recheck = (event: Event) => {
      const form = (event.target as Element | null)?.closest?.('form');
      if (!form?.hasAttribute('data-check-summary')) return;
      window.requestAnimationFrame(() => {
        for (const field of form.querySelectorAll<Field>('[aria-invalid="true"]')) {
          if (field.checkValidity()) unmark(field);
          else holderOf(field).setAttribute('data-check-error', messageFor(field));
        }
        const left = form.querySelectorAll('[aria-invalid="true"]').length;
        if (left === 0) form.removeAttribute('data-check-summary');
        else form.setAttribute('data-check-summary', summaryFor(left));
      });
    };

    document.addEventListener('invalid', onInvalid, true);
    for (const type of ['input', 'change', 'click']) document.addEventListener(type, recheck, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      for (const type of ['input', 'change', 'click']) document.removeEventListener(type, recheck, true);
    };
  }, [labels]);

  return (
    <p className="sr-only" role="status" aria-live="assertive">
      {announce}
    </p>
  );
}
