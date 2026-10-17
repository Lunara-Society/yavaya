import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { GO_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GoMap } from '@/ui/go/map';
import { Refresher } from '@/ui/go/client';
import { sharedTrip } from '@/server/domains/go/trips';
import { mapLabels } from '../../../labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * What someone sees when a traveller shares their trip: who is driving, the
 * vehicle and plate, and where they are now — while the trip is under way,
 * and nothing once it has ended. No account needed: the link is the key.
 */
export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { c, t, language, theme, member } = await siteContext();
  const shared = await sharedTrip(db(), token);
  if (!shared) notFound();
  const { trip, active, driver, customerFirstName } = shared;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="yavayago" tone="yavayago">
      {active ? <Refresher seconds={30} /> : null}
      <div className="wrap go-page cm-column">
        <p className="eyebrow">{t('go.trip.shared_eyebrow', { name: customerFirstName })}</p>
        <h1 className="go-order-title">
          {t(`go.trip.status.${trip.status}` as MessageKey)} <span className="go-code">#{trip.code}</span>
        </h1>
        {!active ? <p className="muted">{t('go.trip.shared_over')}</p> : null}
        {active && driver ? (
          <>
            <section className="go-driver-card">
              <img src={`/media/${driver.photoMediaId}`} alt={t('go.driver.photo_of', { name: driver.name })} />
              <div>
                <p className="eyebrow">{t('go.trip.shared_driver')}</p>
                <strong>{driver.name}</strong>
                <p className="muted">
                  {t(`go.vehicle.${driver.vehicleType}` as MessageKey)} · {driver.vehicleDescription}
                  {driver.plate ? (
                    <>
                      {' · '}
                      <span className="go-plate">{driver.plate}</span>
                    </>
                  ) : null}
                </p>
                <p className="hint muted">{t('go.trip.shared_checked')}</p>
              </div>
            </section>
            <div className="go-track">
              <GoMap mode="track" orderId={trip.id} trackingUrl={`/api/go/trips/share/${token}`} pollSeconds={GO_RULES.trackingPollSeconds} driverPhoto={`/media/${driver.photoMediaId}`} labels={mapLabels(t)} />
            </div>
          </>
        ) : null}
      </div>
    </SiteShell>
  );
}
