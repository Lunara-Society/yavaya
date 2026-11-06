import { db } from '@/server/db/client';
import { sameOrigin } from '@/app/api/go/upload';
import { DomainError } from '@/server/errors';
import { businessAvailable, businessSummary, ENTRY_KINDS, periodOf, recentEntries, recordEntry, voidEntry, type EntryKind } from '@/server/domains/roxi/business';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The member's business ledger (21, 33). Body: { action: 'record' | 'void' |
 * 'summary' | 'recent', day (the member's local date), ... }. Totals are the
 * database's arithmetic; Roxi reads them out, she does not compute them.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  if (!businessAvailable()) return json({ ok: false, error: 'not_available' });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = session.user.userId;
  const day = typeof body?.day === 'string' && DAY.test(body.day) ? body.day : new Date().toISOString().slice(0, 10);
  try {
    switch (body?.action) {
      case 'record': {
        const kind = String(body.kind ?? '') as EntryKind;
        if (!(ENTRY_KINDS as readonly string[]).includes(kind)) return json({ ok: false, error: 'unknown_kind', kinds: ENTRY_KINDS });
        const saved = await recordEntry(db(), userId, { kind, amount: body.amount, cost: body.cost, currency: String(body.currency ?? ''), day, note: typeof body.note === 'string' ? body.note : undefined });
        return json({ ok: true, saved, page: '/roxi/negocio' });
      }
      case 'void':
        await voidEntry(db(), userId, String(body.id ?? ''));
        return json({ ok: true });
      case 'summary': {
        const period = body.period === 'week' || body.period === 'month' ? body.period : 'day';
        const range = periodOf(day, period);
        return json({
          ok: true,
          period,
          ...range,
          totals: await businessSummary(db(), userId, range),
          how_to_read: 'sales = money in. gross_profit_on_costed = sales whose cost the member gave, minus that cost (an estimate, only for those sales). cash_difference = sales − stock bought − expenses: money in less money out, NOT profit. owed_to_me / i_owe = still open, all time.',
        });
      }
      case 'recent':
        return json({ ok: true, entries: (await recentEntries(db(), userId, { limit: 15 })).filter((entry) => !entry.voided) });
      default:
        return json({ ok: false, error: 'unknown_action' });
    }
  } catch (error) {
    if (error instanceof DomainError) return json({ ok: false, error: error.messageKey.split('.').pop(), ...error.details });
    throw error;
  }
}
