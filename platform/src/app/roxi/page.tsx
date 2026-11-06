import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import { formatPrice } from '@/ui/mercadito/format';
import { ROXI_CREDIT_PACKS, ROXI_CREDIT_RULES, ROXI_PLANS, type RoxiPlanKey, type RoxiSkill } from '@/config/business-rules';
import { ROXI_SKILL_STATUS, skillsAddedBy } from '@/config/roxi-skills';
import { creditView, usedSince, type CreditView } from '@/server/domains/roxi/credits';
import { billingReadiness, meteringOn } from '@/server/domains/roxi/billing';
import { googleConnectorAvailable } from '@/server/domains/roxi/connectors/google';
import { isAdmin } from '@/server/domains/access/authorize';
import { adminTryPlanAction, buyCreditsAction, cancelPlanAction, resumePlanAction, subscribeAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('roxi.plans.title'), description: t('roxi.plans.lead') };
}
export const dynamic = 'force-dynamic';

const PLAN_KEYS: RoxiPlanKey[] = ['free', 'pro', 'max'];

/**
 * Roxi's plans: Free, Pro and Max, what each includes, what a credit is, and
 * the member's own plan and credits.
 *
 * The honesty rule at its sharpest: a skill that does not work yet is shown
 * as coming, never as included; and while the plans cannot be bought (no
 * payment provider, or no way yet to count credits) the buttons are absent
 * and the page says why.
 */
export default async function RoxiPlansPage({ searchParams }: { searchParams: Promise<{ purchase?: string; done?: string; error?: string; limit?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  const query = await searchParams;
  const readiness = billingReadiness();
  const counting = meteringOn();
  const admin = userId ? await isAdmin(db(), userId) : false;
  const credits: CreditView | null = userId ? await creditView(db(), userId) : null;
  const used = userId && credits ? await usedSince(db(), userId, credits.plan.periodStart ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))) : 0;
  const current = credits?.plan.plan ?? null;
  const attempt = randomUUID();
  const googleReady = googleConnectorAvailable();
  const status = (skill: RoxiSkill) => (skill === 'connectors_google' && !googleReady ? 'soon' : ROXI_SKILL_STATUS[skill]);
  const errorKey = query.error && /^(roxi\.[a-z_.]+|payments\.error\.[a-z_]+|error\.[a-z_.]+)$/.test(query.error) ? (query.error as MessageKey) : null;
  const date = (value: Date) => value.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  const planButton = (plan: RoxiPlanKey) => {
    if (plan === 'free') return current === 'free' ? <p className="rx-current">{t('roxi.plans.current')}</p> : null;
    if (current === plan) return <p className="rx-current">{credits?.plan.status === 'canceling' ? t('roxi.plans.ending', { date: date(credits.plan.periodEnd!) }) : t('roxi.plans.current')}</p>;
    if (!userId) return <a className="rx-cta" href="/login?next=/roxi">{t('roxi.plans.sign_in')}</a>;
    if (current === 'max' && plan === 'pro') return <p className="rx-note">{t('roxi.plans.downgrade_note')}</p>;
    if (!readiness.ready) return null;
    return (
      <form action={subscribeAction}>
        <input type="hidden" name="plan" value={plan} />
        <input type="hidden" name="attempt" value={attempt} />
        <button type="submit" className="rx-cta">
          {current === 'pro' && plan === 'max' ? t('roxi.plans.upgrade') : t('roxi.plans.choose', { plan: t(`roxi.plan.${plan}` as MessageKey) })}
        </button>
      </form>
    );
  };

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="rx-hero">
        <p className="rx-eyebrow">{t('roxi.plans.eyebrow')}</p>
        <h1 className="rx-title">{t('roxi.plans.title')}</h1>
        <p className="rx-lead">{t('roxi.plans.lead')}</p>
        {credits ? (
          <div className="rx-mine" aria-live="polite">
            <p>
              <span className="rx-mine-label">{t('roxi.plans.your_plan')}</span> <strong>{t(`roxi.plan.${credits.plan.plan}` as MessageKey)}</strong>
              {credits.plan.source === 'admin' ? <span className="rx-tag">{t('roxi.plans.admin_trial')}</span> : null}
            </p>
            {counting ? (
              <>
                <p className="rx-mine-n">
                  {t('roxi.plans.credits_left', { n: credits.available.toLocaleString(locale) })}
                </p>
                <div className="rx-meter" role="img" aria-label={t('roxi.plans.used', { used: used.toLocaleString(locale), total: credits.allowance.toLocaleString(locale) })}>
                  <span style={{ width: `${Math.min(100, Math.round((Math.max(0, credits.planCredits) / Math.max(1, credits.allowance)) * 100))}%` }} />
                </div>
                <p className="rx-small">
                  {t('roxi.plans.refills', { n: credits.allowance.toLocaleString(locale), date: date(credits.refillsAt) })}
                  {credits.purchasedCredits > 0 && credits.purchasedExpiresAt ? ` · ${t('roxi.plans.purchased_left', { n: credits.purchasedCredits.toLocaleString(locale), date: date(credits.purchasedExpiresAt) })}` : ''}
                </p>
              </>
            ) : (
              <p className="rx-small">{t('roxi.plans.not_counting')}</p>
            )}
            <p className="rx-links">
              <a href="/roxi/memory">{t('roxi.memory.title')} →</a>
              <a href="/roxi/connections">{t('roxi.connect.title')} →</a>
            </p>
          </div>
        ) : null}
      </section>

      {query.purchase === 'paid' ? <p className="rx-banner is-good" role="status">{t('roxi.plans.paid')}</p> : null}
      {query.purchase === 'returned' ? <p className="rx-banner" role="status">{t('payments.returned')}</p> : null}
      {query.purchase === 'failed' ? <p className="rx-banner is-warn" role="alert">{t('payments.failed')}</p> : null}
      {query.purchase === 'cancelled' ? <p className="rx-banner" role="status">{t('payments.cancelled')}</p> : null}
      {query.done === 'cancelled' ? <p className="rx-banner" role="status">{t('roxi.plans.cancelled')}</p> : null}
      {query.done === 'resumed' ? <p className="rx-banner is-good" role="status">{t('roxi.plans.resumed')}</p> : null}
      {query.done === 'trial' ? <p className="rx-banner is-good" role="status">{t('roxi.plans.trial_started')}</p> : null}
      {errorKey ? <p className="rx-banner is-warn" role="alert">{t(errorKey, { limit: Number(query.limit) || 0 })}</p> : null}

      {!readiness.ready ? (
        <div className="rx-banner is-warn">
          <div className="flex items-center justify-between gap-3">
            <strong>{t('roxi.plans.not_open_title')}</strong>
            <CapabilityBadge state="REQUIRES_CONFIGURATION" t={t} />
          </div>
          <p className="mt-1">{readiness.missing.includes('metering') ? t('roxi.plans.not_open_metering') : t('roxi.plans.not_open_payments')}</p>
        </div>
      ) : null}

      <ul className="rx-plans">
        {PLAN_KEYS.map((key) => {
          const plan = ROXI_PLANS[key];
          return (
            <li key={key} className={`rx-plan is-${key}${current === key ? ' is-current' : ''}`}>
              <h2 className="rx-plan-name">{t(`roxi.plan.${key}` as MessageKey)}</h2>
              <p className="rx-plan-tagline">{t(`roxi.plan.${key}_tagline` as MessageKey)}</p>
              <p className="rx-price">
                {plan.priceMinor === 0 ? t('roxi.plans.free_price') : <>{formatPrice(plan.priceMinor, plan.currency, locale)}<span>{t('roxi.plans.per_month')}</span></>}
              </p>
              <p className="rx-credits">{t('roxi.plans.monthly_credits', { n: plan.monthlyCredits.toLocaleString(locale) })}</p>
              <p className="rx-small">{t('roxi.plans.credits_mean', { written: Math.round(plan.monthlyCredits / 25).toLocaleString(locale), minutes: Math.round(plan.monthlyCredits / 150).toLocaleString(locale) })}</p>
              <ul className="rx-limits">
                <li>{t('roxi.plans.limit.goals', { n: plan.goals })}</li>
                <li>{t(plan.recurringReminders ? 'roxi.plans.limit.reminders_repeat' : 'roxi.plans.limit.reminders', { n: plan.reminders })}</li>
                <li>{plan.connections === 0 ? t('roxi.plans.limit.no_connections') : t(key === 'max' ? 'roxi.plans.limit.connections_all' : 'roxi.plans.limit.connections_google', { n: plan.connections })}</li>
              </ul>
              {key !== 'free' ? <p className="rx-includes">{t(key === 'pro' ? 'roxi.plans.everything_free' : 'roxi.plans.everything_pro')}</p> : null}
              <ul className="rx-skills">
                {skillsAddedBy(key).map((skill) => (
                  <li key={skill} className={status(skill) === 'soon' ? 'is-soon' : undefined}>
                    <strong>{t(`roxi.skill.${skill}` as MessageKey)}</strong>
                    {status(skill) === 'soon' ? <span className="rx-tag">{t('roxi.plans.soon')}</span> : null}
                    <span>{t(`roxi.skill.${skill}_detail` as MessageKey)}</span>
                  </li>
                ))}
              </ul>
              <div className="rx-plan-action">{planButton(key)}</div>
            </li>
          );
        })}
      </ul>

      {credits && credits.plan.plan !== 'free' && credits.plan.source === 'payment' ? (
        <section className="rx-section">
          <h2>{t('roxi.plans.manage')}</h2>
          {credits.plan.status === 'canceling' ? (
            <form action={resumePlanAction}>
              <p className="rx-small">{t('roxi.plans.ending', { date: date(credits.plan.periodEnd!) })}</p>
              <button type="submit" className="rx-cta">{t('roxi.plans.resume')}</button>
            </form>
          ) : (
            <form action={cancelPlanAction} className="rx-cancel">
              <p className="rx-small">{t('roxi.plans.cancel_explain', { date: date(credits.plan.periodEnd!) })}</p>
              <label className="rx-check">
                <input type="checkbox" name="confirm" value="yes" required /> {t('roxi.plans.cancel_confirm')}
              </label>
              <button type="submit" className="rx-line">{t('roxi.plans.cancel')}</button>
            </form>
          )}
        </section>
      ) : null}

      <section className="rx-section" id="creditos">
        <h2>{t('roxi.plans.packs_title')}</h2>
        <p className="rx-small">{t('roxi.plans.packs_lead', { months: ROXI_CREDIT_RULES.purchasedCreditMonths })}</p>
        <ul className="rx-packs">
          {ROXI_CREDIT_PACKS.map((pack) => (
            <li key={pack.key} className="rx-pack">
              <p className="rx-pack-n">{t('roxi.plans.pack_credits', { n: pack.credits.toLocaleString(locale) })}</p>
              <p className="rx-pack-price">{formatPrice(pack.priceMinor, pack.currency, locale)}</p>
              {userId && readiness.ready ? (
                <form action={buyCreditsAction}>
                  <input type="hidden" name="pack" value={pack.key} />
                  <input type="hidden" name="attempt" value={attempt} />
                  <button type="submit" className="rx-line">{t('payments.buy')}</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rx-section">
        <h2>{t('roxi.plans.how_title')}</h2>
        <ul className="rx-faq">
          <li>{t('roxi.plans.how.credit', { written: 25, minute: 150 })}</li>
          <li>{t('roxi.plans.how.minimum', { n: ROXI_CREDIT_RULES.minimumToStart })}</li>
          <li>{t('roxi.plans.how.reset')}</li>
          <li>{t('roxi.plans.how.upgrade')}</li>
          <li>{t('roxi.plans.how.cancel')}</li>
          <li>{t('roxi.plans.how.free_stays')}</li>
          <li>{t('roxi.plans.how.privacy')}</li>
        </ul>
      </section>

      {admin ? (
        <section className="rx-section">
          <h2>{t('roxi.plans.admin_title')}</h2>
          <p className="rx-small">{t('roxi.plans.admin_lead')}</p>
          <div className="flex flex-wrap gap-2">
            {(['pro', 'max'] as const).map((plan) => (
              <form key={plan} action={adminTryPlanAction}>
                <input type="hidden" name="plan" value={plan} />
                <button type="submit" className="rx-line">{t('roxi.plans.admin_try', { plan: t(`roxi.plan.${plan}` as MessageKey) })}</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
