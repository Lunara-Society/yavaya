import { scrubBreadcrumb, scrubReport, type ReportShape } from './scrub';

/**
 * Settings shared by the web server (src/instrumentation.ts) and the
 * scheduler (src/server/jobs/run.ts). Read from process.env directly, not
 * through serverEnv(): a misconfigured environment that makes serverEnv()
 * throw at start-up is exactly the failure that most needs reporting.
 *
 * Without SENTRY_DSN nothing is initialised and nothing is sent.
 */

/** A Sentry DSN, or undefined when none (or something that is not one) is set. */
export function sentryDsn(): string | undefined {
  const value = process.env.SENTRY_DSN?.trim();
  if (!value) return undefined;
  return /^https:\/\/[0-9a-f]+@[a-z0-9.-]+\/\d+$/i.test(value) ? value : undefined;
}

export function sentryOptions(dsn: string, service: 'web' | 'scheduler') {
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    initialScope: { tags: { service } },
    // Errors only. No performance tracing, no profiling, no session replay:
    // each of those would send far more about each visit than an error does.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Sentry's own "local variables" capture would attach function arguments to frames.
    includeLocalVariables: false,
    maxBreadcrumbs: 30,
    beforeSend: <T>(event: T): T | null => scrubReport(event as ReportShape) as T | null,
    beforeBreadcrumb: <T>(crumb: T): T | null => scrubBreadcrumb(crumb as never) as T | null,
  };
}
