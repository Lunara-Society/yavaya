import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { PostView } from '@/server/domains/community/service';
import { SUPPORT_KINDS } from '@/server/domains/community/service';
import { formatDate } from '@/ui/mercadito/format';
import { supportAction } from '@/app/community/actions';

/**
 * A post in the square. A story, not a product tile: the words first, the
 * person beside them, and the one gesture that fits — a reply for help, an
 * "I'm with you" for prayer and family support.
 */
export function PostCard({ post, t, locale, full }: { post: PostView; t: Translator; locale: string; full?: boolean }) {
  const author = post.isAuthor
    ? t('community.post.you')
    : post.author
      ? post.author.displayName
      : t('community.post.anonymous_author');
  return (
    <article className={`cm-post cm-${post.kind}`}>
      <header className="cm-post-head">
        <span className="cm-kind">{t(`community.kind.${post.kind}` as MessageKey)}</span>
        {post.status === 'resolved' ? <span className="cm-resolved">{t('community.post.resolved')}</span> : null}
      </header>
      <h2 className="cm-title">{full ? post.title : <Link href={`/community/${post.id}`}>{post.title}</Link>}</h2>
      <p className={full ? 'cm-body' : 'cm-body cm-clamp'}>{post.body}</p>
      <footer className="cm-foot">
        <span className="cm-author">
          {post.author && !post.isAuthor ? <Link href={`/members/${post.author.yayId}`}>{author}</Link> : author}
          {post.placeName ? ` · ${post.placeName}` : ''} · {formatDate(post.createdAt, locale)}
        </span>
        <span className="cm-actions">
          {SUPPORT_KINDS.includes(post.kind) && post.status === 'open' && !post.isAuthor ? (
            <form action={supportAction}>
              <input type="hidden" name="postId" value={post.id} />
              {full ? null : <input type="hidden" name="back" value="square" />}
              <button type="submit" className={post.supportedByViewer ? 'cm-support on' : 'cm-support'}>
                {t(post.supportedByViewer ? 'community.post.supported' : 'community.post.support')}
              </button>
            </form>
          ) : null}
          {SUPPORT_KINDS.includes(post.kind) ? (
            <span className="cm-count">{post.supportCount === 1 ? t('community.post.supporters_one') : t('community.post.supporters', { count: post.supportCount })}</span>
          ) : null}
          {full ? null : (
            <Link className="cm-count" href={`/community/${post.id}#replies`}>
              {post.replyCount === 1 ? t('community.post.replies_one') : t('community.post.replies', { count: post.replyCount })}
            </Link>
          )}
        </span>
      </footer>
    </article>
  );
}
