import { sentryDsn, sentryOptions } from './sentry';

/**
 * Error reporting for the scheduler (one short process per tick).
 *
 * Loaded lazily so a scheduler without SENTRY_DSN never loads the SDK, and
 * flushed before the process ends: the tick is over in seconds and would
 * otherwise exit with the report still in its queue.
 */

type SentryNode = typeof import('@sentry/node');
let sentry: SentryNode | null = null;

export async function startJobReporting(): Promise<void> {
  const dsn = sentryDsn();
  if (!dsn) return;
  sentry = await import('@sentry/node');
  sentry.init(sentryOptions(dsn, 'scheduler'));
}

/** A job that threw. */
export function reportJobError(job: string, error: unknown): void {
  sentry?.captureException(error, { tags: { job } });
}

/**
 * A job that finished but reported failure without throwing (a payment
 * reconciliation where nothing settled, say). Grouped per job, so each
 * failing job is one issue in Sentry rather than one per tick.
 */
export function reportJobFailure(job: string, summary: string): void {
  sentry?.captureMessage(`job ${job} reported failure`, { level: 'error', tags: { job }, extra: { summary }, fingerprint: ['job-failed', job] });
}

export async function flushJobReporting(): Promise<void> {
  await sentry?.flush(4000).catch(() => false);
}
