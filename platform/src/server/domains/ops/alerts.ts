import 'server-only';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { jobRuns, userRoles, users } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { OPS_RULES } from '@/config/business-rules';
import { createTranslator, type MessageKey } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { canDeliverEmail, sendEmail } from '@/server/domains/notifications/email/service';
import type { EmailMessage } from '@/server/domains/notifications/email/provider';
import { isAdmin } from '@/server/domains/access/authorize';
import { queuesFor, type QueueStatus } from './queues';

/** Records one job's outcome. Never throws: a broken log must not fail the job it logs. */
export async function recordJobRun(executor: Executor, job: string, ok: boolean, summary: string, startedAt = new Date()): Promise<void> {
  try {
    await executor.insert(jobRuns).values({ job, ok, summary: summary.slice(0, 2000), startedAt });
  } catch (error) {
    console.error('job run not recorded:', job, error instanceof Error ? error.message : error);
  }
}

export async function purgeJobRuns(executor: Executor, now = new Date()): Promise<number> {
  const rows = await executor.delete(jobRuns).where(lt(jobRuns.startedAt, new Date(now.getTime() - 14 * 86_400_000))).returning({ id: jobRuns.id });
  return rows.length;
}

/** Each job's latest run, and every failure in the last day. */
export async function jobHealth(executor: Executor, now = new Date()) {
  const latest = (await executor.execute(sql`
    select distinct on (job) job, started_at, ok, summary from job_runs order by job, started_at desc`)) as unknown as Array<{ job: string; started_at: string; ok: boolean; summary: string }>;
  const failures = await executor
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.ok, false), gte(jobRuns.startedAt, new Date(now.getTime() - 86_400_000))))
    .orderBy(desc(jobRuns.startedAt))
    .limit(20);
  return { latest: latest.map((r) => ({ job: r.job, startedAt: new Date(r.started_at), ok: r.ok, summary: r.summary })), failures };
}

export type OpsDelivery = { available: () => boolean; send: (message: EmailMessage) => Promise<unknown> };
const realDelivery: OpsDelivery = {
  available: () => {
    try {
      return canDeliverEmail() && serverEnv().EMAIL_PROVIDER !== 'console';
    } catch {
      return false;
    }
  },
  send: sendEmail,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The daily operations email: to each member of the team, what is waiting
 * for them and what is late; to admins, also any scheduled job that failed.
 * Sent once a day, in the first tick of OPS_RULES.emailHourUtc, and only to
 * someone with something to act on — an email that always arrives is an
 * email nobody reads.
 */
export async function sendOpsEmails(database: Database, now = new Date(), delivery: OpsDelivery = realDelivery): Promise<{ sent: number; skipped?: string }> {
  if (now.getUTCHours() !== OPS_RULES.emailHourUtc) return { sent: 0, skipped: 'not_the_hour' };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [already] = await database.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.job, 'ops-email'), eq(jobRuns.ok, true), gte(jobRuns.startedAt, today))).limit(1);
  if (already) return { sent: 0, skipped: 'already_sent_today' };
  if (!delivery.available()) return { sent: 0, skipped: 'email_unavailable' };

  const staff = await database
    .selectDistinct({ id: users.id, email: users.email, locale: users.locale, displayName: users.displayName })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(isNull(userRoles.revokedAt), inArray(userRoles.roleKey, ['admin', 'moderator', 'district_reviewer', 'safe_space_guardian']), eq(users.status, 'active')));
  const health = await jobHealth(database, now);
  const base = (() => {
    try {
      return serverEnv().APP_URL.replace(/\/$/, '');
    } catch {
      return 'https://yavaya.lat';
    }
  })();

  let sent = 0;
  for (const person of staff) {
    const queues = (await queuesFor(database, person.id)).filter((q) => q.count > 0);
    const admin = await isAdmin(database, person.id);
    const failures = admin ? health.failures : [];
    if (queues.length === 0 && failures.length === 0) continue;
    const t = createTranslator((person.locale === 'en' ? 'en' : 'es') as Locale);
    const hours = (q: QueueStatus) => (q.oldestAt ? Math.floor((now.getTime() - q.oldestAt.getTime()) / 3_600_000) : 0);
    const late = queues.filter((q) => hours(q) >= OPS_RULES.reviewLateHours);
    const lines = queues.map((q) => `${t(`ops.queue.${q.key}` as MessageKey)}: ${q.count}${hours(q) >= OPS_RULES.reviewLateHours ? ` — ${t('ops.email.late', { count: Math.floor(hours(q) / 24) })}` : ''}`);
    const failLines = failures.map((f) => `${f.job}: ${f.summary.slice(0, 160)}`);
    const subject = late.length > 0 ? t('ops.email.subject_late', { count: late.length }) : failures.length > 0 && queues.length === 0 ? t('ops.email.subject_jobs') : t('ops.email.subject', { count: queues.reduce((n, q) => n + q.count, 0) });
    const text = [t('ops.email.intro'), '', ...lines, ...(failLines.length ? ['', t('ops.email.jobs_failed'), ...failLines] : []), '', `${t('ops.email.open')}: ${base}/admin`].join('\n');
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f6f1;font-family:Arial,Helvetica,sans-serif;color:#081120">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">
<p style="font-size:20px;font-weight:bold;letter-spacing:2px;margin:0 0 18px">YAVAYA · ${escapeHtml(t('ops.title'))}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${escapeHtml(t('ops.email.intro'))}</p>
<ul style="font-size:16px;line-height:1.6;padding-left:20px;margin:0 0 16px">${queues.map((q, i) => `<li style="margin-bottom:6px;${hours(q) >= OPS_RULES.reviewLateHours ? 'color:#b42318;font-weight:bold' : ''}">${escapeHtml(lines[i]!)}</li>`).join('')}</ul>
${failLines.length ? `<p style="font-size:16px;font-weight:bold;color:#b42318;margin:16px 0 6px">${escapeHtml(t('ops.email.jobs_failed'))}</p><ul style="font-size:14px;line-height:1.5;padding-left:20px;margin:0 0 16px">${failLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
<p style="margin:22px 0"><a href="${escapeHtml(base)}/admin" style="display:inline-block;background:#9a7a12;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:12px 20px;border-radius:10px">${escapeHtml(t('ops.email.open'))}</a></p>
<p style="font-size:13px;color:#4a5568;margin:0">${escapeHtml(t('ops.email.why'))}</p>
</div></body></html>`;
    try {
      await delivery.send({ to: person.email, subject, text, html });
      sent += 1;
    } catch (error) {
      console.error('ops email not delivered:', person.id, error instanceof Error ? error.message : error);
    }
  }
  return { sent };
}
