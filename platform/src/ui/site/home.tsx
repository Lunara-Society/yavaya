import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import { GUIDE_SECONDS, guideFiles } from '@/config/guide';
import { MERCADITO_RULES } from '@/config/business-rules';
import type { Opportunity } from '@/server/domains/discovery/recent';
import { formatPrice } from '@/ui/mercadito/format';
import { DistrictScene, MarketScene, SellerScene } from './art';
import { DISTRICT_IDS, PAGE_PATHS, districtState, type DistrictId } from './blocks';
import { Icon, type IconName } from './icons';

/**
 * The home page: a market street at sunset with one search in it, Mercadito
 * as the way in, the seven districts, what has really been posted lately,
 * and why it can be trusted.
 *
 * Every figure on it is real or absent. The search is Mercadito's own and
 * says so; the recent list is read from the districts' public listings and,
 * while nothing has been posted, says exactly that instead of showing
 * examples.
 */

type HomeProps = {
  c: SiteContent;
  t: Translator;
  locale: string;
  signedIn: boolean;
  opportunities: Opportunity[];
  now?: Date;
};

/** The hero's shortcuts: buying first, then every district by its own name. */
const SHORTCUTS: ReadonlyArray<{ id: DistrictId; buy?: true }> = [
  { id: 'mercadito', buy: true },
  { id: 'services' },
  { id: 'work' },
  { id: 'community' },
  { id: 'yavayago' },
  { id: 'sanctuary' },
  { id: 'animals' },
];

/**
 * The gallery's shape (site.css, "The seven districts"): Mercadito, the way
 * in, is the flagship — full width on a phone, a tall half on a wide screen.
 * The other six go two to a row on a phone; on a wide screen four of them
 * stand beside Mercadito and the last two share the closing row. Seven
 * districts make that one flagship and an even six, so no card is left
 * alone at the bottom.
 */
const FLAGSHIP: DistrictId = 'mercadito';
const CLOSING_ROW: readonly DistrictId[] = ['sanctuary', 'animals'];

/** How wide each photograph is shown, so a phone never fetches one twice the size it displays. */
function districtSizes(id: DistrictId): string {
  if (id === FLAGSHIP) return '(min-width: 1000px) 50vw, 100vw';
  return CLOSING_ROW.includes(id) ? '50vw' : '(min-width: 1000px) 25vw, 50vw';
}

const TOPIC_KEY: Record<Opportunity['kind'], string> = {
  listing: 'mercadito.category',
  job: 'work.field',
  animal: 'animals.species',
  store: 'go.category',
};

const KIND_ICON: Record<Opportunity['kind'], IconName> = { listing: 'tag', job: 'work', animal: 'animals', store: 'store' };

function ago(t: Translator, at: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return t('home.recent.ago_now');
  if (minutes < 60) return t('home.recent.ago_minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('home.recent.ago_hours', { count: hours });
  return t('home.recent.ago_days', { count: Math.floor(hours / 24) });
}

export function HomeBody({ c, t, locale, signedIn, opportunities, now = new Date() }: HomeProps) {
  const guide = guideFiles('guia');
  const guideMinutes = Math.ceil(GUIDE_SECONDS.guia / 60);
  return (
    <>
      <section className="hm-hero">
        <MarketScene className="hm-hero-art" />
        <div className="wrap hm-hero-in">
          <p className="eyebrow">{t('home.hero.eyebrow')}</p>
          <h1 className="hm-title">
            <span>{t('home.hero.title_1')}</span> <span>{t('home.hero.title_2')}</span>
          </h1>
          <p className="hm-lead">{t('home.hero.lead')}</p>
          {/* Mercadito's own search, and labelled as such: nothing else on Yavaya is searchable from here yet. */}
          <form className="hm-search" action={PAGE_PATHS.mercadito} method="get" role="search">
            <label className="sr-only" htmlFor="hm-q">
              {t('home.search.label')}
            </label>
            <Icon name="search" className="hm-search-icon" />
            <input id="hm-q" type="search" name="q" maxLength={80} placeholder={t('home.search.placeholder')} enterKeyHint="search" autoComplete="off" />
            <span className="hm-search-scope" aria-hidden="true">
              {t('home.search.scope')}
            </span>
            <button type="submit" className="hm-search-go" aria-label={t('home.search.label')}>
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <nav className="hm-shortcuts" aria-label={t('home.shortcuts.label')}>
            {SHORTCUTS.map(({ id, buy }) => (
              <Link key={id} className={`hm-shortcut tone-${id}`} href={PAGE_PATHS[id]}>
                <Icon name={id} />
                <span>{buy ? t('home.shortcut.buy') : c.districts[id].name}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="hm-band hm-band-forest" aria-labelledby="hm-mk-title">
        <div className="wrap hm-feature">
          <article className="hm-mk tone-mercadito">
            <Link className="hm-mk-photo" href={PAGE_PATHS.mercadito} tabIndex={-1} aria-hidden="true">
              <SellerScene sizes="(min-width: 1000px) 34vw, 100vw" />
              <span className="hm-mk-badge">{t('home.mk.badge')}</span>
            </Link>
            <div className="hm-mk-text">
              <h2 id="hm-mk-title" className="hm-mk-title">
                <span className="hm-icon-ring" aria-hidden="true">
                  <Icon name="mercadito" />
                </span>
                {c.districts.mercadito.name}
              </h2>
              <p>{t('home.mk.text')}</p>
              <div className="btn-row">
                <Link className="btn btn-gold" href={PAGE_PATHS.mercadito}>
                  {t('home.mk.explore')} <span aria-hidden="true">→</span>
                </Link>
                <Link className="btn btn-line" href="/mercadito/publish">
                  {t('home.mk.publish')}
                </Link>
              </div>
              <p className="hm-fine">{t('mercadito.opening.free', { count: MERCADITO_RULES.freeOpenListings })}</p>
            </div>
          </article>
          <Link className="hm-guide" href="/guia">
            {/* eslint-disable-next-line @next/next/no-img-element -- a poster from /public, pre-sized */}
            <img src={guide.posterWebp} srcSet={guide.posterSet} sizes="(min-width: 1000px) 22vw, 100vw" width={1280} height={720} alt="" loading="lazy" decoding="async" />
            <span className="hm-guide-text">
              <span className="hm-guide-eyebrow">{t('home.guide.eyebrow', { minutes: guideMinutes })}</span>
              <strong>
                <span className="hm-play" aria-hidden="true">
                  ▶
                </span>{' '}
                {t('home.guide.title')}
              </strong>
              <span>{t('home.guide.text')}</span>
              <span className="hm-guide-cta">
                {t('home.guide.cta')} <span aria-hidden="true">→</span>
              </span>
            </span>
          </Link>
        </div>
      </section>

      <section className="hm-band hm-band-districts" id="distritos" aria-labelledby="hm-d-title">
        <div className="wrap">
          <div className="hm-head">
            <div>
              <p className="eyebrow">{t('home.districts.eyebrow')}</p>
              <h2 id="hm-d-title" className="hm-h2">
                <span>{t('home.districts.title_1')}</span> <span>{t('home.districts.title_2')}</span>
              </h2>
            </div>
            <Link className="btn btn-line hm-head-link" href={PAGE_PATHS.districts}>
              {t('home.districts.all')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="hm-districts">
            {DISTRICT_IDS.map((id) => {
              const state = districtState(id);
              return (
                // The card wears its district's colour world (worlds.css): a window into the place it opens.
                <li key={id} className={`hm-d hm-d-${id}`}>
                  <Link className={`hm-d-card tone-${id}`} href={PAGE_PATHS[id]}>
                    <span className="hm-d-photo">
                      <DistrictScene id={id} sizes={districtSizes(id)} />
                    </span>
                    <span className="hm-d-body">
                      <span className="hm-d-name">
                        <span className="hm-icon-ring" aria-hidden="true">
                          <Icon name={id} />
                        </span>
                        {c.districts[id].name}
                      </span>
                      <span className="hm-d-tag">{c.districts[id].tagline}</span>
                      <span className={`hm-d-state is-${state}`}>
                        {c.ui.states[state]} · {c.districts[id].phase}
                      </span>
                      <span className="hm-d-go" aria-hidden="true">
                        →
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="hm-band hm-band-obsidian" aria-labelledby="hm-r-title">
        <div className="wrap hm-lower">
          <div className="hm-recent">
            <div className="hm-head">
              <div>
                <h2 id="hm-r-title" className="hm-h3">
                  {t('home.recent.title')}
                </h2>
                <p className="hm-sub">{t('home.recent.lead')}</p>
              </div>
              {opportunities.length > 0 ? (
                <Link className="btn btn-line hm-head-link" href={PAGE_PATHS.mercadito}>
                  {t('home.recent.see_all')} <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>
            {opportunities.length > 0 ? (
              <ul className="hm-opps">
                {opportunities.map((o) => (
                  <li key={`${o.kind}:${o.id}`}>
                    <Link className="hm-opp" href={o.href}>
                      {/* The icon stays under the photo, so a photo that fails to load leaves the kind showing, not a blank tile. */}
                      <span className="hm-opp-photo">
                        <Icon name={KIND_ICON[o.kind]} />
                        {o.photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- member photos from /media, already re-encoded
                          <img src={`/media/${o.photoId}`} alt="" loading="lazy" decoding="async" />
                        ) : null}
                        <span className="hm-opp-kind">{t(`home.recent.kind.${o.kind}` as MessageKey)}</span>
                      </span>
                      <span className="hm-opp-body">
                        <strong>{o.title}</strong>
                        <span className="hm-opp-meta">{t(`${TOPIC_KEY[o.kind]}.${o.topic}` as MessageKey)}</span>
                        <span className="hm-opp-meta">
                          {o.placeName} · {ago(t, o.at, now)}
                        </span>
                        {o.price ? <span className="hm-opp-price">{formatPrice(o.price.minor, o.price.currency, locale)}</span> : null}
                        {o.payText ? <span className="hm-opp-price">{o.payText}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hm-empty">
                <p className="hm-empty-title">{t('home.recent.empty_title')}</p>
                <p>{t('home.recent.empty_text')}</p>
                <div className="btn-row">
                  <Link className="btn btn-gold" href="/mercadito/publish">
                    {t('home.recent.publish_listing')}
                  </Link>
                  <Link className="btn btn-line" href={signedIn ? '/work/posts/new' : '/login'}>
                    {t('home.recent.publish_job')}
                  </Link>
                  <Link className="btn btn-line" href={signedIn ? '/services/provider' : '/login'}>
                    {t('home.recent.offer_services')}
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="hm-trust" aria-labelledby="hm-t-title">
            <h2 id="hm-t-title" className="hm-h3">
              <span>{t('home.trust.title_1')}</span> <span>{t('home.trust.title_2')}</span>
            </h2>
            <p className="hm-sub">{t('home.trust.text')}</p>
            <ul className="hm-trust-points">
              {(
                [
                  ['id', 'home.trust.one'],
                  ['star', 'home.trust.reputation'],
                  ['shield', 'home.trust.fraud'],
                  ['eye', 'home.trust.moderation'],
                ] as const
              ).map(([icon, key]) => (
                <li key={key}>
                  <Icon name={icon} />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <Link className="btn btn-line" href={PAGE_PATHS.trust}>
              {t('home.trust.cta')} <span aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>
      </section>
    </>
  );
}
