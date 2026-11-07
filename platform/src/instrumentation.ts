import type { Instrumentation } from 'next';

/**
 * Error reporting to Sentry, server side only.
 *
 * Next calls `register` once per server process and `onRequestError` for
 * every error thrown while rendering a page, running a Server Action or
 * answering a route — the errors a member sees as "Algo salió mal" with a
 * reference number. That reference (the digest) is attached, so a member's
 * screenshot leads straight to the report.
 *
 * Nothing here reaches the browser: the Sentry browser SDK is not used,
 * because it would add tens of kilobytes to every page on the phones Yavaya is
 * for. Errors that happen only in the browser are reported to our own
 * /api/client-errors, which forwards them from the server.
 *
 * The middleware runs on the edge runtime and is not covered.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { sentryDsn, sentryOptions } = await import('@/server/observability/sentry');
  const dsn = sentryDsn();
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init(sentryOptions(dsn, 'web'));
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return;
  const { isSilentPath } = await import('@/server/observability/scrub');
  if (isSilentPath(request.path)) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(error, request, context);
};
