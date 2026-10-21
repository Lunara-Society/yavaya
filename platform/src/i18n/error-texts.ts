import type { Translator } from './index';

/**
 * The few words the error page needs, written into every page by the root
 * layout as a small JSON block. The error boundary is a client component, and
 * importing a translator there put both full dictionaries (79 KB compressed)
 * into a script every page downloaded, for a page almost nobody sees.
 */
export const ERROR_TEXTS_ID = 'yv-error-texts';

export type ErrorTexts = { title: string; body: string; retry: string; home: string; reference: string };

/** `reference` keeps `{digest}` for the boundary to fill in. */
export function errorTexts(t: Translator): ErrorTexts {
  return {
    title: t('error.boundary.title'),
    body: t('error.boundary.body'),
    retry: t('error.boundary.retry'),
    home: t('nav.home'),
    reference: t('error.boundary.reference', { digest: '{digest}' }),
  };
}
