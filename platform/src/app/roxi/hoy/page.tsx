import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { signInPath } from '@/server/auth/sign-in-path';
import { planAllows } from '@/config/business-rules';
import { currentPlan } from '@/server/domains/roxi/credits';
import { itemsAvailable, listItems } from '@/server/domains/roxi/items';
import { businessAvailable, businessSummary } from '@/server/domains/roxi/business';
import { communityPulse, memberClock, memberPlace, opportunityFor, type Pulse } from '@/server/domains/roxi/world';
import { FrontDoor } from '@/ui/roxi/front-door';
import { inMemberZone } from '@/ui/roxi/member-time';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('roxi.world.title') };
}
export const dynamic = 'force-dynamic';

/**
 * "Mi mundo" (40) with "¿Qué necesitas hoy?" (the front door). Three cards,
 * no more: the day, the community, and the member's goals — or their
 * business, when they keep one with Roxi. Everything comes from records or
 * from what the member asked Roxi to keep; an empty card says it is empty.
 */
export default async function RoxiWorldPage() {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect(await signInPath());
  const { today, timeZone } = await memberClock(db(), userId);
  const items = itemsAvailable() ? await listItems(db(), userId) : [];
  const tasks = items.filter((item) => item.kind === 'task' && item.day === today);
  const soon = Date.now() + 2 * 86_400_000;
  const reminders = items.filter((item) => item.kind === 'reminder' && !item.done && item.dueAt && item.dueAt.getTime() < soon);
  const goals = items.filter((item) => item.kind === 'goal' && !item.done);
  const missions = items.filter((item) => item.kind === 'mission' && !item.done);
  const place = await memberPlace(db(), userId);
  let pulse: Pulse | null = place ? await communityPulse(db(), { placeCode: place.code, placeName: place.name }) : null;
  if (pulse?.empty && place?.parentCode) {
    const wider = await communityPulse(db(), { placeCode: place.parentCode, placeName: place.parentName ?? place.name });
    if (!wider.empty) pulse = wider;
  }
  const business = businessAvailable() ? await businessSummary(db(), userId, { from: today, to: today }) : [];
  const plan = (await currentPlan(db(), userId)).plan;
  const opportunity = planAllows(plan, 'daily_opportunity') ? await opportunityFor(db(), userId) : null;
  const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  const first = member.displayName?.split(/\s+/)[0] ?? '';

  const doors = [
    { key: 'help', label: t('roxi.door.help'), ask: t('roxi.door.help_ask'), href: '/services/new' },
    { key: 'sell', label: t('roxi.door.sell'), ask: t('roxi.door.sell_ask'), href: '/mercadito/publish' },
    { key: 'work', label: t('roxi.door.work'), ask: t('roxi.door.work_ask'), href: '/work' },
    { key: 'community', label: t('roxi.door.community'), ask: t('roxi.door.community_ask'), href: '/community' },
    { key: 'talk', label: t('roxi.door.talk'), ask: '', href: '/roxi' },
  ];

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="rx-hero">
        <p className="rx-eyebrow">{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone })}</p>
        <h1 className="rx-title">{t('roxi.world.hello', { name: first })}</h1>
        <FrontDoor title={t('roxi.door.title')} doors={doors} />
      </section>

      {opportunity ? (
        <a className="rx-banner is-good rx-opportunity" href={opportunity.url}>
          <strong>{t('roxi.world.opportunity')}</strong> {opportunity.title} →
        </a>
      ) : null}

      <div className="rx-cards">
        <section className="rx-section rx-card">
          <h2>{t('roxi.world.day')}</h2>
          {tasks.length + reminders.length === 0 ? <p className="rx-small">{t('roxi.world.day_empty')}</p> : null}
          <ul className="rx-faq">
            {tasks.map((task) => (
              <li key={task.id} className={task.done ? 'is-done' : undefined}>
                {task.done ? '✓ ' : ''}
                {task.title}
              </li>
            ))}
            {reminders.map((reminder) => (
              <li key={reminder.id}>
                {reminder.title} · {inMemberZone(reminder.dueAt!, locale, timeZone, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </li>
            ))}
          </ul>
          <a className="rx-small" href="/roxi/memory#task">
            {t('roxi.world.see_all')} →
          </a>
        </section>

        <section className="rx-section rx-card">
          <h2>{pulse ? t('roxi.world.community_in', { place: pulse.place }) : t('roxi.world.community')}</h2>
          {!place ? (
            <p className="rx-small">
              {t('roxi.world.no_place')} <a href="/settings">{t('roxi.world.set_place')}</a>
            </p>
          ) : !pulse || pulse.empty ? (
            <p className="rx-small">{t('roxi.world.community_empty', { place: place.name })}</p>
          ) : (
            <ul className="rx-faq">
              {pulse.mercadito.newListings > 0 ? (
                <li>
                  <a href="/mercadito">{t('roxi.pulse.listings', { n: pulse.mercadito.newListings })}</a>
                </li>
              ) : null}
              {pulse.work.newOffers > 0 ? (
                <li>
                  <a href="/work">{t('roxi.pulse.work', { n: pulse.work.newOffers })}</a>
                </li>
              ) : null}
              {pulse.community.openHelpRequests > 0 ? (
                <li>
                  <a href="/community">{t('roxi.pulse.help', { n: pulse.community.openHelpRequests })}</a>
                </li>
              ) : null}
              {pulse.services.openRequests > 0 ? (
                <li>
                  <a href="/services">{t('roxi.pulse.services', { n: pulse.services.openRequests })}</a>
                </li>
              ) : null}
              {pulse.animals.stillLost > 0 ? (
                <li>
                  <a href="/animals/lost">{t('roxi.pulse.lost', { n: pulse.animals.stillLost })}</a>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {business.length > 0 ? (
          <section className="rx-section rx-card">
            <h2>{t('roxi.world.business')}</h2>
            <ul className="rx-faq">
              {business.map((totals) => (
                <li key={totals.currency}>
                  {t('roxi.business.sales_line', { amount: money(totals.sales, totals.currency), n: totals.salesCount })}
                </li>
              ))}
            </ul>
            <a className="rx-small" href="/roxi/negocio">
              {t('roxi.world.see_all')} →
            </a>
          </section>
        ) : (
          <section className="rx-section rx-card">
            <h2>{t('roxi.world.goals')}</h2>
            {goals.length + missions.length === 0 ? <p className="rx-small">{t('roxi.world.goals_empty')}</p> : null}
            <ul className="rx-faq">
              {goals.map((goal) => (
                <li key={goal.id}>
                  {goal.title}
                  {goal.target ? ` · ${Math.min(100, Math.round(((goal.progress ?? 0) / goal.target) * 100))}%` : ''}
                </li>
              ))}
              {missions.map((mission) => (
                <li key={mission.id}>
                  {mission.title} · {t('roxi.world.steps', { done: (mission.steps ?? []).filter((step) => step.done).length, total: (mission.steps ?? []).length })}
                </li>
              ))}
            </ul>
            <a className="rx-small" href="/roxi/memory#goal">
              {t('roxi.world.see_all')} →
            </a>
          </section>
        )}
      </div>
      <p className="rx-small rx-center">{t('roxi.world.honest' as MessageKey)}</p>
    </AppShell>
  );
}
