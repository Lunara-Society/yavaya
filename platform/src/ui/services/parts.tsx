import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { ProviderSummary, RequestCard as RequestCardView } from '@/server/domains/services/service';
import { SERVICE_CATEGORIES } from '@/config/services';
import { Icon, type IconName } from '@/ui/site/icons';
import { formatDate } from '@/ui/mercadito/format';

/**
 * Servicios' shared pieces. The request board is a list of needs, urgent
 * first; a provider is shown by their record — reputation, reviews and a
 * licence badge that says exactly what was checked.
 */

export function categoryName(t: Translator, key: string): string {
  return t(`services.category.${key}` as MessageKey);
}

export function CategoryIcon({ category }: { category: string }) {
  const icon = SERVICE_CATEGORIES.find((c) => c.key === category)?.icon ?? 'services';
  return <Icon name={icon as IconName} />;
}

export function RequestCard({ request, t, locale }: { request: RequestCardView; t: Translator; locale: string }) {
  return (
    <article className={request.urgent && request.status === 'open' ? 'sv-request sv-urgent' : 'sv-request'}>
      <span className="sv-icon" aria-hidden="true">
        <CategoryIcon category={request.category} />
      </span>
      <div className="sv-request-text">
        <p className="sv-kicker">
          {request.urgent && request.status === 'open' ? <span className="sv-today">{t('services.urgent.badge')}</span> : null}
          {categoryName(t, request.category)}
          {request.status !== 'open' ? ` · ${t(`services.status.${request.status}` as MessageKey)}` : ''}
        </p>
        <h3 className="sv-title">
          <Link href={`/services/requests/${request.id}`}>{request.title}</Link>
        </h3>
        <p className="sv-body">{request.body}</p>
        <p className="sv-meta">
          {request.isMine ? t('services.request.yours') : (request.requesterName ?? t('services.request.name_hidden'))} · {request.placeName} ·{' '}
          {formatDate(request.createdAt, locale)}
          {request.responseCount > 0 ? ` · ${request.responseCount === 1 ? t('services.request.responses_one') : t('services.request.responses', { count: request.responseCount })}` : ''}
        </p>
      </div>
    </article>
  );
}

/** What a reviewer checked, in plain words. "Pending" is never shown as verified. */
export function LicenceBadge({ status, t }: { status: ProviderSummary['licenceStatus']; t: Translator }) {
  if (status === 'none') return null;
  return <span className={`sv-licence sv-licence-${status}`}>{t(`services.licence.${status}` as MessageKey)}</span>;
}

export function ProviderLine({ provider, t }: { provider: ProviderSummary; t: Translator }) {
  return (
    <div className="sv-provider">
      <p className="sv-provider-name">
        <Link href={`/services/providers/${provider.yayId}`}>{provider.displayName}</Link>
        {provider.availableToday ? <span className="sv-today">{t('services.provider.available_badge')}</span> : null}
        <LicenceBadge status={provider.licenceStatus} t={t} />
      </p>
      <p className="sv-meta">
        {provider.headline} · {provider.placeName}
      </p>
      <p className="sv-meta">
        {t('services.provider.reputation', { score: provider.reputation })}
        {' · '}
        {provider.reviewCount === 0
          ? t('services.provider.no_reviews')
          : t('services.provider.rating', { rating: provider.averageRating ?? 0, count: provider.reviewCount })}
      </p>
    </div>
  );
}
