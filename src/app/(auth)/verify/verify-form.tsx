'use client';

import { useActionState } from 'react';
import { resendVerificationAction, verifyEmailAction, type VerifyState } from '../actions';

/**
 * Email verification.
 *
 * One input rather than six single-character boxes: six boxes need JavaScript
 * to be usable at all, break paste on several mobile browsers, and read as six
 * unlabelled fields to a screen reader. `autocomplete="one-time-code"` lets iOS
 * and Android offer the code from the notification, which is the affordance the
 * boxes were imitating.
 *
 * Both forms are ordinary forms. With JavaScript unavailable they still post.
 */
export function VerifyForm({
  labels,
}: {
  labels: {
    code: string;
    codeHint: string;
    submit: string;
    resend: string;
    resendHint: string;
  };
}) {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(verifyEmailAction, {
    status: 'idle',
  });
  const [resendState, resendFormAction, resending] = useActionState<VerifyState, FormData>(
    resendVerificationAction,
    { status: 'idle' },
  );

  return (
    <>
      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="text-sm font-medium">{labels.code}</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            aria-describedby="code-hint"
            className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-center font-mono text-2xl tracking-[0.4em]"
          />
        </label>
        <p id="code-hint" className="text-sm text-[var(--text-secondary)]">
          {labels.codeHint}
        </p>

        {state.status === 'error' ? (
          <p
            role="alert"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-critical)' }}
          >
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

      <form action={resendFormAction} className="mt-8 border-t pt-6">
        <p className="text-sm text-[var(--text-secondary)]">{labels.resendHint}</p>

        {resendState.status !== 'idle' ? (
          <div
            aria-live="polite"
            className="mt-3 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor:
                resendState.status === 'error' ? 'var(--color-critical)' : 'var(--color-caution)',
            }}
          >
            <p>{resendState.message}</p>
            {resendState.status === 'resent' && resendState.code ? (
              <p className="mt-2 font-mono text-base tracking-widest">{resendState.code}</p>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={resending}
          className="mt-3 min-h-touch w-full rounded-xl border px-5 font-medium disabled:opacity-60"
        >
          {labels.resend}
        </button>
      </form>
    </>
  );
}
