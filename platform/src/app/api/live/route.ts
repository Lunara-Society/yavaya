import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { LIVE_FEED_RULES } from '@/config/business-rules';
import { recentActivity, type FeedItem } from '@/server/domains/notifications/activity';

export const dynamic = 'force-dynamic';

const CODE = /^[a-z0-9._-]{2,80}$/;

/** Where each kind of news leads, so a message is one tap from the thing it is about. */
const DISTRICT_PATHS: Record<string, string> = {
  mercadito: '/mercadito',
  services: '/services',
  yavayago: '/yavayago',
  animals: '/animals',
  work: '/work',
  sanctuary: '/sanctuary',
  community: '/community',
};

/**
 * The live feed for the rotating messages at the bottom of the screen.
 *
 * Real events only (see recentActivity): when nothing has happened, this
 * returns nothing and the page shows nothing. Events in the visitor's chosen
 * place come first, then the rest of the region.
 */
export async function GET(request: Request) {
  const { locale, t } = await getTranslator();
  const placeParam = new URL(request.url).searchParams.get('place');
  const place = placeParam && CODE.test(placeParam) ? placeParam : null;

  const [local, everywhere] = await Promise.all([
    place ? recentActivity(db(), { limit: LIVE_FEED_RULES.maxItems, locationCode: place, locale }) : Promise.resolve([] as FeedItem[]),
    recentActivity(db(), { limit: LIVE_FEED_RULES.maxItems, locale }),
  ]);
  const localIds = new Set(local.map((item) => item.id));
  const items = [...local, ...everywhere.filter((item) => !localIds.has(item.id))].slice(0, LIVE_FEED_RULES.maxItems);

  return NextResponse.json(
    {
      items: items.map((item) => ({
        id: item.id,
        text: t(`activity.${item.kind}` as MessageKey, { place: t('live.somewhere'), ...item.params }),
        district: item.district,
        href: item.district ? DISTRICT_PATHS[item.district] ?? null : null,
        local: localIds.has(item.id),
        at: item.occurredAt.toISOString(),
      })),
    },
    // Private because the language comes from the visitor's cookie; stale within a minute anyway.
    { headers: { 'cache-control': 'private, max-age=30' } },
  );
}
