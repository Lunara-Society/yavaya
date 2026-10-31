import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { GO_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { LiveMap } from '@/ui/go/live-map';
import { driverCurrentOrder, mapStart, myStore } from '@/server/domains/go/service';
import { driverCurrentTrip, launchCity, tripStartCity } from '@/server/domains/go/trips';
import { myActiveDeliveries, publicMapSummary } from '@/server/domains/go/live-map';
import { liveMapLabels } from '../labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('go.live.meta_title'), description: t('go.live.meta_description') };
}

/**
 * Mapa en vivo: YavayaGo's map, open to anyone, with or without an account,
 * and with or without anything happening. With nothing on it, it says so and
 * offers a clearly labelled demonstration; it never fills itself with
 * invented drivers or orders.
 *
 * A signed-in member also sees their own order or trip on it, through the
 * same authorised tracking as its own page. Nobody else's.
 */
export default async function LiveMapPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const query = await searchParams;
  const { c, t, language, theme, member, userId } = await siteContext();
  const [first, launch, summary, mine, driverOrder, driverTrip, store] = await Promise.all([
    // The member's own place, else the launch city — where YavayaGo is actually running.
    tripStartCity(db(), userId),
    launchCity(db()),
    publicMapSummary(db()),
    userId ? myActiveDeliveries(db(), userId) : Promise.resolve([]),
    userId ? driverCurrentOrder(db(), userId) : Promise.resolve(null),
    userId ? driverCurrentTrip(db(), userId) : Promise.resolve(null),
    userId ? myStore(db(), userId) : Promise.resolve(null),
  ]);
  const start = first ? { latitude: first.latitude, longitude: first.longitude } : await mapStart(db(), userId);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <section className="lm-page">
        <div className="wrap lm-head">
          <div>
            <p className="eyebrow">{c.districts.yavayago.name}</p>
            <h1>{t('go.live.title')}</h1>
            <p className="lm-lead">{t('go.live.lead')}</p>
          </div>
          <p className="lm-head-links">
            <Link href="/yavayago">{t('go.live.back')}</Link>
            <Link href="/yavayago/viajes">{t('go.home.trips')}</Link>
          </p>
        </div>
        <LiveMap
          start={start}
          demoCenter={launch ? { latitude: launch.latitude, longitude: launch.longitude } : null}
          initial={summary}
          mine={mine}
          driverActive={Boolean(driverOrder || driverTrip)}
          storeOwner={Boolean(store)}
          pollSeconds={GO_RULES.publicMapPollSeconds}
          trackingPollSeconds={GO_RULES.trackingPollSeconds}
          startInDemo={query.demo === '1'}
          labels={liveMapLabels(t)}
        />
      </section>
    </SiteShell>
  );
}
