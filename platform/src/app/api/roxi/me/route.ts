import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { roxiAccount } from '@/server/domains/roxi/service';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

/** The member's own standing — tokens, listings, notices — for Roxi to read out. Theirs only. */
export async function GET() {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ error: 'signed_out' }, 401);
  if (limited) return json({ error: 'too_many' }, 429);
  const { locale, t } = await getTranslator();
  return json(await roxiAccount(db(), { userId: session.user.userId, locale, t }));
}
