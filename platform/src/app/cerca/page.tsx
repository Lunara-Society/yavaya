import type { Metadata } from 'next';
import Link from 'next/link';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { NEARBY_RULES } from '@/config/business-rules';
import { BOARD_DISTRICTS } from '@/config/boards';
import { DISTRICTS } from '@/config/districts';
import { nearbyBoardPosts, placePoint } from '@/server/domains/boards/service';
import { chosenPlace } from '@/server/place-choice';
import { placeByCode } from '@/server/domains/geography/places';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PostRow } from '@/ui/boards/pages';
import { LocateButton } from './locate';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('nearby.title'), description: t('nearby.lead') };
}

/** A coordinate from the address bar, or nothing: two decimals (about a kilometre) is all this page ever uses. */
function coordinate(value: string | undefined, limit: number): number | null {
  if (!value || !/^-?\d{1,3}(\.\d{1,6})?$/.test(value)) return null;
  const n = Number(value);
  return Math.abs(n) <= limit ? Math.round(n * 100) / 100 : null;
}

/**
 * "Cerca de mí": the open posts of every board district around the visitor,
 * nearest first. The point is either the visitor's location, shared for this
 * search only (it travels in the address and is never stored), or the town
 * they chose for the site. Posts are placed at their town's centre, and the
 * page says so.
 */
export default async function NearbyPage({ searchParams }: { searchParams: Promise<{ lat?: string; lng?: string; place?: string; r?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const radius = (NEARBY_RULES.radiiKm as readonly number[]).includes(Number(params.r)) ? Number(params.r) : NEARBY_RULES.defaultRadiusKm;

  const lat = coordinate(params.lat, 90);
  const lng = coordinate(params.lng, 180);
  let point: { latitude: number; longitude: number } | null = lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null;
  let placeName: string | null = null;
  let placeCode: string | null = null;
  if (!point) {
    const place = params.place && /^[a-z0-9._-]{2,80}$/.test(params.place) ? await placeByCode(db(), params.place, locale) : await chosenPlace(locale);
    if (place) {
      point = await placePoint(db(), place.code);
      placeName = place.name;
      placeCode = place.code;
    }
  }
  const posts = point ? await nearbyBoardPosts(db(), { ...point, radiusKm: radius, viewerId: userId, locale, limit: NEARBY_RULES.limit }) : [];
  const keep = (r: number) => {
    const search = new URLSearchParams();
    if (lat !== null && lng !== null) {
      search.set('lat', String(lat));
      search.set('lng', String(lng));
    } else if (placeCode) search.set('place', placeCode);
    search.set('r', String(r));
    return `/cerca?${search.toString()}`;
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="bd" data-board="nearby">
        <section className="bd-hero">
          <div className="wrap">
            <p className="eyebrow">{t('nav.districts' as MessageKey)}</p>
            <h1>{t('nearby.title')}</h1>
            <p className="lead">{t('nearby.lead')}</p>
            <LocateButton labels={{ use: t('nearby.use_location'), locating: t('nearby.locating'), denied: t('nearby.denied'), unsupported: t('nearby.unsupported') }} radius={radius} />
            <p className="muted bd-note">{t('nearby.privacy')}</p>
          </div>
        </section>
        <div className="wrap">
          {point ? (
            <>
              <h2 className="h-md">{placeName ? t('nearby.from_place', { place: placeName }) : t('nearby.from_point')}</h2>
              <nav className="bd-subs" aria-label={t('nearby.radius')}>
                {NEARBY_RULES.radiiKm.map((r) => (
                  <Link key={r} href={keep(r)} className={r === radius ? 'is-on' : undefined} aria-current={r === radius ? 'true' : undefined}>
                    {t('nearby.radius_km', { km: r })}
                  </Link>
                ))}
              </nav>
              {posts.length === 0 ? (
                <div className="bd-empty">
                  <p>{t('nearby.empty', { km: radius })}</p>
                  <Link className="btn btn-gold" href="/distritos">
                    {t('nearby.publish')}
                  </Link>
                </div>
              ) : (
                <ul className="bd-posts">
                  {posts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      base={`/${BOARD_DISTRICTS[post.district].slug}`}
                      t={t}
                      locale={locale}
                      extra={`${t(DISTRICTS[post.district].nameKey as MessageKey)} · ${post.distanceKm < 1.5 ? t('nearby.here') : t('nearby.distance', { km: Math.round(post.distanceKm) })}`}
                    />
                  ))}
                </ul>
              )}
              <p className="muted">{t('nearby.how')}</p>
            </>
          ) : (
            <p className="bd-empty">{t('nearby.no_point')}</p>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
