'use client';

import { useActionState } from 'react';
import { appealAction, type AppealState } from './actions';

const gold = { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' };

export function AppealForm({ token, min, max, labels }: { token: string; min: number; max: number; labels: { body: string; help: string; submit: string } }) {
  const [state, action, pending] = useActionState<AppealState, FormData>(appealAction, { status: 'idle' });
  if (state.status === 'sent') {
    return (
      <p role="status" className="auth-notice">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-sm font-medium">{labels.body}</span>
        <textarea
          name="body"
          required
          minLength={min}
          maxLength={max}
          rows={7}
          className="mt-1.5 w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 py-3 text-base"
        />
      </label>
      <p className="text-sm text-[var(--text-secondary)]">{labels.help}</p>
      {state.status === 'error' ? (
        <p role="alert" className="auth-notice">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="min-h-touch w-full rounded-xl px-5 font-medium disabled:opacity-60" style={gold}>
        {labels.submit}
      </button>
    </form>
  );
}
