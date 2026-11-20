import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { miradorPreferences, users } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import type { MessageKey } from '@/i18n';
import { signInPath } from '@/server/auth/sign-in-path';
import { miradorOpen } from '@/server/domains/mirador/access';
import { videosByIds } from '@/server/domains/mirador/feed';
import { myBlocks, savedIds } from '@/server/domains/mirador/social';
import { creatorTotals, myVideos } from '@/server/domains/mirador/videos';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PreferencesForm, UnblockButton, VideoActions } from '@/ui/mirador/studio-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * A creator's studio (docs/mirador/README.md, "Creators"): their videos with
 * every status and its real numbers, what they saved, who they blocked, and
 * their say over Para ti. Numbers are counts of real rows, never estimates.
 */
export default async function StudioPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await miradorOpen(db(), userId))) notFound();
  const [videos, totals, saved, blocks, [prefs], [me]] = await Promise.all([
    myVideos(db(), userId),
    creatorTotals(db(), userId),
    savedIds(db(), userId).then((ids) => videosByIds(db(), { ids, viewerId: userId, locale })),
    myBlocks(db(), userId),
    db().select().from(miradorPreferences).where(eq(miradorPreferences.userId, userId)).limit(1),
    db().select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  const statusTone = (status: string) => (status === 'ready' ? 'ok' : status === 'failed' || status === 'removed' ? 'bad' : undefined);
  const actionLabels = { publish: t('mirador.studio.publish'), unpublish: t('mirador.studio.unpublish'), remove: t('mirador.studio.remove'), confirm: t('mirador.studio.confirm_remove'), view: t('mirador.studio.view'), error: t('mirador.feed.error') };
  const stats: Array<[MessageKey, number]> = [
    ['mirador.studio.videos', totals.videos],
    ['mirador.studio.views', totals.views],
    ['mirador.studio.likes', totals.likes],
    ['mirador.studio.comments', totals.comments],
    ['mirador.studio.shares', totals.shares],
    ['mirador.studio.saves', totals.saves],
    ['mirador.studio.link_opens', totals.linkOpens],
    ['mirador.studio.followers', totals.followers],
  ];
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="ms-page">
        <div className="wrap">
          <p>
            <Link href="/mirador">← {t('mirador.nav')}</Link>
          </p>
          <h1>{t('mirador.studio.title')}</h1>
          <p className="mu-row">
            <Link className="mf-cta" href="/mirador/subir">
              {t('mirador.feed.upload')}
            </Link>
            {me ? (
              <Link className="mu-line" href={`/mirador/creador/${me.yayId}`}>
                {t('mirador.studio.my_page')}
              </Link>
            ) : null}
          </p>
          <dl className="ms-stats">
            {stats.map(([key, value]) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{n(value)}</dd>
              </div>
            ))}
          </dl>
          {totals.followersWeek > 0 ? <p className="muted">{t('mirador.studio.followers_week', { count: totals.followersWeek })}</p> : null}

          <h2>{t('mirador.studio.my_videos')}</h2>
          {videos.length === 0 ? (
            <p className="muted">{t('mirador.studio.none')}</p>
          ) : (
            <ul className="ms-list">
              {videos.map((video) => (
                <li key={video.id} className="ms-row">
                  {video.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a poster from the media route
                    <img src={video.poster} alt="" loading="lazy" />
                  ) : (
                    <span className="ms-blank" />
                  )}
                  <div>
                    <p>
                      <span className="ms-badge" data-tone={statusTone(video.removedReason ? 'removed' : video.status)}>
                        {video.removedReason ? t(`mirador.studio.removed_${video.removedReason}` as MessageKey) : t(`mirador.status.${video.status}` as MessageKey)}
                      </span>{' '}
                      {video.status === 'ready' && !video.removedReason ? <span className="ms-badge">{video.published ? t('mirador.studio.public') : t('mirador.studio.private')}</span> : null}
                    </p>
                    <p>{video.caption || t('mirador.studio.no_caption')}</p>
                    {video.failureReason ? <p className="mu-error">{t(video.failureReason as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024), min: MIRADOR_RULES.minDurationSeconds })}</p> : null}
                    <p className="ms-numbers">
                      {t('mirador.studio.row_numbers', { views: n(video.counts.views), done: n(video.counts.completions), likes: n(video.counts.likes), comments: n(video.counts.comments), shares: n(video.counts.shares), opens: n(video.counts.linkOpens) })}
                    </p>
                    {video.status !== 'failed' && !video.removedReason ? <VideoActions id={video.id} published={video.published} ready={video.status === 'ready'} labels={actionLabels} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2>{t('mirador.studio.saved')}</h2>
          {saved.length === 0 ? (
            <p className="muted">{t('mirador.studio.saved_none')}</p>
          ) : (
            <ul className="ms-grid">
              {saved.map((video) => (
                <li key={video.id}>
                  <Link href={`/mirador/v/${video.id}`} aria-label={video.caption.slice(0, 80) || video.creator.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a poster from the media route */}
                    <img src={video.media.poster} alt="" loading="lazy" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2>{t('mirador.studio.for_you')}</h2>
          <p className="muted">{t('mirador.studio.for_you_text')}</p>
          <PreferencesForm
            interests={prefs?.interests ?? []}
            labels={{ interests: t('mirador.studio.interests'), hint: t('mirador.studio.interests_hint'), save: t('mirador.studio.save'), reset: t('mirador.studio.reset'), saved: t('mirador.studio.saved_ok'), reset_done: t('mirador.studio.reset_done') }}
          />

          <h2>{t('mirador.studio.blocked')}</h2>
          {blocks.length === 0 ? (
            <p className="muted">{t('mirador.studio.blocked_none')}</p>
          ) : (
            <ul className="ms-list">
              {blocks.map((person) => (
                <li key={person.id} className="mu-row">
                  <span>{person.name}</span>
                  <UnblockButton userId={person.id} label={t('mirador.studio.unblock')} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
