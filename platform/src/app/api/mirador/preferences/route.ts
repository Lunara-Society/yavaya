import { db } from '@/server/db/client';
import { setPreferences } from '@/server/domains/mirador/social';
import { guard, json, refusal } from '../shared';

export const dynamic = 'force-dynamic';

/** The member's own say over Para ti: the hashtags they chose, or starting it over. */
export async function POST(request: Request) {
  const who = await guard(request, { write: true });
  if ('response' in who) return who.response;
  const body = (await request.json().catch(() => null)) as { interests?: unknown; reset?: unknown } | null;
  try {
    return json({ ok: true, ...(await db().transaction((tx) => setPreferences(tx, { userId: who.userId!, interests: body?.interests, reset: body?.reset === true }))) });
  } catch (error) {
    return refusal(error, 'mirador.preferences');
  }
}
