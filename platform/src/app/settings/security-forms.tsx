'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { normalizeDisplayName } from '@/server/domains/identity/normalize';
import {
  changeNameAction,
  changePasswordAction,
  confirmTwoStepAction,
  disableTwoStepAction,
  newRecoveryCodesAction,
  savedCodesAction,
  signOutOthersAction,
  type SecurityState,
} from './security-actions';

const field = 'mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base';
const gold = { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' };
const idle: SecurityState = { status: 'idle' };

function Outcome({ state }: { state: SecurityState }) {
  const box = useRef<HTMLParagraphElement>(null);
  // The form clears itself after sending, so a quiet line could pass for nothing having happened:
  // the answer is brought into view and given focus, so it is seen (and read out) every time.
  useEffect(() => {
    if (state.status === 'error' || state.status === 'done') {
      box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.current?.focus({ preventScroll: true });
    }
  }, [state]);
  if (state.status !== 'error' && state.status !== 'done') return null;
  const error = state.status === 'error';
  return (
    <p
      ref={box}
      tabIndex={-1}
      role={error ? 'alert' : 'status'}
      className="rounded-lg border px-3 py-2.5 text-sm font-medium outline-none"
      style={
        error
          ? { borderColor: 'var(--color-critical)', background: 'color-mix(in srgb, var(--color-critical) 14%, transparent)' }
          : { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
      }
    >
      <span aria-hidden="true">{error ? '✕ ' : '✓ '}</span>
      {state.message}
    </p>
  );
}

/** Shown once, right after they are made. */
export function RecoveryCodes({ codes, labels }: { codes: string[]; labels: { title: string; lead: string; done: string } }) {
  return (
    <div className="surface-card p-4">
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{labels.lead}</p>
      <ol className="mt-4 grid grid-cols-2 gap-2 font-mono text-base tracking-wider">
        {codes.map((code) => (
          <li key={code} className="rounded-lg border px-3 py-2 text-center">
            {code}
          </li>
        ))}
      </ol>
      <form action={savedCodesAction}>
        <button type="submit" className="mt-4 flex min-h-touch w-full items-center justify-center rounded-xl px-4 font-medium" style={gold}>
          {labels.done}
        </button>
      </form>
    </div>
  );
}

type CodeLabels = { code: string; submit: string; title: string; lead: string; done: string };

export function ConfirmTwoStepForm({ labels }: { labels: CodeLabels }) {
  const [state, action, pending] = useActionState(confirmTwoStepAction, idle);
  if (state.status === 'codes') return <RecoveryCodes codes={state.codes} labels={labels} />;
  return (
    <form action={action} className="mt-3 space-y-3">
      <label className="block">
        <span className="text-sm font-medium">{labels.code}</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className={`${field} text-center text-2xl tracking-[0.4em]`} />
      </label>
      <Outcome state={state} />
      <button type="submit" disabled={pending} className="min-h-touch w-full rounded-xl px-5 font-medium disabled:opacity-60" style={gold}>
        {labels.submit}
      </button>
    </form>
  );
}

/** New backup codes, or turning two-step off: both behind a code. */
export function TwoStepCodeForm({ kind, labels }: { kind: 'new_codes' | 'off'; labels: CodeLabels }) {
  const [state, action, pending] = useActionState(kind === 'off' ? disableTwoStepAction : newRecoveryCodesAction, idle);
  if (state.status === 'codes') return <RecoveryCodes codes={state.codes} labels={labels} />;
  if (state.status === 'done') return <Outcome state={state} />;
  return (
    <form action={action} className="surface-card space-y-3 p-4">
      <h2 className="font-semibold">{labels.title}</h2>
      <p className="text-sm text-[var(--text-secondary)]">{labels.lead}</p>
      <label className="block">
        <span className="text-sm font-medium">{labels.code}</span>
        <input name="code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} required className={field} />
      </label>
      <Outcome state={state} />
      <button type="submit" disabled={pending} className="min-h-touch w-full rounded-xl border px-5 font-medium disabled:opacity-60">
        {labels.submit}
      </button>
    </form>
  );
}

export function ChangePasswordForm({ labels }: { labels: { current: string; next: string; submit: string } }) {
  const [state, action, pending] = useActionState(changePasswordAction, idle);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">{labels.current}</span>
        <input name="current" type="password" autoComplete="current-password" required className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{labels.next}</span>
        <input name="next" type="password" autoComplete="new-password" minLength={10} required className={field} />
      </label>
      <Outcome state={state} />
      <button type="submit" disabled={pending} className="min-h-touch w-full rounded-xl border px-5 font-medium disabled:opacity-60">
        {labels.submit}
      </button>
    </form>
  );
}

/** The display name, with what the next change costs said before the button, never after. */
export function ChangeNameForm({ current, labels }: { current: string; labels: { label: string; note: string; submit: string; hint: string; unchanged: string } }) {
  const [state, action, pending] = useActionState(changeNameAction, idle);
  const [value, setValue] = useState(current);
  // The same name, however it is spaced, would only be refused: the button waits for a real change.
  // The server refuses it too, before anything is charged or the free change is used.
  const unchanged = normalizeDisplayName(value) === normalizeDisplayName(current);
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-sm font-medium">{labels.label}</span>
        <input
          name="name"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          minLength={2}
          maxLength={60}
          required
          autoComplete="nickname"
          aria-describedby="name-unchanged"
          className={field}
        />
      </label>
      <p className="text-sm text-[var(--text-secondary)]">{labels.note}</p>
      <Outcome state={state} />
      {unchanged ? (
        <p id="name-unchanged" className="text-sm text-[var(--text-secondary)]">
          {labels.unchanged}
        </p>
      ) : null}
      <button type="submit" disabled={pending || unchanged} className="min-h-touch w-full rounded-xl border px-5 font-medium disabled:opacity-60">
        {labels.submit}
      </button>
      <p className="text-xs text-[var(--text-secondary)]">{labels.hint}</p>
    </form>
  );
}

export function SignOutOthersForm({ label }: { label: string }) {
  const [state, action, pending] = useActionState(signOutOthersAction, idle);
  return (
    <form action={action} className="mt-3 space-y-3">
      <Outcome state={state} />
      <button type="submit" disabled={pending} className="min-h-touch w-full rounded-xl border px-4 font-medium disabled:opacity-60">
        {label}
      </button>
    </form>
  );
}
