'use client';

import { useEffect, useRef, useState } from 'react';
import { onDraft, takeDraft, type RoxiForm } from './drafts';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Sets a value the way typing would, so a client form's change tracking sees it too. */
function setValue(field: Field, value: string) {
  const prototype = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
}

/**
 * Put inside a form Roxi can fill. When a draft for this form is waiting —
 * now, or later while the page is open — its values go into the fields by
 * name and its photos into the file input, exactly as if the member had typed
 * and chosen them. The member reviews and sends; nothing is submitted here.
 *
 * Written against the DOM rather than each form's state so that the server
 * rendered forms need nothing more than this one element. Values go in through
 * the element's own setter and an input event, which is what a client form
 * listening for changes needs to notice them.
 */
export function RoxiPrefill({ form, notice }: { form: RoxiForm; notice: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const apply = () => {
      const target = anchor.current?.closest('form');
      if (!target) return;
      const draft = takeDraft(form);
      if (!draft) return;

      for (const [name, value] of Object.entries(draft.fields)) {
        const field = target.elements.namedItem(name);
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
        if (field instanceof HTMLInputElement && (field.type === 'file' || field.type === 'hidden')) continue;
        if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = value === true || value === 'true';
        else if (field instanceof HTMLSelectElement && ![...field.options].some((option) => option.value === String(value))) continue;
        else setValue(field, String(value));
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const input = target.querySelector<HTMLInputElement>('input[type="file"]');
      if (input && draft.files.length > 0) {
        const transfer = new DataTransfer();
        for (const file of draft.files) transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Marks what Roxi helped write. Mercadito keeps it in the listing's audit record;
      // the other forms ignore it, and no value but this one means anything.
      let marker = target.querySelector<HTMLInputElement>('input[name="assistant"]');
      if (!marker) {
        marker = document.createElement('input');
        marker.type = 'hidden';
        marker.name = 'assistant';
        target.append(marker);
      }
      marker.value = 'roxi';

      setApplied(true);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // The first thing still missing is usually the one only the member can say: the price.
      const empty = [...target.querySelectorAll<Field>('input[required], textarea[required], select[required]')].find(
        (field) => !field.value && !(field instanceof HTMLInputElement && (field.type === 'file' || field.type === 'hidden')),
      );
      empty?.focus({ preventScroll: true });
    };
    apply();
    return onDraft(apply);
  }, [form]);

  return (
    <span ref={anchor} style={{ display: 'contents' }}>
      {applied ? (
        <span className="roxi-prefill-note" role="status">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
