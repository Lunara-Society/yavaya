import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { tokenPackages } from '@/server/db/schema';
import { AppShell } from '@/ui/components/app-shell';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import { getBalance, listLedgerEntries } from '@/server/domains/tokens/service';
import { listProviderAvailability } from '@/server/domains/payments/service';
import { TOKEN_RULES } from '@/config/business-rules';
import type { MessageKey } from '@/i18n';

export const metadata: Metadata = { title: 'Tokens' };
export const dynamic = 'force-dynamic';

/**
 * Token balance, history and packages.
 *
 * The purchase section is the sharp edge of the honesty rule. No payment
 * provider is working, so the packages are shown for information and the
 * purchase control is **absent** — not disabled-looking-but-tappable, not a
 * button that opens a broken checkout. The capability badge says exactly why.
 */
export default async function TokensPage() {
  const { t, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect('/login');

  const [balance, entries, packages] = await Promise.all([
    getBalance(db(), userId),
    listLedgerEntries(db(), userId, { limit: 50 }),
    db().select().from(tokenPackages).where(eq(tokenPackages.enabled, true)),
  ]);

  const paymentsReady = listProviderAvailability().some((provider) => provider.available);
  const unavailableReason = listProviderAvailability().find((provider) => !provider.available)?.reason;

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

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {packages
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((pkg) => (
              <li key={pkg.key} className="surface-card p-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">{pkg.tokens}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formatPrice(pkg.priceMinor, pkg.currency)}
                </p>
              </li>
            ))}
        </ul>

        {paymentsReady ? null : (
          <p
            className="mt-3 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--color-caution)' }}
          >
            {t('tokens.purchase_unavailable')}
            {unavailableReason ? (
              <span className="mt-1 block text-[var(--text-muted)]">{unavailableReason}</span>
            ) : null}
          </p>
        )}

        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {t('tokens.purchase_limit', { limit: TOKEN_RULES.maxTokensPerPurchase })}
        </p>
      </section>

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}
