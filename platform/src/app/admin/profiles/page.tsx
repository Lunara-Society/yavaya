import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { PROFILE_DECISIONS, profileQueue } from '@/server/domains/identity/profile-reports';
import { resolveProfileTicketAction } from './actions';
import { signInPath } from '@/server/auth/sign-in-path';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

/** Reported profiles: what a member shows, judged by a moderator. */
export default async function ProfileModerationPage({ searchParams }: Props) {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'moderation.queue.read'))) notFound();
  const session = await currentSession();
  const queue = await profileQueue(db(), session ? { userId, status: session.user.status } : null);
  const query = await searchParams;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('profiles.mod.title')}</h1>
          <p className="lead mb0">{t('profiles.mod.lead')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        {queue.length === 0 ? (
          <p className="mk-empty">{t('profiles.mod.empty')}</p>
        ) : (
          <div className="mk-queue">
            {queue.map((item) => (
              <article key={item.ticketId} className="card">
                <p className="muted mb0">
                  {item.ticketCode} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {formatDate(item.createdAt, locale)}
                </p>
                <h2 style={{ fontSize: '1.15rem', margin: '4px 0' }}>
                  <Link href={`/members/${item.member.yayId}`}>
                    {item.member.displayName} · {item.member.yayId}
                  </Link>
                </h2>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`profile.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                    </li>
                  ))}
                </ul>
                <form action={resolveProfileTicketAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('profiles.mod.note')}
                    <span className="hint">{t('profiles.mod.note_hint')}</span>
                    <textarea name="note" maxLength={2000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    {PROFILE_DECISIONS.map((decision) => (
                      <button key={decision} className={decision === 'dismiss' ? 'btn btn-line' : 'btn btn-gold'} type="submit" name="decision" value={decision}>
                        {t(`profiles.mod.decision.${decision}` as MessageKey)}
                      </button>
                    ))}
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
