import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { loginHref } from '@/server/auth/return-path';
import { browsePlace } from '@/server/place-choice';
import { miradorOpen } from '@/server/domains/mirador/access';
import { FEED_TABS, feedPage, videosByIds } from '@/server/domains/mirador/feed';
import { shellContext } from '@/ui/shell-context';
import { MiradorFeed } from '@/ui/mirador/feed';
import { feedLabels } from '@/ui/mirador/labels';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, userId: string | null, locale: string) {
  if (!UUID.test(id)) return null;
  const [video] = await videosByIds(db(), { ids: [id], viewerId: userId, locale });
  return video ?? null;
}

/** A shared link's preview: the video's own poster and words, never the generic logo. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t, locale, userId } = await shellContext();
  const video = (await miradorOpen(db(), userId)) ? await load((await params).id, null, locale) : null;
  if (!video) return { title: t('mirador.meta.title') };
  const title = `${video.creator.name} · Mirador`;
  const description = video.caption.slice(0, 160) || t('mirador.meta.description');
  return {
    title,
    description,
    openGraph: { title, description, type: 'video.other', images: [{ url: video.media.poster, width: video.width, height: video.height }] },
    twitter: { card: 'summary_large_image', title, description, images: [video.media.poster] },
  };
}

/** One video, opened from a share or a notification; Para ti carries on after it. */
export default async function MiradorVideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ comentarios?: string }> }) {
  const { id } = await params;
  const { t, locale, userId } = await shellContext();
  if (!(await miradorOpen(db(), userId))) notFound();
  const video = await load(id, userId, locale);
  if (!video) notFound();
  const place = await browsePlace(undefined, locale);
  const after = await feedPage(db(), { tab: 'para_ti', viewer: { userId, placeCode: place.code ?? null, language: locale === 'en' ? 'en' : 'es' } });
  return (
    <MiradorFeed
      initial={[video, ...after.items.filter((item) => item.id !== video.id)]}
      next={after.next}
      tab="para_ti"
      tabs={FEED_TABS}
      single
      openComments={(await searchParams).comentarios === '1'}
      signedIn={Boolean(userId)}
      loginHref={loginHref(`/mirador/v/${id}`)}
      labels={feedLabels(t)}
      locale={locale}
    />
  );
}
