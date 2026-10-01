import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { LostFoundCard as LostFoundCardView } from '@/server/domains/animals/lost-found';
import { formatDate } from '@/ui/mercadito/format';

/** A lost or found animal: the photo, what kind of post, where, and since when. */
export function LostCard({ post, t, locale }: { post: LostFoundCardView; t: Translator; locale: string }) {
  return (
    <Link className="an-card" href={`/animals/lost/${post.id}`}>
      <span className="an-photo">
        {post.photoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from /media, pre-sized
          <img src={`/media/${post.photoId}`} alt="" loading="lazy" decoding="async" />
        ) : null}
        <span className={post.kind === 'lost' ? 'an-status an-lost' : 'an-status an-found'}>{t(`animals.lost.kind.${post.kind}` as MessageKey)}</span>
      </span>
      <span className="an-card-body">
        <strong className="an-name">{post.name ?? t(`animals.species.${post.species}` as MessageKey)}</strong>
        <span className="an-facts">{t(post.kind === 'lost' ? 'animals.lost.since' : 'animals.lost.found_on', { date: formatDate(new Date(`${post.seenOn}T12:00:00Z`), locale) })}</span>
        <span className="an-place">{post.placeName}</span>
        {post.status !== 'open' ? <span className="an-foot">{t(`animals.lost.status.${post.status}` as MessageKey)}</span> : null}
      </span>
    </Link>
  );
}
