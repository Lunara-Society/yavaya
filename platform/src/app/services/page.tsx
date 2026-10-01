import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_KEYS, type ServiceCategoryKey } from '@/config/services';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { DistrictScene } from '@/ui/site/art';
import { CategoryIcon, RequestCard, categoryName } from '@/ui/services/parts';
import { getProviderProfile, listBoard } from '@/server/domains/services/service';
import { availabilityAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.services.name, description: c.pages.services.description };
}

/**
 * The request board. Urgent needs first, then the newest. Members only, like
 * the square: a request says where someone lives and what is wrong at home.
 */
export default async function ServicesBoard({ searchParams }: { searchParams: Promise<{ cat?: string; urgent?: string; page?: string; error?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const category = (SERVICE_CATEGORY_KEYS as readonly string[]).includes(params.cat ?? '') ? (params.cat as ServiceCategoryKey) : undefined;
  const urgentOnly = params.urgent === '1';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const [board, provider] = userId
    ? await Promise.all([listBoard(db(), { viewerId: userId, category, urgentOnly, page, locale }), getProviderProfile(db(), userId)])
    : [null, null];
  const availableToday = provider?.availableUntil ? provider.availableUntil > new Date() : false;
  const error = params.error && /^[a-z_.]+$/.test(params.error) ? params.error : null;
  const href = (next: { cat?: string; urgent?: boolean; page?: number }) => {
    const search = new URLSearchParams();
    if (next.cat) search.set('cat', next.cat);
    if (next.urgent) search.set('urgent', '1');
    if (next.page && next.page > 1) search.set('page', String(next.page));
    const text = search.toString();
    return text ? `/services?${text}` : '/services';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <section className="cm-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="services" priority />
        </div>
        <div className="wrap">
          <p className="eyebrow">{c.districts.services.name}</p>
          <h1>{t('services.board.title')}</h1>
          <p className="lead">{t('services.board.lead')}</p>
          <div className="btn-row">
            <Link className="btn btn-gold" href={member ? '/services/new' : '/login'}>
              {t('services.board.ask')}
            </Link>
            <Link className="btn btn-line" href={member ? '/services/provider' : '/login'}>
              {provider ? t('services.board.my_profile') : t('services.board.offer')}
            </Link>
            {member ? (
              <Link className="btn btn-line" href="/services/mine">
                {t('services.board.mine')}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingBottom: 56 }}>
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        {provider && provider.status === 'active' ? (
          <form action={availabilityAction} className={availableToday ? 'sv-available on' : 'sv-available'}>
            <input type="hidden" name="available" value={availableToday ? 'false' : 'true'} />
            <input type="hidden" name="back" value="board" />
            <div>
              <strong>{availableToday ? t('services.available.on') : t('services.available.off')}</strong>
              <p className="muted mb0">{t('services.available.explain')}</p>
            </div>
            <button className={availableToday ? 'btn btn-line' : 'btn btn-gold'} type="submit">
              {availableToday ? t('services.available.turn_off') : t('services.available.turn_on')}
            </button>
          </form>
        ) : null}

        {!board ? (
          <>
            <div className="sv-cats">
              {SERVICE_CATEGORIES.map((cat) => (
                <Link key={cat.key} className="sv-cat" href="/login">
                  <span className="sv-icon" aria-hidden="true">
                    <CategoryIcon category={cat.key} />
                  </span>
                  <span>
                    <strong>{categoryName(t, cat.key)}</strong>
                    <span className="muted">{t(`services.category.${cat.key}.examples` as MessageKey)}</span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="cm-gate card" style={{ marginTop: 24 }}>
              <p>{t('services.board.members_only')}</p>
              <div className="btn-row">
                <Link className="btn btn-gold" href="/login">
                  {t('community.square.sign_in')}
                </Link>
                <Link className="btn btn-line" href="/register">
                  {t('auth.submit_register')}
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <nav className="cm-tabs" aria-label={t('services.form.category')}>
              <Link href={href({ urgent: urgentOnly })} aria-current={category ? undefined : 'true'}>
                {t('community.square.all')}
              </Link>
              <Link href={href({ cat: category, urgent: !urgentOnly })} aria-current={urgentOnly ? 'true' : undefined} className="sv-tab-urgent">
                {t('services.urgent.badge')}
              </Link>
              {SERVICE_CATEGORIES.map((cat) => (
                <Link key={cat.key} href={href({ cat: cat.key, urgent: urgentOnly })} aria-current={category === cat.key ? 'true' : undefined}>
                  {categoryName(t, cat.key)}
                </Link>
              ))}
            </nav>
            {board.items.length === 0 ? (
              <div className="mk-empty">
                <p>{t('services.board.empty')}</p>
                <Link className="btn btn-gold" href={category ? `/services/new?cat=${category}` : '/services/new'}>
                  {t('services.board.ask')}
                </Link>
              </div>
            ) : (
              <div className="sv-list">
                {board.items.map((request) => (
                  <RequestCard key={request.id} request={request} t={t} locale={locale} />
                ))}
              </div>
            )}
            {board.page > 1 || board.hasMore ? (
              <nav className="mk-pager">
                {board.page > 1 ? (
                  <Link className="btn btn-line" href={href({ cat: category, urgent: urgentOnly, page: board.page - 1 })}>
                    {t('mercadito.browse.previous')}
                  </Link>
                ) : null}
                {board.hasMore ? (
                  <Link className="btn btn-line" href={href({ cat: category, urgent: urgentOnly, page: board.page + 1 })}>
                    {t('mercadito.browse.next')}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
        <p className="center mt">
          <Link href="/services/about">{t('services.board.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
