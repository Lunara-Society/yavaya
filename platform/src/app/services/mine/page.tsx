import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { RequestCard } from '@/ui/services/parts';
import { myRequests, myResponses } from '@/server/domains/services/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('services.board.mine'), robots: { index: false } };
}

export default async function MinePage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [requests, responses] = await Promise.all([myRequests(db(), { userId, locale }), myResponses(db(), { userId, locale })]);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/services">← {t('services.back')}</Link>
        </p>
        <h1 className="h-md">{t('services.board.mine')}</h1>
        <section className="sc-section">
          <h2 className="sc-h">{t('services.mine.requests')}</h2>
          {requests.length === 0 ? (
            <p className="muted">
              {t('services.mine.no_requests')} <Link href="/services/new">{t('services.board.ask')}</Link>
            </p>
          ) : (
            <div className="sv-list">
              {requests.map((request) => (
                <RequestCard key={request.id} request={request} t={t} locale={locale} />
              ))}
            </div>
          )}
        </section>
        <section className="sc-section">
          <h2 className="sc-h">{t('services.mine.responses')}</h2>
          {responses.length === 0 ? (
            <p className="muted">{t('services.mine.no_responses')}</p>
          ) : (
            <div className="sv-list">
              {responses.map((request) => (
                <div key={request.id}>
                  <p className="sv-kicker">{t(`services.response.status.${request.responseStatus}` as MessageKey)}</p>
                  <RequestCard request={request} t={t} locale={locale} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
