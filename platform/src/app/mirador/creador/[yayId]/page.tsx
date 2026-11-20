import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { loginHref } from '@/server/auth/return-path';
import { miradorOpen } from '@/server/domains/mirador/access';
import { creatorPage } from '@/server/domains/mirador/feed';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { FollowButton } from '@/ui/mirador/studio-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ yayId: string }> }): Promise<Metadata> {
  const { t, locale, userId } = await siteContext();
  const found = /^\d{8}$/.test((await params).yayId) && (await miradorOpen(db(), userId)) ? await creatorPage(db(), { yayId: (await params).yayId, viewerId: null, locale }) : null;
  return { title: found ? `${found.creator.name} · Mirador` : t('mirador.meta.title') };
}

/** A creator's page: who they are, their real numbers, and their videos. */
export default async function CreatorPage({ params }: { params: Promise<{ yayId: string }> }) {
  const { yayId } = await params;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!(await miradorOpen(db(), userId)) || !/^\d{8}$/.test(yayId)) notFound();
  const page = await creatorPage(db(), { yayId, viewerId: userId, locale });
  if (!page) notFound();
  const n = (value: number) => new Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
  const own = page.creator.id === userId;
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="ms-page">
        <div className="wrap">
          <p>
            <Link href="/mirador">← {t('mirador.nav')}</Link>
          </p>
          <div className="ms-head">
            <span className="mf-avatar">
              {page.creator.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- a member's photo from the media route
                <img src={page.creator.avatar} alt="" />
              ) : (
                page.creator.name.slice(0, 1).toUpperCase()
              )}
            </span>
            <div>
              <h1>{page.creator.name}</h1>
              {own ? (
                <Link className="mu-line" href="/mirador/estudio">
                  {t('mirador.studio.title')}
                </Link>
              ) : (
                <FollowButton creatorId={page.creator.id} following={page.isFollowing} signedIn={Boolean(userId)} loginHref={loginHref(`/mirador/creador/${yayId}`)} labels={{ follow: t('mirador.feed.follow'), following: t('mirador.feed.following') }} />
              )}
            </div>
          </div>
          {page.creator.bio ? <p className="muted">{page.creator.bio}</p> : null}
          <dl className="ms-stats">
            <div>
              <dt>{t('mirador.studio.followers')}</dt>
              <dd>{n(page.counts.followers)}</dd>
            </div>
            <div>
              <dt>{t('mirador.studio.following')}</dt>
              <dd>{n(page.counts.following)}</dd>
            </div>
            <div>
              <dt>{t('mirador.studio.likes')}</dt>
              <dd>{n(page.counts.likes)}</dd>
            </div>
          </dl>
          {page.videos.length === 0 ? (
            <p className="muted">{t('mirador.creator.empty')}</p>
          ) : (
            <ul className="ms-grid">
              {page.videos.map((video) => (
                <li key={video.id}>
                  <Link href={`/mirador/v/${video.id}`} aria-label={video.caption.slice(0, 80) || page.creator.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a poster from the media route */}
                    <img src={video.media.poster} alt="" loading="lazy" decoding="async" />
                    <span className="ms-count">▶ {n(video.counts.views)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
