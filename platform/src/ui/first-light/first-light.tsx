import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { MessageKey, Translator } from '@/i18n';
import type { SiteContent } from '@/i18n/site';
import { PAGE_PATHS, districtState, type DistrictId } from '@/ui/site/blocks';
import { Icon } from '@/ui/site/icons';
import { LocationBar } from '@/ui/site/location-bar';
import type { locationBarProps } from '@/ui/site/location-props';
import { DistrictMark, Glyph, heroDoors } from '@/ui/site/home';
import { FrontDoor } from '@/ui/roxi/front-door';
import type { RoxiVisual } from '@/ui/roxi/state-bus';
import {
  DISTRICT_LIGHT,
  DOOR_HEIGHT,
  DOOR_WIDTHS,
  DOORS_WITH_PEOPLE,
  FL_PATH,
  GUARDIAN_FILE,
  GUARDIAN_LIGHTS,
  GUARDIAN_PARTS,
  GUARDIAN_WIDTHS,
  type GuardianVersion,
  HORIZON_TALL_WIDTHS,
  HORIZON_WIDTHS,
  flSrc,
  flSrcSet,
} from './assets';
import { FirstLightEngine } from './engine';
import { RoxiPresence } from './roxi-presence';
import { SoundToggle } from './sound-toggle';

/**
 * The First Light: the cinematic home page (docs/FIRST-LIGHT.md). It is the
 * home page while the owner's switch says so (Admin → Diseño del sitio), and
 * the preview at /first-light while it does not.
 *
 * The same things as the home page, and only true ones: Mercadito's search
 * labelled as Mercadito's, the visitor's real place, the seven districts each
 * leading into itself (one that is not open says so), Roxi for a member, and
 * no counts, activity or people that do not exist.
 *
 * Everything is in this markup; the client pieces add behaviour to it
 * (engine.tsx), the sound switch and Roxi's presence. The pictures are
 * decorative and hidden from assistive technology; the ones with people in
 * them say "Ilustración".
 *
 * Styles: app/first-light/first-light.css, loaded by the two pages that show it.
 */

/** The doors, in the home page's order. */
const DOORS: readonly DistrictId[] = ['mercadito', 'services', 'work', 'yavayago', 'community', 'sanctuary', 'animals'];

/** The Guardian is shown about this wide: most of a phone (its wings run off the edges, as in the artwork), a column on a desktop. */
const GUARDIAN_SIZES = '(min-width: 1000px) min(56vh, 620px), 112vw';
const DOOR_SIZES = '(min-width: 1100px) 360px, 74vw';
const ROXI_STATES: readonly RoxiVisual[] = ['unavailable', 'idle', 'listening', 'understanding', 'processing', 'searching', 'responding', 'awaiting', 'completed', 'error'];

type Props = {
  c: SiteContent;
  t: Translator;
  signedIn: boolean;
  location: Awaited<ReturnType<typeof locationBarProps>>;
  /** At /first-light while the home page is another: says it is a preview, with the way to the home page. */
  preview?: boolean;
  /** The owner's choice of Guardian (Admin → Diseño del sitio). */
  guardian?: GuardianVersion;
};

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function Picture({ name, widths, sizes, width, height, className, loading, priority }: { name: string; widths: readonly number[]; sizes: string; width: number; height: number; className?: string; loading?: 'lazy' | 'eager'; priority?: boolean }) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={flSrcSet(name, widths, 'avif')} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
      <img src={flSrc(name, widths[Math.min(1, widths.length - 1)] ?? 640)} srcSet={flSrcSet(name, widths, 'webp')} sizes={sizes} width={width} height={height} alt="" loading={loading} fetchPriority={priority ? 'high' : undefined} decoding="async" />
    </picture>
  );
}

export function FirstLightBody({ c, t, signedIn, location, preview = false, guardian = 'second' }: Props) {
  // The first Guardian's light maps and eye glow; the second is shown exactly as drawn, with none (assets.ts).
  const lit = guardian === 'first';
  const roxiLabels = {
    name: t('firstlight.roxi.name'),
    talk: t('firstlight.roxi.talk'),
    visitor: t('firstlight.roxi.visitor'),
    enter: t('firstlight.roxi.enter'),
    ...(Object.fromEntries(ROXI_STATES.map((state) => [state, t(`firstlight.roxi.state.${state}` as MessageKey)])) as Record<RoxiVisual, string>),
  };
  return (
    <div className="fl" data-fl data-tier="lite">
      <section className="fl-hero" data-fl-hero aria-labelledby="fl-title">
        <div className="fl-sky" aria-hidden="true">
          <picture className="fl-horizon">
            <source media="(max-aspect-ratio: 4/5)" type="image/avif" srcSet={flSrcSet('horizon-tall', HORIZON_TALL_WIDTHS, 'avif')} sizes="100vw" />
            <source media="(max-aspect-ratio: 4/5)" type="image/webp" srcSet={flSrcSet('horizon-tall', HORIZON_TALL_WIDTHS, 'webp')} sizes="100vw" />
            <source type="image/avif" srcSet={flSrcSet('horizon', HORIZON_WIDTHS, 'avif')} sizes="100vw" />
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized, served from /public */}
            <img src={flSrc('horizon', 1600)} srcSet={flSrcSet('horizon', HORIZON_WIDTHS, 'webp')} sizes="100vw" width={1600} height={900} alt="" fetchPriority="high" decoding="async" />
          </picture>
          <span className="fl-sun" />
          <span className="fl-mist fl-mist-a" />
          <span className="fl-mist fl-mist-b" />
        </div>

        {/* The Guardian of the First Light: the approved artwork in four layers, put back exactly as drawn. */}
        <div className="fl-guardian" data-fl-guardian={guardian} aria-hidden="true">
          <span className="fl-aura" />
          {GUARDIAN_PARTS.map((part) => (
            <Picture key={part} className={`fl-g fl-g-${part}`} name={`${GUARDIAN_FILE[guardian]}-${part}`} widths={GUARDIAN_WIDTHS} sizes={GUARDIAN_SIZES} width={840} height={840} priority={part === 'body'} />
          ))}
          {lit ? (
            <>
              {GUARDIAN_LIGHTS.map((light) => (
                <span key={light} className={`fl-g-light fl-g-${light}`} />
              ))}
              <span className="fl-g-sweep">
                <span className="fl-g-band" />
              </span>
              <span className="fl-eye" />
            </>
          ) : null}
        </div>
        <div className="fl-shade" aria-hidden="true" />

        <div className="wrap fl-hero-in">
          <p className="fl-eyebrow">
            <span className="fl-rule" aria-hidden="true" />
            {t('firstlight.hero.eyebrow')}
            <span className="fl-rule" aria-hidden="true" />
          </p>
          <h1 id="fl-title" className="fl-title">
            <span>{t('home.hero.line_1')}</span> <span>{t('home.hero.line_2')}</span>{' '}
            <span>
              {t('home.hero.line_3')} <em>{t('home.hero.line_gold')}</em>
            </span>
          </h1>
          <p className="fl-lead">{t('home.hero.lead')}</p>
          {/* Mercadito's own search, labelled as such, beside the visitor's real place. */}
          <form className="fl-search" action={PAGE_PATHS.mercadito} method="get" role="search">
            <label className="sr-only" htmlFor="fl-q">
              {t('home.search.label')}
            </label>
            <span className="fl-search-field">
              <Icon name="search" />
              <input id="fl-q" type="search" name="q" maxLength={80} placeholder={t('home.search.placeholder')} enterKeyHint="search" autoComplete="off" />
            </span>
            <span className="fl-search-place">
              <LocationBar {...location} detail />
            </span>
            <button type="submit" className="fl-search-go" aria-label={t('home.search.submit')} data-fl-magnetic>
              <Arrow />
            </button>
          </form>
          {signedIn ? <FrontDoor variant="hero" title={t('roxi.door.title')} doors={heroDoors(t)} /> : null}
          <div className="fl-hero-foot">
            <RoxiPresence labels={roxiLabels} signedIn={signedIn} enterHref={preview ? `/login?next=${FL_PATH}` : '/login?next=/'} />
            <p className="fl-status" role="note">
              <span className="fl-status-dot" aria-hidden="true" />
              <strong>{c.ui.ribbon.label}</strong>
              <Link href={PAGE_PATHS.status}>
                {c.ui.ribbon.link} <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
        </div>

        <div className="fl-corner">
          {preview ? (
            <p className="fl-preview">
              {t('firstlight.preview.label')} · <Link href="/">{t('firstlight.preview.current')}</Link>
            </p>
          ) : null}
          <SoundToggle name={t('firstlight.sound.name')} onText={t('firstlight.sound.on')} offText={t('firstlight.sound.off')} />
        </div>
      </section>

      <section className="fl-doors-sec" id="distritos" aria-labelledby="fl-d-title">
        <div className="wrap">
          <div className="fl-d-head">
            <div>
              <p className="fl-eyebrow fl-eyebrow-left">
                <span className="fl-rule" aria-hidden="true" />
                {t('home.districts.eyebrow')}
              </p>
              <h2 id="fl-d-title" className="fl-h2">
                {t('home.districts.title')}
              </h2>
              <p className="fl-d-sub">{t('firstlight.doors.sub')}</p>
            </div>
            <Link className="fl-pill" href={PAGE_PATHS.districts}>
              {t('home.districts.all')} <Arrow />
            </Link>
          </div>
          <ul className="fl-doors" data-fl-doors>
            {DOORS.map((id, index) => {
              const state = districtState(id);
              return (
                <li key={id} className={`fl-door-item fl-door-${id}`} style={{ '--acc': DISTRICT_LIGHT[id] } as CSSProperties}>
                  <a className="fl-door" href={PAGE_PATHS[id]} data-fl-door data-acc={DISTRICT_LIGHT[id]} data-pitch={index}>
                    <span className="fl-door-frame" data-fl-door-frame>
                      <Picture name={`door-${id}`} widths={DOOR_WIDTHS} sizes={DOOR_SIZES} width={720} height={DOOR_HEIGHT[720]} loading="lazy" />
                      {DOORS_WITH_PEOPLE.has(id) ? <span className="art-note" aria-hidden="true" /> : null}
                      <svg className="fl-door-arch" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                        <path className="fl-arch-inlay" d="M1 149 V50 A49 49 0 0 1 99 50 V149" vectorEffect="non-scaling-stroke" />
                        <path className="fl-arch-light" d="M1 149 V50 A49 49 0 0 1 99 50 V149" pathLength={1} vectorEffect="non-scaling-stroke" />
                      </svg>
                    </span>
                    <span className="fl-door-text">
                      <span className="fl-door-mark" aria-hidden="true">
                        <DistrictMark id={id} />
                      </span>
                      <span className="fl-door-name">{c.districts[id].name}</span>
                      <span className="fl-door-line">{t(`home.card.${id}` as MessageKey)}</span>
                      {state === 'live' ? null : <span className={`fl-door-state is-${state}`}>{c.ui.states[state]}</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="fl-closing" aria-labelledby="fl-c-title">
        <div className="wrap fl-closing-in">
          <p className="fl-eyebrow">
            <span className="fl-rule" aria-hidden="true" />
            {t('home.closing.eyebrow')}
            <span className="fl-rule" aria-hidden="true" />
          </p>
          <h2 id="fl-c-title" className="fl-h2 fl-closing-title">
            <span>{t('home.closing.title_1')}</span> <span>{t('home.closing.title_2')}</span> <span>{t('home.closing.title_3')}</span>
          </h2>
          <p className="fl-closing-text">
            <span>{t('home.closing.text_1')}</span> <span>{t('home.closing.text_2')}</span>
          </p>
          <ul className="fl-trust">
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
          {signedIn ? (
            <Link className="fl-cta" href="/account" data-fl-magnetic>
              {t('nav.member_area')} <Arrow />
            </Link>
          ) : (
            <Link className="fl-cta" href="/register" data-fl-magnetic>
              {t('home.closing.join')} <Arrow />
            </Link>
          )}
        </div>
      </section>

      <FirstLightEngine />
    </div>
  );
}
