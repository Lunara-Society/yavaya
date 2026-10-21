'use client';

import { useEffect, useState } from 'react';
import { ERROR_TEXTS_ID, errorTexts, type ErrorTexts } from '@/i18n/error-texts';

/** The words the layout wrote for this page, or null if they are not there. */
function writtenTexts(): ErrorTexts | null {
  const text = document.getElementById(ERROR_TEXTS_ID)?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as ErrorTexts;
  } catch {
    return null;
  }
}

/**
 * Error boundary.
 *
 * A boundary must be a client component, so it cannot await the server
 * translator. The root layout writes the few words it needs into every page
 * (src/i18n/error-texts.ts) and the boundary reads them from there — which
 * keeps every string in the dictionaries without sending the dictionaries to
 * every visitor for a page almost nobody sees.
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
  const [texts, setTexts] = useState<ErrorTexts | null>(null);

  useEffect(() => {
    const written = writtenTexts();
    if (written) {
      setTexts(written);
      return;
    }
    // Not expected — the layout always writes them. Only then are the dictionaries fetched.
    let cancelled = false;
    import('@/i18n')
      .then(({ createTranslator, DEFAULT_LOCALE }) => {
        const lang = document.documentElement.lang;
        if (!cancelled) setTexts(errorTexts(createTranslator(lang === 'en' || lang === 'es' ? lang : DEFAULT_LOCALE)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!texts) return <main className="mx-auto min-h-dvh w-full max-w-md" aria-busy="true" />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{texts.title}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{texts.body}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
        >
          {texts.retry}
        </button>
        <a
          href="/"
          className="inline-flex min-h-touch items-center rounded-xl border px-5 font-medium"
        >
          {texts.home}
        </a>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          {texts.reference.replace('{digest}', error.digest)}
        </p>
      ) : null}
    </main>
  );
}
