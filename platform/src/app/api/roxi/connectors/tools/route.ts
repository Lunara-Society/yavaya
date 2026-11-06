import { db } from '@/server/db/client';
import { connectorToolsFor } from '@/server/domains/roxi/connectors/service';
import { json, member } from '../../shared';

export const dynamic = 'force-dynamic';

/** What Roxi can use among the member's connected tools now (their plan decides). */
export async function GET() {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ error: 'signed_out' }, 401);
  if (limited) return json({ error: 'too_many' }, 429);
  const { tools, notes } = await connectorToolsFor(db(), session.user.userId);
  return json({ ok: true, tools, notes, connect_page: '/roxi/connections' });
}
