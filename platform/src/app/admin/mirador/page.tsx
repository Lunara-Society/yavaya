import type { Metadata } from 'next';
import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { signInPath } from '@/server/auth/sign-in-path';
import { moderationQueue } from '@/server/domains/mirador/videos';
import { mediaUrls } from '@/server/domains/mirador/feed';
import { moderateMiradorAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Mirador's moderation (docs/mirador/README.md, "Safety"): every reported
 * video, most reported first, with the ones already hidden by reports at the
 * top of the decision. The reports themselves, with their tickets, are in
 * the shared moderation queue; this page is for looking at the video and
 * deciding.
 */
export default async function MiradorModerationPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'moderation.queue.read'))) notFound();
  const session = await currentSession();
  const queue = await moderationQueue(db(), session ? { userId, status: session.user.status } : null);
  const creators = queue.length ? await db().select({ id: users.id, name: users.displayName, yayId: users.yayId }).from(users).where(inArray(users.id, [...new Set(queue.map((item) => item.creatorUserId))])) : [];
  const byId = new Map(creators.map((creator) => [creator.id, creator]));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="ms-page">
        <div className="wrap">
          <p>
            <Link href="/admin">← {t('nav.panel')}</Link>
          </p>
          <h1>{t('mirador.mod.title')}</h1>
          <p className="muted">{t('mirador.mod.lead')}</p>
          {queue.length === 0 ? (
            <p className="muted">{t('mirador.mod.empty')}</p>
          ) : (
            <ul className="ms-list">
              {queue.map((item) => {
                const creator = byId.get(item.creatorUserId);
                return (
                  <li key={item.id} className="ms-row">
                    <video src={mediaUrls(item.id).low} poster={mediaUrls(item.id).poster} controls preload="none" playsInline width={64} style={{ width: 64, height: 112, objectFit: 'cover', borderRadius: 8 }} />
                    <div>
                      <p>
                        <span className="ms-badge" data-tone={item.removedReason ? 'bad' : undefined}>
                          {item.removedReason === 'reports' ? t('mirador.studio.removed_reports') : item.removedReason === 'moderator' ? t('mirador.studio.removed_moderator') : t('mirador.studio.public')}
                        </span>{' '}
                        <span className="ms-badge">{t('mirador.mod.reports', { count: item.reports })}</span>
                        {item.source === 'ai' ? <span className="ms-badge">{t('mirador.feed.ai')}</span> : null}
                      </p>
                      <p>{item.caption || t('mirador.studio.no_caption')}</p>
                      <p className="ms-numbers">
                        {creator ? `${creator.name} · ${creator.yayId}` : ''} {item.publishedAt ? `· ${item.publishedAt.toLocaleDateString(locale)}` : ''}
                      </p>
                      <form action={moderateMiradorAction} className="ms-actions">
                        <input type="hidden" name="videoId" value={item.id} />
                        <input name="note" maxLength={1000} placeholder={t('mirador.mod.note')} aria-label={t('mirador.mod.note')} />
                        {item.removedReason === 'moderator' ? null : (
                          <button type="submit" name="action" value="remove">
                            {t('mirador.mod.remove')}
                          </button>
                        )}
                        {item.removedReason ? (
                          <button type="submit" name="action" value="restore">
                            {t('mirador.mod.restore')}
                          </button>
                        ) : null}
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
