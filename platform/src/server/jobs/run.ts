import 'dotenv/config';
import { closeDb, db } from '@/server/db/client';
import { graduateMonitoredAccounts } from '@/server/domains/identity/service';
import { expireDueDemoContent } from '@/server/domains/platform/demo';
import { purgeExpiredSessions } from '@/server/auth/session';
import { purgeExpiredRateLimits } from '@/server/security/rate-limit';
import { verifyAuditChain } from '@/server/domains/audit/service';
import { deliverScheduledWords } from '@/server/domains/sanctuary/service';
import { sendDailyDigests } from '@/server/domains/notifications/digest';
import { sendAdoptionFollowUps } from '@/server/domains/animals/service';
import { expireLostFound } from '@/server/domains/animals/lost-found';
import { purgeSafeSpace } from '@/server/domains/safe-space/service';
import { expireWorkPosts } from '@/server/domains/work/service';

/**
 * Entry point for Yavaya's scheduled work.
 *
 * The job functions themselves live with the domains that own them. This
 * module exists because they had no caller: every one of them was exported and
 * invoked from nowhere, so the maintenance the deployment guide instructs an
 * operator to schedule could not actually be scheduled.
 *
 * One process per invocation, driven by the host's scheduler. There is no
 * in-process timer anywhere in Yavaya, deliberately — the application must
 * survive being started, stopped and replicated by a platform that owes it no
 * warning, which also makes it safe on shared hosting where idle processes are
 * stopped.
 *
 * Every job is idempotent and safe to re-run, so a missed tick costs nothing
 * and an overlapping one is harmless.
 */

type JobOutcome = {
  /** Written to stdout for the scheduler's log. */
  summary: string;
  /**
   * Non-zero exit. Reserved for a job that has found something an operator
   * must look at — not for "there was nothing to do".
   */
  failed?: boolean;
};

const JOBS: Record<string, () => Promise<JobOutcome>> = {
  /** Ends the 72-hour enhanced monitoring window for accounts in good standing. */
  'graduate-monitored': async () => {
    const graduated = await graduateMonitoredAccounts(db());
    return { summary: `graduated ${graduated} account(s) out of monitoring` };
  },

  /**
   * Retires demo content once it reaches its configured lifetime. Demo content
   * that outlives its window would start looking like real activity, which is
   * the one thing it may never do.
   */
  'expire-demo': async () => {
    const expired = await expireDueDemoContent(db());
    return { summary: `expired ${expired.length} demo item(s)` };
  },

  /** Drops sessions that can no longer authenticate anyone. */
  'purge-sessions': async () => {
    const removed = await purgeExpiredSessions(db());
    return { summary: `purged ${removed} expired session(s)` };
  },

  /** Drops rate-limit counters whose window has closed. */
  'purge-rate-limits': async () => {
    await purgeExpiredRateLimits(db());
    return { summary: 'purged expired rate-limit counters' };
  },

  /**
   * Recomputes the audit hash chain and reports the first inconsistency.
   *
   * This is the only job that can fail meaningfully, and it exits non-zero when
   * it does so the scheduler's failure mail is the alert. A hash chain nobody
   * checks proves nothing — and a check whose result goes nowhere is a chain
   * nobody checks.
   */
  'verify-audit-chain': async () => {
    const result = await verifyAuditChain(db());
    if (result.valid) {
      return { summary: `audit chain intact across ${result.checked} event(s)` };
    }
    return {
      summary:
        `AUDIT CHAIN BROKEN after ${result.checked} event(s): ` +
        `${result.reason} at event ${result.brokenAtId}`,
      failed: true,
    };
  },

  /** Words prepared ahead reach followers on their morning. */
  'deliver-words': async () => {
    const result = await deliverScheduledWords(db());
    return { summary: `announced ${result.delivered} word(s) to ${result.notified} follower(s); ${result.skipped} past their day` };
  },

  /** A month after an adoption, adopter and rescuer are asked how it is going. */
  'adoption-follow-ups': async () => {
    const result = await sendAdoptionFollowUps(db());
    return { summary: `asked about ${result.sent} adoption(s)` };
  },

  /** Lost-and-found posts close after their time, and their authors are told. */
  'expire-lost-found': async () => {
    const result = await expireLostFound(db());
    return { summary: `closed ${result.closed} lost-and-found post(s)` };
  },

  /** Job and project posts close after their time; employer and candidates are told. */
  'expire-work-posts': async () => {
    const result = await expireWorkPosts(db());
    return { summary: `closed ${result.closed} work post(s)` };
  },

  /** Espacio Violeta forgets: old messages, old conversations, decided reports. */
  'purge-safe-space': async () => {
    const result = await purgeSafeSpace(db());
    return { summary: `deleted ${result.room} room and ${result.thread} private message(s), ${result.threads} empty conversation(s), ${result.reports} decided report(s)` };
  },

  /** The daily email summary, for members whose morning it is. */
  'send-digests': async () => {
    const result = await sendDailyDigests(db());
    if (result.skipped) return { summary: `no summaries: ${result.skipped}` };
    return { summary: `sent ${result.sent} summary email(s), ${result.failed} failed`, failed: result.failed > 0 && result.sent === 0 };
  },

  /**
   * Everything above on one schedule, for hosts that give a deployment a
   * single cron (Railway does). Meant for every 15 minutes. Each job runs
   * even if an earlier one failed; the tick fails if any did. The audit chain
   * is checked once a day, in the first tick after 09:00 UTC.
   */
  tick: async () => {
    const now = new Date();
    const names = ['graduate-monitored', 'expire-demo', 'purge-rate-limits', 'purge-sessions', 'deliver-words', 'adoption-follow-ups', 'expire-lost-found', 'expire-work-posts', 'purge-safe-space', 'send-digests'];
    if (now.getUTCHours() === 9 && now.getUTCMinutes() < 15) names.push('verify-audit-chain');
    const lines: string[] = [];
    let failed = false;
    for (const name of names) {
      try {
        const outcome = await JOBS[name]!();
        failed ||= Boolean(outcome.failed);
        lines.push(`${name}: ${outcome.summary}`);
      } catch (error) {
        failed = true;
        lines.push(`${name}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { summary: `\n  ${lines.join('\n  ')}`, failed };
  },
};

export const JOB_NAMES = Object.keys(JOBS) as ReadonlyArray<keyof typeof JOBS & string>;

async function main(): Promise<void> {
  const name = process.argv[2];

  if (!name || !(name in JOBS)) {
    // eslint-disable-next-line no-console
    console.error(
      name
        ? `unknown job: ${name}\n\navailable jobs:\n${JOB_NAMES.map((j) => `  ${j}`).join('\n')}`
        : `usage: node jobs.cjs <job>\n\navailable jobs:\n${JOB_NAMES.map((j) => `  ${j}`).join('\n')}`,
    );
    process.exitCode = 2;
    return;
  }

  const startedAt = Date.now();
  const outcome = await JOBS[name]!();
  const elapsed = Date.now() - startedAt;

  const line = `[${new Date().toISOString()}] ${name}: ${outcome.summary} (${elapsed}ms)`;
  if (outcome.failed) {
    // eslint-disable-next-line no-console
    console.error(line);
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[${new Date().toISOString()}] job failed:`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Without this the pool keeps the process alive and the scheduler's slot
    // never frees.
    await closeDb();
  });
