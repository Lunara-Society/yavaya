import { db } from '@/server/db/client';
import { feedPage, isFeedTab } from '@/server/domains/mirador/feed';
import { browsePlace } from '@/server/place-choice';
import { guard, json } from '../shared';

export const dynamic = 'force-dynamic';

/** The next videos of a tab, for the feed to fetch as the viewer nears the end of what it has. */
export async function GET(request: Request) {
  const who = await guard(request, { write: false });
  if ('response' in who) return who.response;
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab');
  const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
  const place = await browsePlace(url.searchParams.get('place') ?? undefined, who.session?.user.locale ?? 'es');
  const page = await feedPage(db(), {
    tab: isFeedTab(tab) ? tab : 'para_ti',
    viewer: { userId: who.userId, placeCode: place?.code ?? null, language: who.session?.user.locale === 'en' ? 'en' : 'es' },
    offset,
  });
  return json({ ok: true, ...page });
}
