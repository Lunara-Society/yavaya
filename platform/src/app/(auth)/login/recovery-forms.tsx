'use client';

import { useActionState, useState } from 'react';
import { forgotPasswordAction, newPasswordAction, secondStepAction, type FormState } from '../recovery-actions';

const field = 'mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base';
const submit = 'min-h-touch w-full rounded-xl px-5 font-medium disabled:opacity-60';
const gold = { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' };

function Message({ state }: { state: FormState }) {
  if (state.status === 'idle') return null;
  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} className="auth-notice">
      {state.message}
    </p>
  );
}

/** Six digits from the app, or — one tap away — a backup code. */
export function SecondStepForm({ labels }: { labels: { code: string; recovery: string; useRecovery: string; useApp: string; submit: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(secondStepAction, { status: 'idle' });
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">{recovery ? labels.recovery : labels.code}</span>
        {recovery ? (
          <input key="recovery" name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} required className={field} placeholder="xxxxx-xxxxx" />
        ) : (
          <input
            key="app"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            className={`${field} text-center text-2xl tracking-[0.4em]`}
          />
        )}
      </label>
      <Message state={state} />
      <button type="submit" disabled={pending} className={submit} style={gold}>
        {labels.submit}
      </button>
      <button type="button" className="auth-other w-full" onClick={() => setRecovery((on) => !on)}>
        {recovery ? labels.useApp : labels.useRecovery}
      </button>
    </form>
  );
}

export function ForgotForm({ labels }: { labels: { email: string; submit: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, { status: 'idle' });
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" inputMode="email" autoComplete="email" required className={field} />
      </label>
      <Message state={state} />
      {state.status === 'sent' ? null : (
        <button type="submit" disabled={pending} className={submit} style={gold}>
          {labels.submit}
        </button>
      )}
    </form>
  );
}

export function NewPasswordForm({ token, labels }: { token: string; labels: { password: string; confirm: string; submit: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(newPasswordAction, { status: 'idle' });
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-sm font-medium">{labels.password}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{labels.confirm}</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className={field} />
      </label>
      <Message state={state} />
      <button type="submit" disabled={pending} className={submit} style={gold}>
        {labels.submit}
      </button>
    </form>
  );
}
