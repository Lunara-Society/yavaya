'use client';

import { useActionState } from 'react';
import { loginAction, type ActionState } from '../actions';

export function LoginForm({
  labels,
}: {
  labels: { email: string; password: string; submit: string; error: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {
    status: 'idle',
  });

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <label className="block">
        <span className="text-sm font-medium">{labels.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">{labels.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base"
        />
      </label>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-critical)' }}
        >
          {labels.error}
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
