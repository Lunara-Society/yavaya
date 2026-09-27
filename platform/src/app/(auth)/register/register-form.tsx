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
  labels,
}: {
  locale: string;
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
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerAction, {
    status: 'idle',
  });

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
          href="/verify"
          className="mt-5 inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
        >
          {labels.verifyContinue}
        </Link>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <Field label={labels.displayName} name="displayName" autoComplete="name" minLength={2} maxLength={60} />
      <Field label={labels.email} name="email" type="email" autoComplete="email" inputMode="email" />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
      />

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
  );
}

function Field({
  label,
  name,
  type = 'text',
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required
        className="mt-1.5 min-h-touch w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-base"
        {...rest}
      />
    </label>
  );
}
