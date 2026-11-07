import { db } from '@/server/db/client';
import { sameOrigin } from '@/app/api/go/upload';
import { addItem, cleanBody, deleteItem, ITEM_KINDS, itemsAvailable, memoryForRoxi, REPEATS, updateItem, type ItemKind, type Repeat } from '@/server/domains/roxi/items';
import { DomainError } from '@/server/errors';
import { getTranslator } from '@/i18n/server';
import { searchPlaces } from '@/server/domains/geography/places';
import { json, member } from '../shared';
import { memberClock } from '@/server/domains/roxi/world';
import { instantToWallTime, wallTimeToInstant } from '@/server/time/zoned';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What Roxi keeps for this member, for her to read (the `my_memory` tool). `day` is the member's local date. */
export async function GET(request: Request) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  if (!itemsAvailable()) return json({ ok: false, error: 'not_available' });
  const day = new URL(request.url).searchParams.get('day') ?? '';
  const clock = await memberClock(db(), session.user.userId);
  return json({ ok: true, ...(await memoryForRoxi(db(), session.user.userId, DAY.test(day) ? day : clock.today, clock.timeZone)), page: '/roxi/memory' });
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
  const { timeZone } = await memberClock(db(), userId);
  // Roxi's time, read in the member's zone; a string that is not a time is refused, not guessed.
  const dueFrom = (value: unknown): Date | null | 'invalid' => {
    if (typeof value !== 'string' || !value.trim()) return null;
    return wallTimeToInstant(value, timeZone) ?? 'invalid';
  };
  // What was stored, said back the way the member's clock reads it, so Roxi confirms what is true.
  const echo = (date: Date | null) => (date ? { due_local: instantToWallTime(date, timeZone), time_zone: timeZone } : {});
  try {
    switch (body?.action) {
      case 'add': {
        const kind = String(body.kind ?? '') as ItemKind;
        if (!(ITEM_KINDS as readonly string[]).includes(kind)) return json({ ok: false, error: 'unknown_kind' });
        const repeat = (REPEATS as readonly string[]).includes(String(body.repeat)) ? (String(body.repeat) as Repeat) : 'none';
        const due = dueFrom(body.due);
        if (due === 'invalid') return json({ ok: false, error: 'bad_time', expected: 'YYYY-MM-DDTHH:MM in the member\'s time' });
        // A watch's place is resolved to a place Yavaya knows, the way a listing's is.
        let placeCode: string | undefined;
        let placeName: string | undefined;
        if (kind === 'watch' && typeof body.place === 'string' && body.place.trim()) {
          const { locale } = await getTranslator();
          const [hit] = await searchPlaces(db(), body.place.trim().slice(0, 80), { locale, limit: 1 });
          if (!hit) return json({ ok: false, error: 'place_not_found', asked: body.place });
          placeCode = hit.code;
          placeName = hit.name;
        }
        const steps = Array.isArray(body.steps) ? body.steps : typeof body.steps === 'string' ? body.steps.split(/\n|\|/) : undefined;
        const title = body.title ?? (kind === 'watch' ? body.query : undefined);
        const item = await addItem(db(), userId, {
          kind,
          body: cleanBody({
            title,
            detail: body.detail,
            target: body.target,
            progress: body.progress,
            action: body.action_hint,
            steps,
            district: body.district ?? (kind === 'watch' ? 'mercadito' : undefined),
            query: body.query,
            maxPrice: typeof body.max_price === 'number' ? body.max_price : undefined,
            currency: body.currency,
            placeCode,
            placeName,
            source: kind === 'milestone' ? 'member' : undefined,
          }),
          dueAt: due,
          repeat,
          day: typeof body.day === 'string' ? body.day : kind === 'milestone' ? new Date().toISOString().slice(0, 10) : null,
        });
        return json({ ok: true, saved: { id: item.id, kind: item.kind, title: item.title, ...echo(item.dueAt) } });
      }
      case 'done':
        await updateItem(db(), userId, String(body.id ?? ''), { done: body.done !== false });
        return json({ ok: true });
      case 'update': {
        const due = dueFrom(body.due);
        if (due === 'invalid') return json({ ok: false, error: 'bad_time', expected: 'YYYY-MM-DDTHH:MM in the member\'s time' });
        const updated = await updateItem(db(), userId, String(body.id ?? ''), {
          body: { title: body.title ?? undefined, detail: body.detail ?? undefined, progress: body.progress ?? undefined, target: body.target ?? undefined },
          ...(due ? { dueAt: due } : {}),
        });
        return json({ ok: true, ...echo(updated?.dueAt ?? null) });
      }
      case 'step':
        await updateItem(db(), userId, String(body.id ?? ''), { step: { index: Number(body.index), done: body.done !== false } });
        return json({ ok: true });
      case 'snooze':
        await updateItem(db(), userId, String(body.id ?? ''), { snoozeHours: Number(body.hours) || 24 });
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
