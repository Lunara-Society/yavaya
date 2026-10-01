import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ownedChurches } from '@/server/domains/sanctuary/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('sanctuary.manage.title'), robots: { index: false } };
}

export default async function MyChurchesPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const churches = await ownedChurches(db(), { userId, locale });

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/sanctuary">← {t('sanctuary.church.back')}</Link>
          </p>
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>{t('sanctuary.manage.title')}</h1>
            <Link className="btn btn-gold" href="/sanctuary/register">
              {t('sanctuary.register.cta')}
            </Link>
          </div>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {churches.length === 0 ? (
          <p className="sc-empty">{t('sanctuary.manage.empty')}</p>
        ) : (
          <div className="sc-churches">
            {churches.map((church) => (
              <Link key={church.id} className="sc-church" href={`/sanctuary/manage/${church.id}`}>
                <span className="sc-church-seal" aria-hidden="true">
                  ✝
                </span>
                <span className="sc-church-text">
                  <strong>{church.name}</strong>
                  <span className="muted">{church.placeName}</span>
                </span>
                <span className={`sc-status sc-status-${church.status}`}>{t(`sanctuary.status.${church.status}` as MessageKey)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
