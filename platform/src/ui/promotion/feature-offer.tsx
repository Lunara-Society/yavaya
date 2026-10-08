import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { Translator } from '@/i18n';
import { formatDate } from '@/ui/mercadito/format';

/**
 * "Destacar" for an owner: the price and their balance up front, one button,
 * and — when they cannot pay — the free way to get tokens (inviting friends)
 * before the way to buy them. Used by Trabajo and YavayaGo.
 */
export function FeatureOffer({
  t,
  locale,
  action,
  hidden,
  featuredUntil,
  cost,
  balance,
  days,
  outcome,
  titleKey,
  bodyKey,
}: {
  t: Translator;
  locale: string;
  action: (formData: FormData) => Promise<void>;
  /** The subject's id field, e.g. { postId: '…' }. */
  hidden: Record<string, string>;
  featuredUntil: Date | null;
  cost: number;
  balance: number;
  days: number;
  outcome: string | null;
  titleKey: 'promotion.title_post' | 'promotion.title_store';
  bodyKey: 'promotion.body_post' | 'promotion.body_store';
}) {
  const featured = featuredUntil !== null && featuredUntil.getTime() > Date.now();
  const enough = balance >= cost;
  return (
    <div className="mk-feature" id="destacar">
      <p className="mk-feature-h">
        {featured ? <span className="mk-featured-tag">{t('mercadito.feature.tag')}</span> : null}
        {featured ? t('mercadito.feature.active', { date: formatDate(featuredUntil!, locale) }) : t(titleKey)}
      </p>
      <p className="hint muted mb0">{t(bodyKey, { days })}</p>
      {outcome === 'ok' ? <p className="mk-banner mb0" role="status">{t('mercadito.feature.done')}</p> : null}
      {outcome === 'tokens' ? <p className="mk-error mb0" role="alert">{t('mercadito.feature.no_tokens')}</p> : null}
      {outcome === 'failed' ? <p className="mk-error mb0" role="alert">{t('mercadito.feature.failed')}</p> : null}
      {enough ? (
        <form action={action}>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="purchaseId" value={randomUUID()} />
          <button className="btn btn-gold" type="submit" style={{ width: '100%' }}>
            {t(featured ? 'mercadito.feature.extend' : 'mercadito.feature.buy', { cost, days })}
          </button>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="hint mb0">{t('mercadito.feature.balance', { balance, cost })}</p>
          <Link className="btn btn-gold" href="/account/invite">
            {t('mercadito.feature.invite')}
          </Link>
          <Link className="btn btn-line" href="/account/tokens#paquetes">
            {t('mercadito.feature.get_tokens')}
          </Link>
        </div>
      )}
    </div>
  );
}
