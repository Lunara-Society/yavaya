'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction, type ActionState } from '../actions';

/**
 * Registration form.
 *
 * Client-side constraints here are courtesy — faster feedback on a slow
 * connection. The server validates everything again and is the only authority.
 */
export function RegisterForm({
  locale,
  inviter,
  next = '/',
  labels,
}: {
  locale: string;
  inviter?: string | null;
  /** Where to go once the address is confirmed. */
  next?: string;
  labels: {
    email: string;
    password: string;
    displayName: string;
    acceptTerms: string;
    readTerms: string;
    submit: string;
    yayIdExplained: string;
    registeredTitle: string;
    monitoringNotice: string;
    undeliverable: string;
    verifyContinue: string;
    signIn: string;
    forgot: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerAction, {
    status: 'idle',
  });
  const errorFor = (name: string) => (state.status === 'error' ? state.fields?.[name] : undefined);

  if (state.status === 'registered') {
    return (
      <section className="surface-card mt-6 p-5" aria-live="polite">
        <h2 className="text-lg font-semibold">{labels.registeredTitle}</h2>
        <p className="mt-2 font-mono text-xl tracking-wider">{state.yayId}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{labels.yayIdExplained}</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">{labels.monitoringNotice}</p>

        {state.verificationNotice === 'undeliverable' ? (
          <div
            className="mt-4 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-caution)' }}
          >
            <p>{labels.undeliverable}</p>
            {state.code ? (
              <p className="mt-2 font-mono text-base tracking-widest">{state.code}</p>
            ) : null}
          </div>
        ) : null}

        {/*
          Offered in both cases. When delivery failed there is still a code in
          the database, and a member who obtains it another way — support, or
          the local development panel above — can finish here.
        */}
        <Link
          href={next === '/' ? '/verify' : `/verify?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
        >
          {labels.verifyContinue}
        </Link>
      </section>
    );
  }

  return (
    // The browser checks the fields first (and says which, see ui/site/form-check); the server checks again and says the same way.
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {inviter ? <input type="hidden" name="inviter" value={inviter} /> : null}

      <Field label={labels.displayName} name="displayName" autoComplete="name" minLength={2} maxLength={60} error={errorFor('displayName')} />
      <Field label={labels.email} name="email" type="email" autoComplete="email" inputMode="email" error={errorFor('email')} />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        error={errorFor('password')}
      />

      <label className="flex min-h-touch items-center gap-3 text-sm">
        <input type="checkbox" name="acceptedTerms" required className="size-5 shrink-0" aria-invalid={errorFor('acceptedTerms') ? true : undefined} />
        <span>{labels.acceptTerms}</span>
      </label>
      {errorFor('acceptedTerms') ? <p className="field-error pl-8">{errorFor('acceptedTerms')}</p> : null}
      {/* Outside the label, so following the link does not tick the box. */}
      <p className="-mt-2 pl-8 text-sm">
        <a href="/terms" target="_blank" rel="noopener" className="underline">
          {labels.readTerms}
        </a>
      </p>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-critical)' }}
        >
          {state.message}
          {/* The address may belong to an account already. Without saying whether it does (that would tell anyone who
              is registered), the two ways forward are offered. */}
          {state.messageKey === 'error.registration.email_unavailable' ? (
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/login" className="underline">
                {labels.signIn}
              </Link>
              <Link href="/login/olvide" className="underline">
                {labels.forgot}
              </Link>
            </span>
          ) : null}
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

function Field({
  label,
  name,
  type = 'text',
  error,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  /** What the server found wrong with this field. */
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required
        aria-invalid={error ? true : undefined}
        className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base"
        {...rest}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}
