import type { MessageKey, Translator } from '@/i18n';
import type { TrustShield } from '@/server/domains/trust/shield';
import { Icon, type IconName } from '@/ui/site/icons';

/**
 * Badges as symbols — "humans remember symbols" (Master Bible). Each is
 * derived from the Trust Shield, so a badge can only be as true as the
 * evidence behind it. A badge not yet earned is shown as such, never hidden:
 * the path to earning it is part of the point.
 */
export function Medallions({ shield, t }: { shield: TrustShield; t: Translator }) {
  const standingEarned = shield.statusKey === 'trust.status.established' || shield.statusKey === 'trust.status.trusted';
  const medals: Array<{ icon: IconName; labelKey: MessageKey; earned: boolean }> = [
    { icon: 'check', labelKey: 'trust.email_verified', earned: shield.emailVerified },
    { icon: 'phone', labelKey: 'trust.phone_verified', earned: shield.phoneVerified },
    { icon: 'id', labelKey: 'trust.identity_verified', earned: shield.identityVerified },
    {
      icon: 'star',
      labelKey: standingEarned ? (shield.statusKey as MessageKey) : 'trust.status.established',
      earned: standingEarned,
    },
  ];
  return (
    <ul className="medals-row">
      {medals.map((medal) => (
        <li key={medal.labelKey} className={medal.earned ? 'earned' : undefined}>
          <span className="medal-disc">
            <Icon name={medal.icon} />
          </span>
          <span className="medal-name">{t(medal.labelKey)}</span>
          <span className="medal-state">{t(medal.earned ? 'profile.medal.earned' : 'profile.medal.not_yet')}</span>
        </li>
      ))}
    </ul>
  );
}
