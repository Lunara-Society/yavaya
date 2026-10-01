import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { AnimalCard } from '@/ui/animals/parts';
import { getCertificate, myApplications } from '@/server/domains/animals/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('animals.mine.title'), robots: { index: false } };
}

export default async function MyApplicationsPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [applications, certificate] = await Promise.all([myApplications(db(), { userId, locale }), getCertificate(db(), userId)]);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals">← {t('animals.back')}</Link>
        </p>
        <h1 className="h-md">{t('animals.mine.title')}</h1>
        <p>{certificate ? `✓ ${t('animals.mine.certified')}` : <Link href="/animals/learn">{t('animals.mine.get_certificate')}</Link>}</p>
        {applications.length === 0 ? (
          <p className="muted">{t('animals.mine.none')}</p>
        ) : (
          <div className="an-grid">
            {applications.map((app) => (
              <AnimalCard key={app.applicationId} animal={app} t={t} footer={t(`animals.application.status.${app.applicationStatus}` as MessageKey)} />
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
