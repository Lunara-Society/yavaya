import { db } from '@/server/db/client';
import { sameOrigin } from '@/app/api/go/upload';
import { addItem, cleanBody, deleteItem, ITEM_KINDS, itemsAvailable, memoryForRoxi, REPEATS, updateItem, type ItemKind, type Repeat } from '@/server/domains/roxi/items';
import { DomainError } from '@/server/errors';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What Roxi keeps for this member, for her to read (the `my_memory` tool). `day` is the member's local date. */
export async function GET(request: Request) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  if (!itemsAvailable()) return json({ ok: false, error: 'not_available' });
  const day = new URL(request.url).searchParams.get('day') ?? '';
  return json({ ok: true, ...(await memoryForRoxi(db(), session.user.userId, DAY.test(day) ? day : new Date().toISOString().slice(0, 10))), page: '/roxi/memory' });
}

/**
 * Roxi saves, changes or removes something for the member — only after
 * asking them (her instructions), and the panel shows each change.
 * Body: { action: 'add' | 'done' | 'update' | 'delete', ... }.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  if (!itemsAvailable()) return json({ ok: false, error: 'not_available' });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = session.user.userId;
  try {
    switch (body?.action) {
      case 'add': {
        const kind = String(body.kind ?? '') as ItemKind;
        if (!(ITEM_KINDS as readonly string[]).includes(kind)) return json({ ok: false, error: 'unknown_kind' });
        const repeat = (REPEATS as readonly string[]).includes(String(body.repeat)) ? (String(body.repeat) as Repeat) : 'none';
        const due = typeof body.due === 'string' ? new Date(body.due) : null;
        const item = await addItem(db(), userId, {
          kind,
          body: cleanBody({ title: body.title, detail: body.detail, target: body.target, progress: body.progress, action: body.action_hint }),
          dueAt: due,
          repeat,
          day: typeof body.day === 'string' ? body.day : null,
        });
        return json({ ok: true, saved: { id: item.id, kind: item.kind, title: item.title } });
      }
      case 'done':
        await updateItem(db(), userId, String(body.id ?? ''), { done: body.done !== false });
        return json({ ok: true });
      case 'update':
        await updateItem(db(), userId, String(body.id ?? ''), { body: { title: body.title ?? undefined, detail: body.detail ?? undefined, progress: body.progress ?? undefined, target: body.target ?? undefined } });
        return json({ ok: true });
      case 'delete':
        await deleteItem(db(), userId, String(body.id ?? ''));
        return json({ ok: true });
      default:
        return json({ ok: false, error: 'unknown_action' });
    }
  } catch (error) {
    if (error instanceof DomainError) return json({ ok: false, error: error.messageKey.split('.').pop(), ...error.details });
    throw error;
  }
}
