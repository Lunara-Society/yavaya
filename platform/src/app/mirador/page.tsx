import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { loginHref } from '@/server/auth/return-path';
import { browsePlace } from '@/server/place-choice';
import { miradorOpen } from '@/server/domains/mirador/access';
import { FEED_TABS, feedPage, isFeedTab } from '@/server/domains/mirador/feed';
import { shellContext } from '@/ui/shell-context';
import { MiradorFeed } from '@/ui/mirador/feed';
import { feedLabels } from '@/ui/mirador/labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await shellContext();
  return { title: t('mirador.meta.title'), description: t('mirador.meta.description') };
}

/**
 * Mirador's feed (docs/mirador/README.md): the whole screen is the video, so
 * no site header or footer here; the back arrow returns to Yavaya. The first
 * videos are rendered on the server, so the first poster paints before any
 * script runs.
 */
export default async function MiradorPage({ searchParams }: { searchParams: Promise<{ tab?: string; place?: string }> }) {
  const params = await searchParams;
  const { t, locale, userId } = await shellContext();
  if (!(await miradorOpen(db(), userId))) notFound();
  const tab = isFeedTab(params.tab) ? params.tab : 'para_ti';
  const place = await browsePlace(params.place, locale);
  const page = await feedPage(db(), { tab, viewer: { userId, placeCode: place.code ?? null, language: locale === 'en' ? 'en' : 'es' } });
  return (
    <MiradorFeed
      initial={page.items}
      next={page.next}
      tab={tab}
      tabs={FEED_TABS}
      needsPlace={page.needsPlace}
      signedIn={Boolean(userId)}
      loginHref={loginHref(tab === 'para_ti' ? '/mirador' : `/mirador?tab=${tab}`)}
      labels={feedLabels(t)}
      locale={locale}
    />
  );
}
