import { db } from '@/server/db/client';
import { sameOrigin } from '@/app/api/go/upload';
import { callConnector } from '@/server/domains/roxi/connectors/service';
import { DomainError } from '@/server/errors';
import { json, member } from '../../shared';

export const dynamic = 'force-dynamic';

/**
 * Roxi uses one connected tool. An action that changes something answers
 * `needsConfirmation` with what to show the member; the panel calls again
 * with the token only after the member taps to allow it.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  const body = (await request.json().catch(() => null)) as { connection_id?: unknown; tool?: unknown; args?: unknown; confirm_token?: unknown } | null;
  try {
    const outcome = await callConnector(db(), session.user.userId, {
      connectionId: typeof body?.connection_id === 'string' ? body.connection_id : '',
      tool: typeof body?.tool === 'string' ? body.tool : '',
      args: body?.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {},
      confirmToken: typeof body?.confirm_token === 'string' ? body.confirm_token : undefined,
    });
    return json(outcome);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') return json({ ok: false, error: 'unknown_connection' }, 404);
    throw error;
  }
}
