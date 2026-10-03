import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { tokenPackages } from '@/server/db/schema';
import { AppShell } from '@/ui/components/app-shell';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import { getBalance, listLedgerEntries } from '@/server/domains/tokens/service';
import { countryRoutes, memberCountry, routeFor } from '@/server/domains/payments/routing';
import { myTokenPurchases } from '@/server/domains/payments/token-purchase';
import { isAdmin } from '@/server/domains/access/authorize';
import { buyTokensAction } from './actions';
import { packageSavingPercent, TOKEN_RULES } from '@/config/business-rules';
import type { MessageKey } from '@/i18n';

export const metadata: Metadata = { title: 'Tokens' };
export const dynamic = 'force-dynamic';

/**
 * Token balance, history and packages.
 *
 * The purchase section is the sharp edge of the honesty rule. Without a
 * configured payment provider the packages are shown for information and the
 * purchase control is **absent** — not disabled-looking-but-tappable, not a
 * button that opens a broken checkout. The capability badge says exactly why.
 *
 * With one, each package is a button to the provider's checkout. Coming back
 * from checkout proves nothing, so the page never says "paid" because of the
 * return address: it shows each purchase as the provider has confirmed it.
 */
export default async function TokensPage({ searchParams }: { searchParams: Promise<{ purchase?: string; error?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect('/login');
  const query = await searchParams;

  const [balance, entries, packages, purchases, country, countries] = await Promise.all([
    getBalance(db(), userId),
    listLedgerEntries(db(), userId, { limit: 50 }),
    db().select().from(tokenPackages).where(eq(tokenPackages.enabled, true)),
    myTokenPurchases(db(), userId, 5),
    memberCountry(db(), userId),
    countryRoutes(db(), locale),
  ]);
  // One id per page view: a double click on the same form is one purchase.
  const attempt = randomUUID();
  const errorKey = query.error && /^(payments\.error\.[a-z_]+|error\.[a-z_.]+)$/.test(query.error) ? (query.error as MessageKey) : null;

  // The member's country decides how they pay (config/payments.ts).
  const route = routeFor(country);
  const provider = route.status === 'ready' ? route.provider : null;
  // In a provider's test environment only administrators see the purchase
  // controls; everyone else sees what they would see with no provider at all.
  const testMode = Boolean(provider?.testMode?.());
  const paymentsReady = Boolean(provider) && (!testMode || (await isAdmin(db(), userId)));

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('tokens.name')}</h1>

      <section className="surface-card mt-4 p-5">
        <p className="text-sm text-[var(--text-muted)]">{t('tokens.balance')}</p>
        <p className="text-4xl font-semibold tabular-nums">{balance}</p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('tokens.description')}</p>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{t('tokens.packages')}</h2>
          <CapabilityBadge state={paymentsReady ? 'REAL' : 'REQUIRES_CONFIGURATION'} t={t} />
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {packages
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((pkg) => (
              <li key={pkg.key} className="surface-card p-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">{pkg.tokens}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formatPrice(pkg.priceMinor, pkg.currency)}
                </p>
                {packageSavingPercent(pkg, packages) > 0 ? (
                  <p className="mt-1 text-2xs font-semibold" style={{ color: 'var(--color-positive)' }}>
                    {t('payments.saving', { percent: packageSavingPercent(pkg, packages) })}
                  </p>
                ) : null}
                {paymentsReady && pkg.tokens <= TOKEN_RULES.maxTokensPerPurchase ? (
                  <form action={buyTokensAction} className="mt-3">
                    <input type="hidden" name="package" value={pkg.key} />
                    <input type="hidden" name="attempt" value={attempt} />
                    <button type="submit" className="btn btn-gold w-full">
                      {t('payments.buy')}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
        </ul>

        {query.purchase === 'paid' ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm font-semibold" role="status" style={{ borderColor: 'var(--color-positive)' }}>
            {t('payments.paid')}
          </p>
        ) : null}
        {query.purchase === 'failed' ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" role="alert" style={{ borderColor: 'var(--color-caution)' }}>
            {t('payments.failed')}
          </p>
        ) : null}
        {query.purchase === 'returned' ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" role="status">
            {t('payments.returned')}
          </p>
        ) : null}
        {query.purchase === 'cancelled' ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" role="status">
            {t('payments.cancelled')}
          </p>
        ) : null}
        {errorKey ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" role="alert" style={{ borderColor: 'var(--color-caution)' }}>
            {t(errorKey)}
          </p>
        ) : null}
        {paymentsReady && testMode ? (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-caution)' }}>
            {t('payments.test_mode')}
          </p>
        ) : null}
        {paymentsReady && provider ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{t(`payments.how.${provider.key}` as MessageKey)}</p>
        ) : (
          <p className="mt-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-caution)' }}>
            {route.status === 'pending'
              ? t('payments.country_pending', { method: t(`payments.method.${route.providerKey}` as MessageKey) })
              : t('tokens.purchase_unavailable')}
          </p>
        )}

        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {t('tokens.purchase_limit', { limit: TOKEN_RULES.maxTokensPerPurchase })}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">{t('payments.countries_title')}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('payments.countries_lead')}</p>
        <ul className="mt-3 divide-y rounded-xl border">
          {countries.map((row) => (
            <li
              key={row.iso}
              className="flex items-center justify-between gap-3 p-3"
              style={row.iso === country ? { background: 'var(--surface-2, rgba(127,127,127,0.08))' } : undefined}
            >
              <span className="min-w-0 text-sm font-medium">
                {row.name}
                {row.iso === country ? <span className="ml-2 text-2xs text-[var(--text-muted)]">{t('payments.your_country')}</span> : null}
              </span>
              <span className="shrink-0 text-right text-sm">
                {row.providerKey ? t(`payments.method.${row.providerKey}` as MessageKey) : '—'}
                <span className="block text-2xs" style={{ color: row.ready ? 'var(--color-positive)' : 'var(--text-muted)' }}>
                  {t(row.ready ? 'payments.country_ready' : 'payments.country_soon')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {purchases.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">{t('payments.purchases')}</h2>
          <ul className="mt-3 divide-y rounded-xl border">
            {purchases.map((purchase) => (
              <li key={purchase.reference} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t('payments.purchase_line', { tokens: purchase.tokens, price: formatPrice(purchase.amountMinor, purchase.currency) })}
                  </p>
                  <p className="text-2xs text-[var(--text-muted)]">
                    <time dateTime={purchase.createdAt.toISOString()}>{purchase.createdAt.toISOString().slice(0, 10)}</time> · {purchase.reference}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">{t(`payments.status.${purchase.status}` as MessageKey)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">{t('tokens.history')}</h2>
        {entries.length === 0 ? (
          <p className="mt-3 rounded-xl border px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            {t('common.empty')}
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(`tokens.reason.${entry.reason}` as MessageKey)}
                  </p>
                  <p className="text-2xs text-[var(--text-muted)]">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {entry.createdAt.toISOString().slice(0, 10)}
                    </time>
                    {entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: entry.delta > 0 ? 'var(--color-positive)' : 'var(--text-primary)' }}
                  >
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </p>
                  <p className="text-2xs tabular-nums text-[var(--text-muted)]">{entry.balanceAfter}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function formatPrice(minor: number, currency: string): string {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}
