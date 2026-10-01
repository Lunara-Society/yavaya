import 'server-only';
import { createHmac } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { notificationPreferences, notifications } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { NOTIFICATION_RULES as R } from '@/config/business-rules';
import { createTranslator, type MessageKey } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { safeEqual } from '@/server/security/crypto';
import { canDeliverEmail, sendEmail } from './email/service';
import type { EmailMessage } from './email/provider';

/**
 * The daily email summary.
 *
 * A member who does not come back to the site still hears that someone
 * answered them — once a day at most, in their own morning, and only about
 * things they have not already read. Every message carries a one-click way
 * out that needs no password.
 *
 * Preference: category `digest`, channel `email`, on unless switched off.
 */

export const DIGEST_CATEGORY = 'digest';

/** Signs "this member may switch the summary off" without a session. */
export function unsubscribeSignature(userId: string): string {
  return createHmac('sha256', serverEnv().SESSION_SECRET).update(`digest-unsubscribe:${userId}`, 'utf8').digest('hex').slice(0, 32);
}

export function verifyUnsubscribe(userId: string, signature: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(userId) && /^[0-9a-f]{32}$/.test(signature) && safeEqual(unsubscribeSignature(userId), signature);
}

export async function setDigestEnabled(executor: Executor, userId: string, enabled: boolean): Promise<void> {
  await executor
    .insert(notificationPreferences)
    .values({ userId, category: DIGEST_CATEGORY, channel: 'email', enabled })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.category, notificationPreferences.channel],
      set: { enabled, updatedAt: new Date() },
    });
}

type Recipient = { userId: string; email: string; locale: string };

/**
 * Members due a summary now: verified email, active, not switched off,
 * something unread old enough and fresh enough, none mailed recently, and
 * inside their morning window.
 */
async function dueRecipients(database: Database, now: Date): Promise<Recipient[]> {
  const oldest = new Date(now.getTime() - R.digestLookbackHours * 3_600_000);
  const youngest = new Date(now.getTime() - R.digestMinAgeMinutes * 60_000);
  const lastAllowed = new Date(now.getTime() - R.digestMinIntervalHours * 3_600_000);
  const rows = await database.execute<{ user_id: string; email: string; locale: string }>(sql`
    with member_zone as (
      select p.user_id, (
        select l2.timezone from locations l2
        where l2.code = any(l.path || array[l.code]) and l2.timezone is not null
        order by l2.depth desc limit 1
      ) as tz
      from user_profiles p join locations l on l.id = p.location_id
    )
    select u.id as user_id, u.email, u.locale
    from users u
    left join member_zone z on z.user_id = u.id
    where u.status = 'active'
      and u.email_verified_at is not null
      and not exists (
        select 1 from notification_preferences np
        where np.user_id = u.id and np.category = ${DIGEST_CATEGORY} and np.channel = 'email' and np.enabled = false
      )
      and exists (
        select 1 from notifications n
        where n.user_id = u.id and n.read_at is null and n.emailed_at is null
          and n.created_at >= ${oldest.toISOString()}::timestamptz and n.created_at <= ${youngest.toISOString()}::timestamptz
      )
      and not exists (
        select 1 from notifications n
        where n.user_id = u.id and n.emailed_at > ${lastAllowed.toISOString()}::timestamptz
      )
      and case
        when z.tz is not null then
          extract(hour from (${now.toISOString()}::timestamptz at time zone z.tz)) >= ${R.digestLocalHourStart}
          and extract(hour from (${now.toISOString()}::timestamptz at time zone z.tz)) < ${R.digestLocalHourEnd}
        else
          extract(hour from (${now.toISOString()}::timestamptz at time zone 'UTC')) >= ${R.digestFallbackUtcHourStart}
          and extract(hour from (${now.toISOString()}::timestamptz at time zone 'UTC')) < ${R.digestFallbackUtcHourEnd}
      end
    order by u.id
    limit ${R.digestBatchSize}
  `);
  return rows.map((row) => ({ userId: row.user_id, email: row.email, locale: row.locale }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Scheduler job. Returns how many summaries went out and how many failed. */
export type DigestDelivery = {
  /** True only when a message would really leave: the console logger is not delivery. */
  available: () => boolean;
  send: (message: EmailMessage) => Promise<unknown>;
};

const realDelivery: DigestDelivery = {
  available: () => {
    try {
      return canDeliverEmail() && serverEnv().EMAIL_PROVIDER !== 'console';
    } catch {
      // The scheduler may run without the web application's secrets (see
      // env.ts); without them there is no mail and no signed link to offer.
      return false;
    }
  },
  send: sendEmail,
};

export async function sendDailyDigests(
  database: Database,
  now = new Date(),
  delivery: DigestDelivery = realDelivery,
): Promise<{ sent: number; failed: number; skipped?: 'email_unavailable' }> {
  // With no real provider there is nothing to send and nothing may be marked
  // as sent: the items stay eligible for when mail works.
  if (!delivery.available()) return { sent: 0, failed: 0, skipped: 'email_unavailable' };

  const base = serverEnv().APP_URL.replace(/\/$/, '');
  const oldest = new Date(now.getTime() - R.digestLookbackHours * 3_600_000);
  const youngest = new Date(now.getTime() - R.digestMinAgeMinutes * 60_000);
  let sent = 0;
  let failed = 0;

  for (const recipient of await dueRecipients(database, now)) {
    const items = await database
      .select({ id: notifications.id, titleKey: notifications.titleKey, params: notifications.params })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, recipient.userId),
          isNull(notifications.readAt),
          isNull(notifications.emailedAt),
          gte(notifications.createdAt, oldest),
          lte(notifications.createdAt, youngest),
        ),
      )
      .orderBy(desc(notifications.createdAt));
    if (items.length === 0) continue;

    const t = createTranslator(recipient.locale as Locale);
    const lines = items.slice(0, R.digestMaxItems).map((item) => t(item.titleKey as MessageKey, item.params));
    const more = items.length - lines.length;
    const open = `${base}/notifications`;
    const signature = unsubscribeSignature(recipient.userId);
    const query = `u=${recipient.userId}&s=${signature}`;
    const unsubscribePage = `${base}/notifications/unsubscribe?${query}`;
    const oneClick = `${base}/notifications/unsubscribe/one-click?${query}`;
    const subject = items.length === 1 ? t('email.digest.subject_one') : t('email.digest.subject', { count: items.length });

    const text = [
      t('email.digest.greeting'),
      '',
      t('email.digest.intro'),
      '',
      ...lines.map((line) => `• ${line}`),
      ...(more > 0 ? [t('email.digest.more', { count: more })] : []),
      '',
      `${t('email.digest.open')}: ${open}`,
      '',
      '—',
      t('email.digest.why'),
      `${t('email.digest.unsubscribe')}: ${unsubscribePage}`,
      `${t('email.digest.settings')}: ${base}/settings#notifications`,
    ].join('\n');

    const html = `<!doctype html><html lang="${escapeHtml(recipient.locale)}"><body style="margin:0;padding:24px;background:#f8f6f1;font-family:Arial,Helvetica,sans-serif;color:#081120">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">
<p style="font-size:20px;font-weight:bold;letter-spacing:2px;margin:0 0 18px">YAVAYA</p>
<p style="font-size:17px;line-height:1.5;margin:0 0 8px">${escapeHtml(t('email.digest.greeting'))}</p>
<p style="font-size:17px;line-height:1.5;margin:0 0 16px">${escapeHtml(t('email.digest.intro'))}</p>
<ul style="font-size:17px;line-height:1.6;padding-left:20px;margin:0 0 16px">${lines.map((line) => `<li style="margin-bottom:6px">${escapeHtml(line)}</li>`).join('')}</ul>
${more > 0 ? `<p style="font-size:16px;color:#4a5568;margin:0 0 16px">${escapeHtml(t('email.digest.more', { count: more }))}</p>` : ''}
<p style="margin:24px 0"><a href="${escapeHtml(open)}" style="display:inline-block;background:#9a7a12;color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;padding:14px 22px;border-radius:10px">${escapeHtml(t('email.digest.open'))}</a></p>
<hr style="border:none;border-top:1px solid #e2ddd0;margin:24px 0">
<p style="font-size:14px;line-height:1.5;color:#4a5568;margin:0 0 8px">${escapeHtml(t('email.digest.why'))}</p>
<p style="font-size:14px;margin:0"><a href="${escapeHtml(unsubscribePage)}" style="color:#4a5568">${escapeHtml(t('email.digest.unsubscribe'))}</a> · <a href="${escapeHtml(`${base}/settings#notifications`)}" style="color:#4a5568">${escapeHtml(t('email.digest.settings'))}</a></p>
</div></body></html>`;

    try {
      await delivery.send({
        to: recipient.email,
        subject,
        text,
        html,
        headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      // Marked only after the provider accepted it: a failed send leaves the
      // items for tomorrow rather than pretending they were mailed.
      await database
        .update(notifications)
        .set({ emailedAt: now })
        .where(inArray(notifications.id, items.map((item) => item.id)));
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error('digest not delivered:', recipient.userId, error instanceof Error ? error.message : error);
    }
  }
  return { sent, failed };
}
