import type { Translator, MessageKey } from '@/i18n';
import type { TrustShield } from '@/server/domains/trust/shield';

/**
 * Trust Shield.
 *
 * Renders exactly what the `TrustShield` type carries and nothing more. It
 * takes the built shield as a prop rather than fetching, so there is no path
 * by which a component could reach past the boundary and render a report, a
 * document or a moderation note.
 *
 * Verification states are shown as words plus a mark, never as colour alone.
 */
export function TrustShieldCard({ shield, t }: { shield: TrustShield; t: Translator }) {
  const checks: Array<{ labelKey: MessageKey; met: boolean }> = [
    { labelKey: 'trust.identity_verified', met: shield.identityVerified },
    { labelKey: 'trust.email_verified', met: shield.emailVerified },
    { labelKey: 'trust.phone_verified', met: shield.phoneVerified },
  ];

  return (
    <section className="surface-card p-4" aria-label={t('trust.shield')}>
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-sm tracking-wider text-[var(--text-secondary)]">{shield.yayId}</p>
        <p className="text-2xs font-semibold tracking-wide uppercase text-[var(--accent)]">
          {t(shield.statusKey as MessageKey)}
        </p>
      </header>

      <p className="mt-1 text-lg font-semibold">{shield.displayName}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--text-muted)]">{t('trust.score')}</dt>
          <dd className="text-base font-semibold tabular-nums">{shield.trustScore}/100</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t('trust.account_age')}</dt>
          <dd className="text-base font-semibold tabular-nums">
            {t('trust.account_age_days', { days: shield.accountAgeDays })}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--text-muted)]">{t('trust.transactions')}</dt>
          <dd className="text-base font-semibold tabular-nums">{shield.successfulTransactions}</dd>
        </div>
      </dl>

      <ul className="mt-4 flex flex-wrap gap-2">
        {checks.map((check) => (
          <li
            key={check.labelKey}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium"
            style={
              check.met
                ? { borderColor: 'var(--color-positive)', color: 'var(--color-positive)' }
                : { color: 'var(--text-muted)' }
            }
          >
            <span aria-hidden="true">{check.met ? '✓' : '—'}</span>
            {t(check.labelKey)}
          </li>
        ))}
      </ul>

      {shield.cautionKey ? (
        <p
          className="mt-4 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-caution)' }}
        >
          {t(shield.cautionKey as MessageKey)}
        </p>
      ) : null}
    </section>
  );
}
