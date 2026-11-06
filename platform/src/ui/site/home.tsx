import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import { BalconyScene, HomeCardScene, SanctuaryEmblem, ValleyScene } from './art';
import { PAGE_PATHS, districtState, type DistrictId } from './blocks';
import { Icon } from './icons';
import { LocationBar } from './location-bar';
import { FrontDoor } from '@/ui/roxi/front-door';
import type { locationBarProps } from './location-props';

/**
 * The home page, as the owner's design of 31 October 2026 draws it: the old
 * town at dusk from a balcony, one line and one search over it, the seven
 * districts as seven lit cards, and a quiet closing about the people it is for.
 *
 * Everything on it works or is not there. The search is Mercadito's and says
 * so — nothing else on Yavaya is searchable from one box yet, so the design's
 * "Buscar en todo Yavaya" would have promised what does not exist. The place
 * beside it is the visitor's real choice, the same one the header shows. A
 * district that is not open says so on its card. The closing makes no promise
 * of safety, only of what is there: one account, reputation, community and
 * moderation that can be seen.
 *
 * Styles: app/home.css, loaded by this page alone.
 */

/**
 * What starting out costs, read from the same settings and prices the
 * services charge by (tokens/uses.ts, startingFacts), so "free" is never
 * said of something an operator has since put a price on.
 */
export type HomeStarts = {
  /** Mercadito listings that may be open at once without a token. */
  mercaditoFree: number;
  /** Trabajo posts that may be open at once without a token. */
  workFree: number;
  /** Asking for a service costs nothing. */
  askFree: boolean;
  /** Answering a service request costs nothing. */
  answerFree: boolean;
};

type HomeProps = {
  c: SiteContent;
  t: Translator;
  signedIn: boolean;
  location: Awaited<ReturnType<typeof locationBarProps>>;
};

/**
 * The design's order: three cards, then four. On a tablet or a phone the list
 * becomes the design's editorial sequence — Mercadito wide, Servicios and
 * Trabajo side by side, YavayaGo wide, Comunidad and Animales side by side,
 * Santuario wide to close (home.css moves Santuario last there).
 */
const FIRST_ROW: readonly DistrictId[] = ['mercadito', 'services', 'work'];
const CARDS: readonly DistrictId[] = [...FIRST_ROW, 'yavayago', 'community', 'sanctuary', 'animals'];
const WIDE_ON_PHONE: readonly DistrictId[] = ['mercadito', 'yavayago', 'sanctuary'];

/** How wide each card's picture is shown, so a phone never fetches one twice the size it displays. */
function cardSizes(id: DistrictId): string {
  const desk = FIRST_ROW.includes(id) ? '(min-width: 1440px) 420px, (min-width: 1000px) 33vw' : '(min-width: 1440px) 320px, (min-width: 1000px) 25vw';
  return `${desk}, ${WIDE_ON_PHONE.includes(id) ? '100vw' : '50vw'}`;
}

/** The district emblems the design draws as marks (Santuario's is a photograph: SanctuaryEmblem). */
const GLYPHS: Record<Exclude<DistrictId, 'sanctuary'>, string> = {
  // A shopping bag.
  mercadito: '<path d="M5.6 8.4h12.8l-1.1 10.9a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M9 10.6V7.3a3 3 0 0 1 6 0v3.3"/>',
  // A wrench and a screwdriver, crossed.
  services:
    '<path d="M5.1 4.3a3.2 3.2 0 0 0 3.6 4.4l9.1 9.1a1.5 1.5 0 0 0 2.1-2.1L10.8 6.6a3.2 3.2 0 0 0-4.4-3.6l2 2-.5 1.5-1.5.5z"/><path d="M19.6 4.4l-4.4 4.4M13.6 10.4l-6.5 6.5"/><path d="M6 15.9l-2.3 3.5.9.9 3.5-2.3z"/>',
  // A briefcase with its clasp.
  work: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3.5 12.6h17"/><rect x="10.4" y="11.2" width="3.2" height="2.8" rx=".8"/>',
  // A motorbike.
  yavayago: '<circle cx="6" cy="16.6" r="3"/><circle cx="18" cy="16.6" r="3"/><path d="M6 16.6h5.6l2.6-5.1h2.4l1.4 5.1"/><path d="M8.2 11.5h4.1l1.4 2"/><path d="M14.4 8.4h2.4l.9 3.1"/>',
  // Three people together.
  community:
    '<circle cx="12" cy="7.4" r="2.6"/><circle cx="5.9" cy="9.6" r="2"/><circle cx="18.1" cy="9.6" r="2"/><path d="M7.4 19.6v-1.1a4.6 4.6 0 0 1 9.2 0v1.1z"/><path d="M2.6 18.6v-.7a3.3 3.3 0 0 1 4.5-3.1M21.4 18.6v-.7a3.3 3.3 0 0 0-4.5-3.1"/>',
  // A paw, filled.
  animals:
    '<g fill="currentColor" stroke="none"><ellipse cx="6.4" cy="10.6" rx="2" ry="2.5"/><ellipse cx="9.9" cy="6.4" rx="2" ry="2.6"/><ellipse cx="14.1" cy="6.4" rx="2" ry="2.6"/><ellipse cx="17.6" cy="10.6" rx="2" ry="2.5"/><path d="M12 11.4c-3 0-5.6 3.9-5.6 6.3 0 1.6 1.2 2.4 2.6 2.4 1.2 0 1.9-.6 3-.6s1.8.6 3 .6c1.4 0 2.6-.8 2.6-2.4 0-2.4-2.6-6.3-5.6-6.3z"/></g>',
};

function Glyph({ id }: { id: Exclude<DistrictId, 'sanctuary'> }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: GLYPHS[id] }} />;
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function HomeBody({ c, t, signedIn, location }: HomeProps) {
  return (
    <div className="hx-page">
      <section className="hx-hero" aria-labelledby="hx-title">
        <BalconyScene className="hx-stage-art" />
        <div className="wrap hx-hero-in">
          {/* The design's three lines, kept as lines: they are part of the picture's composition. */}
          <h1 id="hx-title" className="hx-title">
            <span>{t('home.hero.line_1')}</span> <span>{t('home.hero.line_2')}</span>{' '}
            <span>
              {t('home.hero.line_3')} <em>{t('home.hero.line_gold')}</em>
            </span>
          </h1>
          <p className="hx-lead">{t('home.hero.lead')}</p>
          {/* Mercadito's own search, and labelled as such; the place is the visitor's choice, the same as the header's. */}
          <form className="hx-search" id="buscar" action={PAGE_PATHS.mercadito} method="get" role="search">
            <label className="sr-only" htmlFor="hx-q">
              {t('home.search.label')}
            </label>
            <span className="hx-search-field">
              <Icon name="search" />
              <input id="hx-q" type="search" name="q" maxLength={80} placeholder={t('home.search.placeholder')} enterKeyHint="search" autoComplete="off" />
            </span>
            <span className="hx-search-place">
              <LocationBar {...location} detail />
            </span>
            <button type="submit" className="hx-search-go" aria-label={t('home.search.submit')}>
              <Arrow />
            </button>
          </form>
          {/*
           * "¿Qué necesitas hoy?" (the Roxi proposal of 6 November 2026): for a
           * signed-in member, five doors that open Roxi with the request already
           * said. A visitor sees the design exactly as drawn.
           */}
          {signedIn ? (
            <FrontDoor
              variant="hero"
              title={t('roxi.door.title')}
              doors={[
                { key: 'help', label: t('roxi.door.help'), ask: t('roxi.door.help_ask'), href: '/services/new' },
                { key: 'sell', label: t('roxi.door.sell'), ask: t('roxi.door.sell_ask'), href: '/mercadito/publish' },
                { key: 'work', label: t('roxi.door.work'), ask: t('roxi.door.work_ask'), href: '/work' },
                { key: 'community', label: t('roxi.door.community'), ask: t('roxi.door.community_ask'), href: '/community' },
                { key: 'talk', label: t('roxi.door.talk'), ask: '', href: '/roxi/hoy' },
              ]}
            />
          ) : null}
          {/* The ribbon's line, which the rest of the site shows under its header: what is open, one click from the whole answer. */}
          <p className="hx-status" role="note">
            <span className="hx-status-dot" aria-hidden="true" />
            <strong>{c.ui.ribbon.label}</strong>
            <Link href={PAGE_PATHS.status}>
              {c.ui.ribbon.link} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      <section className="hx-districts" id="distritos" aria-labelledby="hx-d-title">
        <div className="wrap">
          <div className="hx-d-head">
            <div>
              <p className="hx-eyebrow">{t('home.districts.eyebrow')}</p>
              <h2 id="hx-d-title" className="hx-h2">
                {t('home.districts.title')}
              </h2>
              <p className="hx-d-sub">{t('home.districts.sub')}</p>
            </div>
            <Link className="hx-pill" href={PAGE_PATHS.districts}>
              {t('home.districts.all')} <Arrow />
            </Link>
          </div>
          <ul className="hx-cards">
            {CARDS.map((id) => {
              const state = districtState(id);
              return (
                // The whole card is the way in; its colours are the design's for that district (home.css).
                <li key={id} className={`hx-card hx-card-${id}${WIDE_ON_PHONE.includes(id) ? ' is-wide' : ''}`}>
                  <Link className="hx-card-link" href={PAGE_PATHS[id]}>
                    <span className="hx-card-art">
                      <HomeCardScene id={id} sizes={cardSizes(id)} eager={FIRST_ROW.includes(id)} />
                    </span>
                    <span className="hx-emblem" aria-hidden="true">
                      {id === 'sanctuary' ? <SanctuaryEmblem /> : <Glyph id={id} />}
                    </span>
                    <span className="hx-card-text">
                      <span className="hx-card-name">{c.districts[id].name}</span>
                      <span className="hx-card-line">{t(`home.card.${id}` as MessageKey)}</span>
                      {/* All seven are open today; one that is not would say so here rather than look open. */}
                      {state === 'live' ? null : <span className={`hx-card-state is-${state}`}>{c.ui.states[state]}</span>}
                    </span>
                    <span className="hx-arrow" aria-hidden="true">
                      <Arrow />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="hx-closing" aria-labelledby="hx-c-title">
        <ValleyScene className="hx-closing-art" />
        <div className="wrap hx-closing-in">
          <p className="hx-eyebrow hx-eyebrow-center">{t('home.closing.eyebrow')}</p>
          <h2 id="hx-c-title" className="hx-h2 hx-closing-title">
            <span>{t('home.closing.title_1')}</span> <span>{t('home.closing.title_2')}</span> <span>{t('home.closing.title_3')}</span>
          </h2>
          <p className="hx-closing-text">
            <span>{t('home.closing.text_1')}</span> <span>{t('home.closing.text_2')}</span>
          </p>
          <ul className="hx-trust">
            <li>
              <Icon name="shield" />
              <span>{t('home.closing.one')}</span>
            </li>
            <li>
              <Icon name="star" />
              <span>{t('home.closing.reputation')}</span>
            </li>
            <li>
              <Glyph id="community" />
              <span>{t('home.closing.community')}</span>
            </li>
            <li>
              <Icon name="eye" />
              <span>{t('home.closing.moderation')}</span>
            </li>
          </ul>
          {/* The design's "Únete hoy" goes to registration; someone already signed in is taken to their own area instead. */}
          {signedIn ? (
            <Link className="hx-cta" href="/account">
              {t('nav.member_area')} <Arrow />
            </Link>
          ) : (
            <Link className="hx-cta" href="/register">
              {t('home.closing.join')} <Arrow />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
