import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PageScene } from '@/ui/site/art';
import { PostCard } from '@/ui/community/post-card';
import { listPosts } from '@/server/domains/community/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('sanctuary.prayer.title'), description: t('sanctuary.prayer.lead'), robots: { index: false } };
}

/**
 * The prayer wall. Prayer requests are Community posts of kind `prayer`
 * (same moderation, same discretion: a name can be hidden), shown here beside
 * the churches. Members only, like the square: a request is often someone's
 * hardest week, and it is not for search engines.
 */
export default async function PrayerWallPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const feed = userId ? await listPosts(db(), { viewerId: userId, kind: 'prayer', page, locale }) : null;
  const href = (to: number) => (to > 1 ? `/sanctuary/prayer?page=${to}` : '/sanctuary/prayer');

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="cm-head">
        <div className="cm-head-art" aria-hidden="true">
          <PageScene name="sanctuary-word" />
        </div>
        <div className="wrap cm-column">
          <p>
            <Link href="/sanctuary">← {t('sanctuary.church.back')}</Link>
          </p>
          <p className="eyebrow">{c.districts.sanctuary.name}</p>
          <h1>{t('sanctuary.prayer.title')}</h1>
          <p className="lead">{t('sanctuary.prayer.lead')}</p>
          {member ? (
            <div className="btn-row">
              <Link className="btn btn-gold" href="/community/new?kind=prayer">
                {t('sanctuary.prayer.new')}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {!feed ? (
          <div className="cm-gate card">
            <p>{t('sanctuary.prayer.members_only')}</p>
            <div className="btn-row">
              <Link className="btn btn-gold" href="/login">
                {t('community.square.sign_in')}
              </Link>
              <Link className="btn btn-line" href="/register">
                {t('auth.submit_register')}
              </Link>
            </div>
          </div>
        ) : feed.items.length === 0 ? (
          <div className="mk-empty">
            <p>{t('sanctuary.prayer.empty')}</p>
            <Link className="btn btn-gold" href="/community/new?kind=prayer">
              {t('sanctuary.prayer.new')}
            </Link>
          </div>
        ) : (
          <>
            <div className="cm-feed">
              {feed.items.map((post) => (
                <PostCard key={post.id} post={post} t={t} locale={locale} />
              ))}
            </div>
            {feed.page > 1 || feed.hasMore ? (
              <nav className="mk-pager">
                {feed.page > 1 ? (
                  <Link className="btn btn-line" href={href(feed.page - 1)}>
                    {t('mercadito.browse.previous')}
                  </Link>
                ) : null}
                {feed.hasMore ? (
                  <Link className="btn btn-line" href={href(feed.page + 1)}>
                    {t('mercadito.browse.next')}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
        <p className="muted center mt">{t('sanctuary.prayer.discreet')}</p>
      </div>
    </SiteShell>
  );
}
