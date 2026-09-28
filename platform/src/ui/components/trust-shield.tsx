import type { Translator, MessageKey } from '@/i18n';
import type { TrustShield } from '@/server/domains/trust/shield';
import { REPUTATION_RULES } from '@/config/business-rules';
import { Guilloche } from '@/ui/site/art';

/**
 * Trust Shield.
 *
 * Renders exactly what the `TrustShield` type carries and nothing more. It
 * takes the built shield as a prop rather than fetching, so there is no path
 * by which a component could reach past the boundary and render a report, a
 * document or a moderation note.
 *
 * Verification states are shown as words plus a mark, never as colour alone.
 *
 * Drawn as an identity card — navy, gold edge, a guilloché security pattern —
 * because that is what it is: the member's Yavaya identity, shown to others.
 */
export function TrustShieldCard({ shield, t }: { shield: TrustShield; t: Translator }) {
  const checks: Array<{ labelKey: MessageKey; met: boolean }> = [
    { labelKey: 'trust.identity_verified', met: shield.identityVerified },
    { labelKey: 'trust.email_verified', met: shield.emailVerified },
    { labelKey: 'trust.phone_verified', met: shield.phoneVerified },
  ];

  // The score as a share of a 270° arc: a meter people read at a glance,
  // with the number itself always printed beside it.
  const share = Math.max(0, Math.min(1, shield.trustScore / REPUTATION_RULES.maximumScore));
  const radius = 44;
  const arc = 2 * Math.PI * radius * 0.75;

  return (
    <section className="idcard" aria-label={t('trust.shield')}>
      <Guilloche className="idcard-seal" size={360} lobes={30} rings={9} strokeWidth={0.5} />
      <header className="idcard-top">
        <span className="idcard-brand">YAVAYA</span>
        <span className="idcard-status">{t(shield.statusKey as MessageKey)}</span>
      </header>

      <div className="idcard-main">
        <div>
          <p className="idcard-name">{shield.displayName}</p>
          <p className="idcard-id">{shield.yayId}</p>
        </div>
        <figure className="idcard-meter" aria-label={`${t('trust.score')}: ${shield.trustScore}/${REPUTATION_RULES.maximumScore}`}>
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle cx="50" cy="50" r={radius} className="idcard-meter-track" strokeDasharray={`${arc} 999`} transform="rotate(135 50 50)" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="idcard-meter-fill"
              strokeDasharray={`${arc * share} 999`}
              transform="rotate(135 50 50)"
            />
          </svg>
          <figcaption>
            <strong>{shield.trustScore}</strong>
            <span>/{REPUTATION_RULES.maximumScore}</span>
          </figcaption>
        </figure>
      </div>

      <dl className="idcard-facts">
        <div>
          <dt>{t('trust.account_age')}</dt>
          <dd>{t('trust.account_age_days', { days: shield.accountAgeDays })}</dd>
        </div>
        <div>
          <dt>{t('trust.transactions')}</dt>
          <dd>{shield.successfulTransactions}</dd>
        </div>
      </dl>

      <ul className="idcard-checks">
        {checks.map((check) => (
          <li key={check.labelKey} className={check.met ? 'met' : undefined}>
            <span aria-hidden="true">{check.met ? '✓' : '—'}</span>
            {t(check.labelKey)}
          </li>
        ))}
      </ul>

      {shield.cautionKey ? <p className="idcard-caution">{t(shield.cautionKey as MessageKey)}</p> : null}
    </section>
  );
}
