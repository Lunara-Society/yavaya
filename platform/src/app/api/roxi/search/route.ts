import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { ROXI_SCOPES, roxiSearch, type RoxiScope } from '@/server/domains/roxi/service';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/** A look-up Roxi makes for the member: one district, a few results, as that member would see them. */
export async function GET(request: Request) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ error: 'signed_out' }, 401);
  if (limited) return json({ error: 'too_many' }, 429);
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? '';
  if (!(ROXI_SCOPES as readonly string[]).includes(scope)) return json({ error: 'scope' }, 400);
  const field = (name: string) => url.searchParams.get(name)?.slice(0, 80) || undefined;
  const { locale, t } = await getTranslator();
  const result = await roxiSearch(db(), {
    userId: session.user.userId,
    locale,
    t,
    scope: scope as RoxiScope,
    query: field('q'),
    category: field('category'),
    place: field('place'),
  });
  return json(result);
}
