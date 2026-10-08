import type { Metadata } from 'next';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ListingForm } from '@/ui/mercadito/listing-form';
import { listingFormProps } from '@/ui/mercadito/form-props';
import { WhatsappForm } from '@/ui/mercadito/whatsapp-form';
import { actionCost, getBalance } from '@/server/domains/tokens/service';
import { getWhatsapp, openListingCount, placeOptions, pricingRules, sellerStanding } from '@/server/domains/mercadito/service';
import { mediaStorageAvailability } from '@/server/domains/media/storage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.publish.title'), robots: { index: false } };
}

/**
 * Publishing. Every reason a member could be refused is checked here first
 * and said plainly, so the form only appears when submitting it can work.
 * The server checks all of it again; this page is courtesy, not security.
 */
export default async function PublishPage({ searchParams }: { searchParams: Promise<{ wa?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();

  const shell = (children: React.ReactNode) => (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('mercadito.publish.title')}</h1>
        </div>
      </section>
      <div className="wrap" style={{ padding: '24px var(--gutter) 56px', display: 'grid', gap: 20, maxWidth: 820 }}>
        {children}
      </div>
    </SiteShell>
  );

  if (!userId) {
    return shell(
      <div className="card">
        <p>{t('mercadito.publish.sign_in')}</p>
        <div className="btn-row">
          <Link className="btn btn-gold" href="/login">
            {t('nav.sign_in')}
          </Link>
          <Link className="btn btn-line" href="/register">
            {t('auth.submit_register')}
          </Link>
        </div>
      </div>,
    );
  }

  if (!mediaStorageAvailability().available) {
    return shell(<p className="mk-banner">{t('mercadito.publish.unavailable')}</p>);
  }

  const [standing, balance, cost, whatsapp, countries, open, pricing] = await Promise.all([
    sellerStanding(db(), userId),
    getBalance(db(), userId),
    actionCost(db(), 'mercadito.publish_listing'),
    getWhatsapp(db(), userId),
    placeOptions(db(), locale),
    openListingCount(db(), userId),
    pricingRules(db()),
  ]);
  // Free while the member has fewer open listings than the allowance; the
  // server decides again at publish time, this is only what the page says.
  const freeLeft = Math.max(0, pricing.freeOpenListings - open);
  const price = freeLeft > 0 ? 0 : (cost ?? 0);
  const limits = { max: standing.newSeller.max, days: standing.newSeller.windowDays, used: standing.newSeller.used };

  if (!standing.allowed) {
    return shell(
      <div className="card">
        <p className="mk-error">{t(standing.reasonKey as MessageKey, limits)}</p>
        {standing.reasonKey === 'mercadito.error.verify_email' ? (
          <Link className="btn btn-gold mt" href="/verify">
            {t('mercadito.publish.verify')}
          </Link>
        ) : null}
      </div>,
    );
  }

  const form = listingFormProps(t, price === 0 ? t('mercadito.form.submit_free') : t('mercadito.form.submit_create', { cost: price }));

  return shell(
    <>
      <div className="card">
        <p>
          {price === 0
            ? t('mercadito.publish.free', { left: freeLeft, max: pricing.freeOpenListings })
            : t('mercadito.publish.cost_beyond', { cost: price, max: pricing.freeOpenListings })}
        </p>
        <p className="mb0">
          {t('mercadito.publish.balance', { balance })} <Link href="/account/tokens">{t('mercadito.publish.see_tokens')}</Link>
        </p>
        {standing.newSeller.limited ? <p className="muted mt mb0">{t('mercadito.publish.new_seller', limits)}</p> : null}
      </div>

      <WhatsappForm t={t} current={whatsapp} back="/mercadito/publish" invalid={query.wa === 'invalid'} />

      {balance < price ? (
        <p className="mk-error">{t('mercadito.publish.no_tokens')}</p>
      ) : (
        <>
          <noscript>
            <p className="mk-banner">{t('mercadito.form.needs_js')}</p>
          </noscript>
          {/* A fresh id per visit names this listing before it exists, so a
              retried submission cannot publish (or charge) twice. */}
          <ListingForm mode="create" listingId={randomUUID()} countries={countries} {...form} />
        </>
      )}
    </>,
  );
}
