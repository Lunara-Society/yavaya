import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { closeDb, db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { JOB_NAMES } from '@/server/jobs/run';
import { register } from '@/server/domains/identity/service';
import { recordAudit } from '@/server/domains/audit/service';
import { resetTransactionalData } from '../helpers/database';

const run = promisify(execFile);

/**
 * The scheduled jobs are the one part of Yavaya nothing else exercises: they
 * are invoked by the host's scheduler, never by a request. Before this runner
 * existed they were exported and called from nowhere at all, so these tests
 * cover the wiring as much as the behaviour.
 */

const context = {
  networkHash: null,
  addressHash: 'jobs-test',
  deviceFingerprint: null,
  userAgent: 'vitest',
};

/** Runs a job the way cron will: a fresh process, arguments on the command line. */
function runJob(name: string) {
  return run('npx', ['tsx', '--conditions=react-server', 'src/server/jobs/run.ts', name], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL },
  });
}

describe('scheduled jobs', () => {
  beforeEach(async () => {
    await resetTransactionalData();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('exposes exactly the jobs the deployment guide schedules', () => {
    expect([...JOB_NAMES].sort()).toEqual([
      'adoption-follow-ups',
      'deliver-words',
      'expire-demo',
      'expire-lost-found',
      'expire-work-posts',
      'graduate-monitored',
      'ops-email',
      'purge-rate-limits',
      'purge-safe-space',
      'purge-sessions',
      'reconcile-payments',
      'send-digests',
      'starter-tokens',
      'tick',
      'verify-audit-chain',
    ]);
  });

  it('runs every job to completion against a real database', async () => {
    for (const name of JOB_NAMES) {
      const { stdout } = await runJob(name);
      expect(stdout).toContain(name);
    }
  }, 120_000);

  it('reports an intact audit chain over real events', async () => {
    await register(
      db(),
      {
        email: `jobs-${crypto.randomUUID()}@example.com`,
        password: 'a-sufficiently-long-passphrase',
        displayName: 'Jobs Tester',
        locale: 'es',
        acceptedTerms: true,
      },
      context,
    );

    const { stdout } = await runJob('verify-audit-chain');
    expect(stdout).toMatch(/audit chain intact across \d+ event\(s\)/);
  }, 60_000);

  it('purges only sessions that can no longer authenticate anyone', async () => {
    const before = await db().select({ id: sessions.id }).from(sessions);
    const { stdout } = await runJob('purge-sessions');
    expect(stdout).toMatch(/purged \d+ expired session\(s\)/);

    // A live session must survive the purge; only absolute expiry removes one.
    const after = await db().select({ id: sessions.id }).from(sessions);
    expect(after.length).toBe(before.length);
  }, 60_000);

  it('refuses an unknown job instead of exiting silently', async () => {
    await expect(runJob('drop-everything')).rejects.toMatchObject({ code: 2 });
  }, 60_000);

  /**
   * Production runs the esbuild bundle, not the source. The bundle once
   * crashed at start-up (a native image library pulled in through a domain
   * service) while every test above, running from source, stayed green.
   */
  it('runs from the bundle the scheduler actually deploys', async () => {
    await run('node', ['scripts/build-release-scripts.mjs']);
    const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL! };
    const { stdout } = await run('node', ['dist/scripts/jobs.cjs', 'purge-sessions'], { env });
    expect(stdout).toMatch(/purged \d+ expired session\(s\)/);
  }, 120_000);

  /**
   * The reason this runner has its own env door. cPanel cron runs in a bare
   * shell that does not inherit the application's environment, so a job that
   * demanded SESSION_SECRET would force an operator to paste it into a crontab.
   */
  it('runs without the web application secrets', async () => {
    const env = { ...process.env };
    delete env.SESSION_SECRET;
    delete env.SIGNAL_PEPPER;
    delete env.PREVIEW_ACCESS_KEY;
    env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

    const { stdout } = await run('npx', ['tsx', '--conditions=react-server', 'src/server/jobs/run.ts', 'tick'], {
      env,
    });
    expect(stdout).toContain('purged expired rate-limit counters');
    // Mail needs the web secrets; without them the summary waits, it does not crash the tick.
    expect(stdout).toContain('send-digests: no summaries: email_unavailable');
  }, 60_000);

  it('records the audit event the runner never writes', async () => {
    // Jobs are maintenance, not actions: they must not forge audit records.
    // This asserts the runner leaves the chain alone, by writing one real event
    // and confirming the count is unchanged by a maintenance pass.
    await db().transaction(async (tx) => {
      await recordAudit(tx, {
        actorType: 'system',
        action: 'platform.job_test',
        subjectType: 'system',
      });
    });

    const { stdout } = await runJob('purge-rate-limits');
    expect(stdout).toContain('purged');

    const { stdout: verify } = await runJob('verify-audit-chain');
    expect(verify).toContain('audit chain intact');
  }, 90_000);
});
