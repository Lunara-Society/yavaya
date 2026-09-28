import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { reputationRules } from '@/server/db/schema';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { communityQueue, COMMUNITY_DECISIONS } from '@/server/domains/community/service';
import { resolveCommunityTicketAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

export default async function CommunityModerationPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'moderation.queue.read'))) notFound();
  const session = await currentSession();
  const queue = await communityQueue(db(), session ? { userId, status: session.user.status } : null);
  const [warning] = await db()
    .select({ delta: reputationRules.delta })
    .from(reputationRules)
    .where(eq(reputationRules.key, 'warning_issued'));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('community.mod.title')}</h1>
          <p className="lead mb0">{t('community.mod.lead')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {queue.length === 0 ? (
          <p className="mk-empty">{t('community.mod.empty')}</p>
        ) : (
          <div className="mk-queue">
            {queue.map((item) => (
              <article key={item.ticketId} className="card">
                <p className="muted mb0">
                  {item.ticketCode} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} · {formatDate(item.createdAt, locale)} ·{' '}
                  {t(`community.kind.${item.post.kind}` as MessageKey)}
                </p>
                <h2 style={{ fontSize: '1.15rem', margin: '4px 0' }}>
                  <Link href={`/community/${item.post.id}`}>{item.post.title}</Link>
                </h2>
                <p className="cm-body cm-clamp">{item.post.body}</p>
                <p className="mb0">{t('mercadito.mod.seller', { name: item.author.displayName, yayId: item.author.yayId })}</p>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {item.reports.map((report, index) => (
                    <li key={index}>
                      <strong>{t(`community.report.category.${report.category}` as MessageKey)}</strong>
                      {report.description ? ` — ${report.description}` : ''}
                      {report.replyBody ? (
                        <>
                          <br />
                          <em>
                            {t('community.mod.reported_reply')} “{report.replyBody}”
                          </em>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <form action={resolveCommunityTicketAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                  <input type="hidden" name="ticketId" value={item.ticketId} />
                  <label>
                    {t('mercadito.mod.note')}
                    <textarea name="note" maxLength={2000} style={{ minHeight: 70 }} />
                  </label>
                  <div className="btn-row">
                    {COMMUNITY_DECISIONS.map((decision) => (
                      <button
                        key={decision}
                        className={decision === 'dismiss' ? 'btn btn-line' : 'btn btn-gold'}
                        type="submit"
                        name="decision"
                        value={decision}
                      >
                        {t(`community.mod.decision.${decision}` as MessageKey, { delta: String(warning?.delta ?? '') })}
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
