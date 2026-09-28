import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { COMMUNITY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PostCard } from '@/ui/community/post-card';
import { formatDate } from '@/ui/mercadito/format';
import { hasPermission } from '@/server/domains/access/authorize';
import { COMMUNITY_REPORT_CATEGORIES, getPost } from '@/server/domains/community/service';
import { closePostAction, replyAction, reportPostAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> };

export default async function CommunityPostPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!UUID.test(id)) notFound();
  const moderator = await hasPermission(db(), userId, 'moderation.queue.read');
  const found = await getPost(db(), { postId: id, viewerId: userId, viewerIsModerator: moderator, locale });
  if (!found) notFound();
  const { post, replies } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const limits = { min: COMMUNITY_RULES.replyMinLength, max: COMMUNITY_RULES.replyMaxLength };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/community">← {t('community.post.back')}</Link>
        </p>
        {post.status === 'withdrawn' ? <p className="mk-banner">{t('community.post.withdrawn')}</p> : null}
        {post.status === 'removed' ? <p className="mk-banner">{t('community.post.removed')}</p> : null}
        {query.reported ? (
          <p className="mk-banner" role="status">
            {t('community.post.reported', { code: query.reported.slice(0, 16) })}
          </p>
        ) : null}
        {error ? <p className="mk-error">{t(error as MessageKey, limits)}</p> : null}

        <PostCard post={post} t={t} locale={locale} full />

        {post.isAuthor && (post.status === 'open' || post.status === 'resolved') ? (
          <div className="btn-row" style={{ marginTop: 14 }}>
            {post.status === 'open' ? (
              <form action={closePostAction}>
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="outcome" value="resolved" />
                <button className="btn btn-gold" type="submit">
                  {t('community.post.mark_resolved')}
                </button>
              </form>
            ) : null}
            <form action={closePostAction}>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="outcome" value="withdrawn" />
              <button className="btn btn-line" type="submit">
                {t('community.post.withdraw')}
              </button>
            </form>
          </div>
        ) : null}

        <section id="replies" className="cm-replies">
          <h2 className="h-md" style={{ fontSize: '1.3rem' }}>
            {replies.length === 1 ? t('community.post.replies_one') : t('community.post.replies', { count: replies.length })}
          </h2>
          {replies.length === 0 ? <p className="muted">{t('community.post.no_replies')}</p> : null}
          {replies.map((reply) => (
            <div key={reply.id} className="cm-reply">
              <p className="cm-body">{reply.body}</p>
              <p className="cm-author">
                {reply.isAuthor ? t('community.post.you') : <Link href={`/members/${reply.author.yayId}`}>{reply.author.displayName}</Link>} ·{' '}
                {formatDate(reply.createdAt, locale)}
              </p>
              {!reply.isAuthor ? (
                <details className="cm-report-reply">
                  <summary>{t('community.post.report_reply')}</summary>
                  <ReportForm postId={post.id} replyId={reply.id} t={t} />
                </details>
              ) : null}
            </div>
          ))}

          {post.status === 'open' ? (
            <form id="reply" action={replyAction} className="mk-form" style={{ marginTop: 18 }}>
              <input type="hidden" name="postId" value={post.id} />
              <label>
                {t('community.post.reply_label')}
                <textarea name="body" required minLength={limits.min} maxLength={limits.max} style={{ minHeight: 110 }} />
              </label>
              <button className="btn btn-gold" type="submit">
                {t('community.post.reply_submit')}
              </button>
            </form>
          ) : post.status === 'resolved' ? (
            <p className="muted mt">{t('community.post.closed_note')}</p>
          ) : null}
        </section>

        {!post.isAuthor && (post.status === 'open' || post.status === 'resolved') ? (
          <details className="card" style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('community.post.report')}</summary>
            <ReportForm postId={post.id} t={t} />
          </details>
        ) : null}
        <p className="muted" style={{ marginTop: 18, fontSize: '0.8rem' }}>
          {formatDate(post.createdAt, locale)}
        </p>
      </div>
    </SiteShell>
  );
}

function ReportForm({ postId, replyId, t }: { postId: string; replyId?: string; t: Parameters<typeof PostCard>[0]['t'] }) {
  return (
    <form action={reportPostAction} className="mk-form" style={{ marginTop: 12 }}>
      <input type="hidden" name="postId" value={postId} />
      {replyId ? <input type="hidden" name="replyId" value={replyId} /> : null}
      <label>
        {t('mercadito.report.category')}
        <select name="category" required defaultValue="">
          <option value="" disabled>
            {t('mercadito.form.choose')}
          </option>
          {COMMUNITY_REPORT_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`community.report.category.${key}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('mercadito.report.details')}
        <textarea name="details" maxLength={2000} style={{ minHeight: 80 }} />
      </label>
      <button className="btn btn-line" type="submit">
        {t('mercadito.report.submit')}
      </button>
    </form>
  );
}
