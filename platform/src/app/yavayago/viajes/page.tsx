import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_TRIP_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { DistrictScene } from '@/ui/site/art';
import { TripForm, type TripFormLabels } from '@/ui/go/trip-form';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { activeTripFor, launchCity, tripOfferWindowMinutes, tripStartCity, TRIP_KINDS } from '@/server/domains/go/trips';
import { myDriver } from '@/server/domains/go/service';
import { requestTripAction } from './actions';
import { mapLabels } from '../labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('go.trip.meta_title'), description: t('go.trip.meta_description') };
}

/**
 * Viajes y mandados: ask a checked driver for anything — a ride, a parcel,
 * an errand, a hand. Open to read; asking takes an account.
 */
export default async function TripsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const [start, launch, active, driver, window] = await Promise.all([
    tripStartCity(db(), userId),
    launchCity(db()),
    userId ? activeTripFor(db(), userId) : Promise.resolve(null),
    userId ? myDriver(db(), userId) : Promise.resolve(null),
    tripOfferWindowMinutes(db()),
  ]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const k = (kind: string, part: string) => t(`go.trip.${part}.${kind}` as MessageKey);
  const perKind = (part: string) => Object.fromEntries(TRIP_KINDS.map((kind) => [kind, k(kind, part)])) as Record<(typeof TRIP_KINDS)[number], string>;
  const labels: TripFormLabels = {
    kinds: Object.fromEntries(TRIP_KINDS.map((kind) => [kind, { title: k(kind, 'kind'), text: k(kind, 'kind_text') }])) as TripFormLabels['kinds'],
    pickup: perKind('pickup'),
    dropoff: perKind('dropoff'),
    description: perKind('description'),
    descriptionHint: perKind('description_hint'),
    directionsHint: t('go.checkout.directions_hint'),
    vehicle: t('go.trip.form.vehicle'),
    vehicleAny: t('go.trip.form.vehicle_any'),
    vehicleMoto: t('go.vehicle.motorcycle'),
    vehicleCar: t('go.vehicle.car'),
    passengers: t('go.trip.form.passengers'),
    fare: t('go.trip.form.fare'),
    fareHint: t('go.trip.form.fare_hint', { minutes: window }),
    budget: t('go.trip.form.budget'),
    budgetHint: t('go.trip.form.budget_hint'),
    whatsapp: t('go.form.whatsapp'),
    whatsappHint: t('go.trip.form.whatsapp_hint'),
    city: t('go.form.city'),
    submit: t('go.trip.form.submit'),
    cash: t('go.trip.form.cash'),
    map: mapLabels(t),
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      <section className="cm-head go-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="yavayago" priority />
        </div>
        <div className="wrap">
          <p className="eyebrow">{t('go.trip.eyebrow')}</p>
          <h1>{t('go.trip.title')}</h1>
          <p className="lead">{t('go.trip.lead')}</p>
          {launch ? <p className="go-launch">{t('go.trip.launch', { city: launch.name })}</p> : null}
          <div className="btn-row">
            <Link className="btn btn-line" href="/yavayago">
              {t('go.trip.food_link')}
            </Link>
            <Link className="btn btn-line" href={member ? '/yavayago/driver' : '/login?next=/yavayago/driver'}>
              {driver ? t('go.home.my_driving') : t('go.trip.drive_link')}
            </Link>
          </div>
        </div>
      </section>
      <div className="wrap go-page cm-column" style={{ paddingBottom: 56 }}>
        <ol className="go-how">
          <li>
            <strong>{t('go.trip.how1_title')}</strong> {t('go.trip.how1_text')}
          </li>
          <li>
            <strong>{t('go.trip.how2_title')}</strong> {t('go.trip.how2_text')}
          </li>
          <li>
            <strong>{t('go.trip.how3_title')}</strong> {t('go.trip.how3_text')}
          </li>
          <li>
            <strong>{t('go.trip.how4_title')}</strong> {t('go.trip.how4_text')}
          </li>
        </ol>

        {error ? (
          <p className="mk-banner err" role="alert">
            {t(error as MessageKey, { maxKm: GO_TRIP_RULES.maxDistanceKm })}
          </p>
        ) : null}

        {active ? (
          <section className="go-state s-approved">
            <p>
              <strong>{t('go.trip.you_have_one', { code: active.code })}</strong>
            </p>
            <Link className="btn btn-gold" href={`/yavayago/viajes/${active.id}`}>
              {t('go.trip.see_yours')}
            </Link>
          </section>
        ) : !member ? (
          <section className="go-state">
            <p>{t('go.trip.sign_in')}</p>
            <Link className="btn btn-gold" href="/login?next=/yavayago/viajes">
              {t('go.checkout.sign_in')}
            </Link>
          </section>
        ) : start ? (
          <TripForm
            action={requestTripAction}
            start={{ latitude: start.latitude, longitude: start.longitude }}
            currency={start.currency}
            labels={labels}
            cityField={<PlacePicker name="locationId" labels={placePickerLabels(t)} initial={start.id} required />}
          />
        ) : (
          <p className="muted">{t('go.trip.no_city')}</p>
        )}

        <section className="go-trip-more">
          <h2 className="go-menu-h">{t('go.trip.more_title')}</h2>
          <p className="muted">{t('go.trip.more_text')}</p>
          <p className="btn-row">
            <Link className="btn btn-line" href="/services">
              {t('go.trip.services_link')}
            </Link>
          </p>
        </section>
      </div>
      <div className="wrap gv-end" style={{ paddingBottom: 56 }}>
        <GuideVideo guideKey="yavayago" title={t('guide.watch_title', { name: c.nav.yavayago })} t={t} locale={locale} />
      </div>
    </SiteShell>
  );
}
