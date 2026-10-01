import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PostCard } from '@/ui/work/parts';
import { myApplications, myPosts } from '@/server/domains/work/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('work.board.mine'), robots: { index: false } };
}

export default async function WorkMinePage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [posts, applications] = await Promise.all([myPosts(db(), { userId, locale }), myApplications(db(), { userId, locale })]);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/work">← {t('work.back')}</Link>
        </p>
        <h1 className="h-md">{t('work.board.mine')}</h1>
        <section className="sc-section">
          <h2 className="sc-h">{t('work.mine.applications')}</h2>
          {applications.length === 0 ? (
            <p className="muted">{t('work.mine.no_applications')}</p>
          ) : (
            <div className="sv-list">
              {applications.map((app) => (
                <PostCard key={app.applicationId} post={app} t={t} locale={locale} footer={t(`work.application.status.${app.applicationStatus}` as MessageKey)} />
              ))}
            </div>
          )}
        </section>
        <section className="sc-section">
          <h2 className="sc-h">{t('work.mine.posts')}</h2>
          {posts.length === 0 ? (
            <p className="muted">
              {t('work.mine.no_posts')} <Link href="/work/posts/new">{t('work.board.post')}</Link>
            </p>
          ) : (
            <div className="sv-list">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} t={t} locale={locale} />
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
