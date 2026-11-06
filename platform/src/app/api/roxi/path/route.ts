import { db } from '@/server/db/client';
import { lifePath } from '@/server/domains/roxi/world';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/** "¿Cuánto he avanzado este año?" (19): Yavaya's records and the member's saved milestones, each marked as which. */
export async function GET() {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  const path = await lifePath(db(), session.user.userId);
  return json({
    ok: true,
    note: 'source "yavaya" is what Yavaya recorded; source "member" is what the member chose to save. "first_sold_marked" means the member marked a listing as sold: Yavaya does not see the sale.',
    path: path.map(({ day, text, key, source }) => ({ day, source, ...(key ? { event: key } : {}), ...(text ? { text } : {}) })),
    page: '/roxi/memory#camino',
  });
}
