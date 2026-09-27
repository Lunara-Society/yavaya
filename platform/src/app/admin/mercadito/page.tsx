import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { reputationRules } from '@/server/db/schema';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { listingQueue, MODERATION_DECISIONS } from '@/server/domains/mercadito/moderation';
import { resolveTicketAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const PENALTY_RULE = { warn: 'warning_issued', fraud: 'confirmed_fraudulent_listing' } as const;

export default async function MercaditoModerationPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  // Someone without the permission learns nothing about the page existing.
  if (!(await hasPermission(db(), userId, 'listings.moderate'))) notFound();

  const session = await currentSession();
  const queue = await listingQueue(db(), session ? { userId, status: session.user.status } : null);

  const rules = await db()
    .select({ key: reputationRules.key, delta: reputationRules.delta })
    .from(reputationRules)
    .where(inArray(reputationRules.key, Object.values(PENALTY_RULE)));
  const delta = (key: string) => String(rules.find((rule) => rule.key === key)?.delta ?? '');

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('mercadito.mod.title')}</h1>
          <p className="lead mb0">{t('mercadito.mod.lead')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {queue.length === 0 ? (
          <p className="mk-empty">{t('mercadito.mod.empty')}</p>
        ) : (
          <div className="mk-queue">
            {queue.map((item) => (
              <article key={item.ticketId} className="card mk-case">
                {item.listing.coverMediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- sized by the media pipeline
                  <img src={`/media/${item.listing.coverMediaId}`} alt="" />
                ) : (
                  <span />
                )}
                <div>
                  <p className="muted mb0">
                    {item.ticketCode} · {t(`mercadito.mod.priority.${item.priority}` as MessageKey)} ·{' '}
                    {formatDate(item.createdAt, locale)}
                  </p>
                  <h2 style={{ fontSize: '1.15rem', margin: '4px 0' }}>
                    <Link href={`/mercadito/${item.listing.id}`}>{item.listing.title}</Link>
                  </h2>
                  <p className="mb0">
                    {t('mercadito.mod.seller', { name: item.seller.displayName, yayId: item.seller.yayId })} ·{' '}
                    {t(`mercadito.status.${item.listing.status}` as MessageKey)}
                  </p>
                  {item.listing.flags.length > 0 ? (
                    <p className="mb0">
                      <strong>{t('mercadito.mod.flags')}:</strong>{' '}
                      {item.listing.flags.map((flag) => t(`mercadito.mod.flag.${flag}` as MessageKey)).join(' · ')}
                    </p>
                  ) : null}
                  <p className="mb0">{t('mercadito.mod.reports', { count: item.reportCount })}</p>
                  {item.reports.length > 0 ? (
                    <ul style={{ margin: '6px 0 0 18px' }}>
                      {item.reports.map((report, index) => (
                        <li key={index}>
                          <strong>{t(`mercadito.report.category.${report.category}` as MessageKey)}</strong>
                          {report.description ? ` — ${report.description}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <form action={resolveTicketAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
                    <input type="hidden" name="ticketId" value={item.ticketId} />
                    <label>
                      {t('mercadito.mod.note')}
                      <textarea name="note" maxLength={2000} style={{ minHeight: 70 }} />
                    </label>
                    <div className="btn-row">
                      {MODERATION_DECISIONS.map((decision) => (
                        <button
                          key={decision}
                          className={decision === 'dismiss' ? 'btn btn-line' : 'btn btn-gold'}
                          type="submit"
                          name="decision"
                          value={decision}
                        >
                          {t(`mercadito.mod.decision.${decision}` as MessageKey, {
                            delta: decision === 'warn' || decision === 'fraud' ? delta(PENALTY_RULE[decision]) : '',
                          })}
                        </button>
                      ))}
                    </div>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
