import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { publishReceipt } from '@/server/domains/mercadito/service';
import { roxiReviewOn } from '@/server/domains/roxi/drafts';
import { formatPrice } from '@/ui/mercadito/format';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Roxi's receipt for a listing the member just published from her draft
 * (docs/roxi/FLAGSHIP.md): where it is, what it cost, and how to change or
 * take it down. Read from the server's own record of the publish, so the
 * receipt and what Roxi is told can only say what happened.
 */
export async function GET(request: Request) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false }, 401);
  if (limited) return json({ ok: false }, 429);
  const userId = session.user.userId;
  if (!(await roxiReviewOn(db(), userId))) return json({ ok: false, error: 'off' }, 404);
  const listingId = new URL(request.url).searchParams.get('listing') ?? '';
  if (!UUID.test(listingId)) return json({ ok: false }, 400);
  const receipt = await publishReceipt(db(), { sellerUserId: userId, listingId });
  if (!receipt) return json({ ok: false }, 404);
  const { locale } = await getTranslator();
  return json({
    ok: true,
    receipt: {
      id: receipt.id,
      title: receipt.title,
      price: formatPrice(receipt.priceMinor, receipt.currencyCode, locale),
      status: receipt.status,
      cost: receipt.cost,
      freeLeft: Math.max(0, receipt.freeOpenListings - receipt.openNow),
      freeOpenListings: receipt.freeOpenListings,
      url: `/mercadito/${receipt.id}`,
      editUrl: `/mercadito/${receipt.id}/edit`,
      mineUrl: '/mercadito/mine',
    },
  });
}
