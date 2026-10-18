'use client';

import { useActionState } from 'react';
import { registerWithGoogleAction, type GoogleSignupState } from '../../google-actions';

export function GoogleSignupForm({
  defaultName,
  labels,
}: {
  defaultName: string;
  labels: { displayName: string; acceptTerms: string; readTerms: string; submit: string };
}) {
  const [state, formAction, pending] = useActionState<GoogleSignupState, FormData>(registerWithGoogleAction, { status: 'idle' });
  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <label className="block">
        <span className="text-sm font-medium">{labels.displayName}</span>
        <input
          name="displayName"
          defaultValue={defaultName}
          autoComplete="name"
          minLength={2}
          maxLength={60}
          required
          className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base"
        />
      </label>

      <label className="flex min-h-touch items-center gap-3 text-sm">
        <input type="checkbox" name="acceptedTerms" required className="size-5 shrink-0" />
        <span>{labels.acceptTerms}</span>
      </label>
      {/* Outside the label, so following the link does not tick the box. */}
      <p className="-mt-2 pl-8 text-sm">
        <a href="/terms" target="_blank" rel="noopener" className="underline">
          {labels.readTerms}
        </a>
      </p>

      {state.status === 'error' ? (
        <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-critical)' }}>
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-touch w-full rounded-xl px-5 font-medium disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
      >
        {labels.submit}
      </button>
    </form>
  );
}
