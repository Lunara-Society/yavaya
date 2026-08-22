'use client';

import { useEffect, useState } from 'react';
import { createTranslator, DEFAULT_LOCALE, type Locale } from '@/i18n';

/**
 * Error boundary.
 *
 * A boundary must be a client component, so it cannot await the server
 * translator. It imports the pure one instead and reads the locale off the
 * `lang` attribute the server already set on `<html>` — which keeps every
 * string in the dictionaries, where the rule says they live.
 *
 * The shell is not rendered here. Something in the tree already threw, and
 * wrapping the failure in components that may themselves be the cause is how a
 * boundary ends up throwing inside itself.
 *
 * `error.message` is never shown. It can carry a stack, a query, or a
 * connection string, and the member can do nothing with any of it. The digest
 * is shown because that is the value support needs to find the matching log
 * line — it identifies the occurrence without describing it.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const lang = document.documentElement.lang;
    if (lang === 'en' || lang === 'es') setLocale(lang);
  }, []);

  const t = createTranslator(locale);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('error.boundary.title')}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{t('error.boundary.body')}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
        >
          {t('error.boundary.retry')}
        </button>
        <a
          href="/"
          className="inline-flex min-h-touch items-center rounded-xl border px-5 font-medium"
        >
          {t('nav.home')}
        </a>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          {t('error.boundary.reference', { digest: error.digest })}
        </p>
      ) : null}
    </main>
  );
}
