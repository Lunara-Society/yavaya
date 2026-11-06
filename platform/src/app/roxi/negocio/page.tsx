import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { signInPath } from '@/server/auth/sign-in-path';
import { businessAvailable, businessSummary, ENTRY_KINDS, periodOf, recentEntries, type Totals } from '@/server/domains/roxi/business';
import { LocalTimeFields } from '@/ui/roxi/local-time';
import { memberClock } from '@/server/domains/roxi/world';
import { recordBusinessAction, voidBusinessAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('roxi.business.title') };
}
export const dynamic = 'force-dynamic';

/**
 * "¿Cómo va mi negocio?" — the member's ledger, the same one Roxi writes to
 * when they say "vendí 1,800 córdobas". Free on every plan. The totals are
 * the database's arithmetic, labelled so that money in, an estimated gross
 * profit and the cash difference are never mistaken for one another.
 */
export default async function RoxiBusinessPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect(await signInPath());
  const query = await searchParams;
  const available = businessAvailable();
  const { today, currency } = await memberClock(db(), userId);
  const [day, week, month, entries] = available
    ? await Promise.all([
        businessSummary(db(), userId, periodOf(today, 'day')),
        businessSummary(db(), userId, periodOf(today, 'week')),
        businessSummary(db(), userId, periodOf(today, 'month')),
        recentEntries(db(), userId, { limit: 40 }),
      ])
    : [[], [], [], []];
  const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const errorKey = query.error && /^(roxi\.[a-z_.]+|error\.[a-z_.]+)$/.test(query.error) ? (query.error as MessageKey) : null;

  const block = (title: string, totals: Totals[]) => (
    <section className="rx-section rx-card">
      <h2>{title}</h2>
      {totals.length === 0 ? <p className="rx-small">{t('roxi.business.nothing')}</p> : null}
      {totals.map((row) => (
        <dl key={row.currency} className="rx-ledger">
          <dt>{t('roxi.business.sales')}</dt>
          <dd>{money(row.sales, row.currency)}</dd>
          {row.costedSales > 0 ? (
            <>
              <dt>{t('roxi.business.gross', { amount: money(row.costedSales, row.currency) })}</dt>
              <dd>{money(row.grossProfitOnCosted, row.currency)}</dd>
            </>
          ) : null}
          <dt>{t('roxi.business.stock')}</dt>
          <dd>{money(row.stockBought, row.currency)}</dd>
          <dt>{t('roxi.business.expenses')}</dt>
          <dd>{money(row.expenses, row.currency)}</dd>
          <dt>{t('roxi.business.cash')}</dt>
          <dd className={row.cashDifference < 0 ? 'is-negative' : undefined}>{money(row.cashDifference, row.currency)}</dd>
          {row.owedToMe > 0 ? (
            <>
              <dt>{t('roxi.business.owed_to_me')}</dt>
              <dd>{money(row.owedToMe, row.currency)}</dd>
            </>
          ) : null}
          {row.iOwe > 0 ? (
            <>
              <dt>{t('roxi.business.i_owe')}</dt>
              <dd>{money(row.iOwe, row.currency)}</dd>
            </>
          ) : null}
        </dl>
      ))}
    </section>
  );

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="rx-hero">
        <p className="rx-eyebrow">
          <a href="/roxi/hoy">{t('roxi.world.title')}</a>
        </p>
        <h1 className="rx-title">{t('roxi.business.title')}</h1>
        <p className="rx-lead">{t('roxi.business.lead')}</p>
      </section>
      {!available ? <p className="rx-banner is-warn">{t('roxi.memory.unavailable')}</p> : null}
      {query.done ? <p className="rx-banner is-good" role="status">{t('roxi.business.saved')}</p> : null}
      {errorKey ? <p className="rx-banner is-warn" role="alert">{t(errorKey, { limit: 0 })}</p> : null}

      {available ? (
        <>
          <div className="rx-cards">
            {block(t('roxi.business.today'), day)}
            {block(t('roxi.business.week'), week)}
            {block(t('roxi.business.month'), month)}
          </div>
          <p className="rx-small">{t('roxi.business.how')}</p>

          <section className="rx-section">
            <h2>{t('roxi.business.add')}</h2>
            <form action={recordBusinessAction} className="rx-form">
              <LocalTimeFields />
              <div className="rx-form-row">
                <label>
                  <span>{t('roxi.business.field.kind')}</span>
                  <select name="kind" defaultValue="sale">
                    {ENTRY_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`roxi.business.kind.${kind}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('roxi.business.field.amount')}</span>
                  <input name="amount" inputMode="decimal" required maxLength={14} />
                </label>
                <label>
                  <span>{t('roxi.business.field.currency')}</span>
                  <input name="currency" defaultValue={currency ?? ''} maxLength={3} required pattern="[A-Za-z]{3}" />
                </label>
              </div>
              <label>
                <span>{t('roxi.business.field.cost')}</span>
                <input name="cost" inputMode="decimal" maxLength={14} />
              </label>
              <label>
                <span>{t('roxi.business.field.note')}</span>
                <input name="note" maxLength={200} placeholder={t('roxi.business.field.note_hint')} />
              </label>
              <button type="submit" className="rx-cta">
                {t('roxi.business.save')}
              </button>
            </form>
          </section>

          <section className="rx-section">
            <h2>{t('roxi.business.history')}</h2>
            {entries.length === 0 ? <p className="rx-small">{t('roxi.business.nothing')}</p> : null}
            <ul className="rx-items">
              {entries.map((entry) => (
                <li key={entry.id} className={entry.voided ? 'is-done' : undefined}>
                  <span className="rx-dot" aria-hidden="true">
                    {entry.kind === 'sale' || entry.kind === 'paid_to_me' ? '+' : entry.kind === 'owed_to_me' || entry.kind === 'i_owe' ? '·' : '−'}
                  </span>
                  <div className="rx-item-body">
                    <p className="rx-item-title">
                      {t(`roxi.business.kind.${entry.kind}` as MessageKey)} · {money(entry.amount, entry.currency)}
                      {entry.cost !== null ? ` (${t('roxi.business.cost_was', { amount: money(entry.cost, entry.currency) })})` : ''}
                    </p>
                    <p className="rx-small">
                      {new Date(`${entry.day}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                      {entry.note ? ` · ${entry.note}` : ''}
                      {entry.voided ? ` · ${t('roxi.business.voided')}` : ''}
                    </p>
                  </div>
                  {!entry.voided ? (
                    <form action={voidBusinessAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" className="rx-icon" aria-label={t('roxi.business.void')} title={t('roxi.business.void')}>
                        ×
                      </button>
                    </form>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
