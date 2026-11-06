import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { searchPlaces } from '@/server/domains/geography/places';
import { planAllows } from '@/config/business-rules';
import { currentPlan } from '@/server/domains/roxi/credits';
import { communityPulse, memberPlace, opportunityFor } from '@/server/domains/roxi/world';
import { itemsAvailable, listItems } from '@/server/domains/roxi/items';
import { businessAvailable, businessSummary } from '@/server/domains/roxi/business';
import { json, member } from '../shared';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "¿Qué hay de nuevo en mi mundo?" (40) and "¿Cómo está mi comunidad?" (20):
 * the member's day, their community's public activity today, and — on Pro
 * and Max — one real opportunity. `place` asks about another town by name.
 * Everything comes from records; empty means empty.
 */
export async function GET(request: Request) {
  const { session, limited } = await member({ lookup: true });
  if (!session) return json({ ok: false, error: 'signed_out' }, 401);
  if (limited) return json({ ok: false, error: 'too_many' }, 429);
  const { locale } = await getTranslator();
  const query = new URL(request.url).searchParams;
  const day = DAY.test(query.get('day') ?? '') ? query.get('day')! : new Date().toISOString().slice(0, 10);
  const userId = session.user.userId;

  let place: { code: string; name: string; parentCode: string | null; parentName: string | null } | null = null;
  const asked = query.get('place')?.trim().slice(0, 80);
  if (asked) {
    const [hit] = await searchPlaces(db(), asked, { locale, settlementsOnly: true, limit: 1 });
    if (!hit) return json({ ok: false, error: 'place_not_found', asked });
    place = { code: hit.code, name: hit.name, parentCode: null, parentName: null };
  } else {
    place = await memberPlace(db(), userId);
  }
  let pulse = place ? await communityPulse(db(), { placeCode: place.code, placeName: place.name }) : null;
  // A quiet village: say so, then look at the department around it, and say that too.
  let widened: string | null = null;
  if (pulse?.empty && place?.parentCode) {
    const wider = await communityPulse(db(), { placeCode: place.parentCode, placeName: place.parentName ?? place.name });
    if (!wider.empty) {
      widened = place.name;
      pulse = wider;
    }
  }

  const plan = (await currentPlan(db(), userId)).plan;
  const items = itemsAvailable() ? await listItems(db(), userId) : [];
  const soon = Date.now() + 2 * 86_400_000;
  return json({
    ok: true,
    place: place?.name ?? null,
    no_place_set: !place && !asked,
    community: pulse,
    community_widened_from: widened,
    today: {
      tasks: items.filter((item) => item.kind === 'task' && item.day === day).map(({ id, title, done }) => ({ id, title, done })),
      reminders: items
        .filter((item) => item.kind === 'reminder' && !item.done && item.dueAt && item.dueAt.getTime() < soon)
        .map(({ id, title, dueAt, action }) => ({ id, title, due: dueAt!.toISOString(), action })),
    },
    goals: items.filter((item) => item.kind === 'goal' && !item.done).map(({ id, title, target, progress }) => ({ id, title, target, progress })),
    business_today: businessAvailable() ? await businessSummary(db(), userId, { from: day, to: day }) : [],
    opportunity: planAllows(plan, 'daily_opportunity') ? await opportunityFor(db(), userId) : null,
    opportunity_needs_plan: !planAllows(plan, 'daily_opportunity'),
  });
}
