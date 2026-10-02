import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * What the scheduler did, job by job. A job that fails at three in the
 * morning must not fail silently: the operations page and the operations
 * email read this. Kept for two weeks.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    ok: boolean('ok').notNull(),
    summary: text('summary').notNull(),
  },
  (table) => [index('job_runs_job_idx').on(table.job, table.startedAt), index('job_runs_failed_idx').on(table.ok, table.startedAt)],
);
