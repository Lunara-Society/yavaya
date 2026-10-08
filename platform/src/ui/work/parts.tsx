import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { PostCard as PostCardView } from '@/server/domains/work/service';
import { formatDate } from '@/ui/mercadito/format';

/**
 * A job or project, the way someone looking for work reads it: what, for
 * whom, where, and — before anything else they would have to ask — the pay.
 */
export function PostCard({ post, t, locale, footer }: { post: PostCardView; t: Translator; locale: string; footer?: string }) {
  return (
    <article className={post.featured ? 'wk-post is-featured' : 'wk-post'}>
      {/* Paid placement is always labelled. */}
      {post.featured ? <span className="mk-featured-tag">{t('mercadito.feature.tag')}</span> : null}
      <p className="sv-kicker">
        {t(`work.kind.${post.kind}` as MessageKey)} · {t(`work.field.${post.field}` as MessageKey)}
        {post.status !== 'open' ? ` · ${t(`work.status.${post.status}` as MessageKey)}` : ''}
      </p>
      <h3 className="sv-title">
        <Link href={`/work/posts/${post.id}`}>{post.title}</Link>
      </h3>
      <p className="wk-pay">{post.payText}</p>
      <p className="sv-meta">
        {post.companyName ?? post.employerName}
        {post.employerVerified ? <span className="wk-verified"> ✓ {t(`work.employer.verified_${post.employerVerified}` as MessageKey)}</span> : null} · {post.placeName} · {t(`work.place_mode.${post.placeMode}` as MessageKey)} · {t(`work.employment.${post.employment}` as MessageKey)}
      </p>
      <p className="sv-meta">
        {formatDate(post.createdAt, locale)}
        {post.applicationCount > 0 ? ` · ${post.applicationCount === 1 ? t('work.post.applications_one') : t('work.post.applications', { count: post.applicationCount })}` : ''}
      </p>
      {footer ? <p className="an-foot">{footer}</p> : null}
    </article>
  );
}
