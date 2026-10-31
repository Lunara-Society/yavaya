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
import { getWhatsapp, newSellerRules, openListingCount, pricingRules, sellerStanding } from '@/server/domains/mercadito/service';
import { mediaStorageAvailability } from '@/server/domains/media/storage';
import { LISTING_CATEGORIES } from '@/server/domains/mercadito/rules';
import { loginHref } from '@/server/auth/return-path';
import { formatDate } from '@/ui/mercadito/format';
import { limitsStanding } from '@/ui/mercadito/limits';
import type { Translator } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * Both limits, said together and in the same words Roxi uses: a new account
 * creates at most a few listings in its first days, and after that a number
 * of open listings are free, with more costing tokens. Then where this
 * member stands, when we know. The rules themselves are the server's
 * (sellerStanding, pricingRules); this only reads them.
 */
function Limits({
  t,
  rules,
  you,
}: {
  t: Translator;
  rules: { newMax: number; days: number; free: number; cost: number | null };
  you?: string;
}) {
  return (
    <section className="card mk-limits" aria-labelledby="mk-limits-h">
      <h2 id="mk-limits-h" className="mk-limits-h">
        {t('mercadito.limits.title')}
      </h2>
      <ul className="mk-limits-list">
        <li>{t('mercadito.limits.new', { max: rules.newMax, days: rules.days })}</li>
        <li>{t('mercadito.limits.standard', { max: rules.free })}</li>
        {rules.cost ? <li>{t('mercadito.limits.beyond', { cost: rules.cost })}</li> : null}
      </ul>
      {you ? <p className="mk-limits-you">{you}</p> : null}
    </section>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.publish.title'), robots: { index: false } };
}

/**
 * Publishing. Every reason a member could be refused is checked here first
 * and said plainly, so the form only appears when submitting it can work.
 * The server checks all of it again; this page is courtesy, not security.
 */
export default async function PublishPage({ searchParams }: { searchParams: Promise<{ wa?: string; cat?: string }> }) {
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
    // What publishing costs comes before the request to sign in: it is the
    // first thing someone about to sell wants to know.
    const [pricing, newRules, cost] = await Promise.all([pricingRules(db()), newSellerRules(db()), actionCost(db(), 'mercadito.publish_listing')]);
    return shell(
      <>
        <Limits t={t} rules={{ newMax: newRules.maxListings, days: newRules.windowDays, free: pricing.freeOpenListings, cost }} />
        <div className="card">
          <p>{t('mercadito.publish.sign_in')}</p>
          <div className="btn-row">
            <Link className="btn btn-gold" href={loginHref('/mercadito/publish')}>
              {t('nav.sign_in')}
            </Link>
            <Link className="btn btn-line" href={loginHref('/mercadito/publish', '/register')}>
              {t('auth.submit_register')}
            </Link>
          </div>
        </div>
      </>,
    );
  }

  if (!mediaStorageAvailability().available) {
    return shell(<p className="mk-banner">{t('mercadito.publish.unavailable')}</p>);
  }

  const [standing, balance, cost, whatsapp, open, pricing] = await Promise.all([
    sellerStanding(db(), userId),
    getBalance(db(), userId),
    actionCost(db(), 'mercadito.publish_listing'),
    getWhatsapp(db(), userId),
    openListingCount(db(), userId),
    pricingRules(db()),
  ]);
  // Free while the member has fewer open listings than the allowance; the
  // server decides again at publish time, this is only what the page says.
  const freeLeft = Math.max(0, pricing.freeOpenListings - open);
  const price = freeLeft > 0 ? 0 : (cost ?? 0);
  const limits = { max: standing.newSeller.max, days: standing.newSeller.windowDays, used: standing.newSeller.used };
  const rules = { newMax: standing.newSeller.max, days: standing.newSeller.windowDays, free: pricing.freeOpenListings, cost };
  const until = standing.newSeller.until ? formatDate(standing.newSeller.until, locale) : '';
  const line = limitsStanding({ newSeller: standing.newSeller, open, freeOpenListings: pricing.freeOpenListings, cost, until });
  const you = t(line.key, line.params);

  if (!standing.allowed) {
    return shell(
      <>
        <div className="card">
          <p className="mk-error">{t(standing.reasonKey as MessageKey, limits)}</p>
          {standing.reasonKey === 'mercadito.error.verify_email' ? (
            <Link className="btn btn-gold mt" href="/verify">
              {t('mercadito.publish.verify')}
            </Link>
          ) : null}
        </div>
        {standing.reasonKey === 'mercadito.error.new_seller_limit' ? <Limits t={t} rules={rules} you={you} /> : null}
      </>,
    );
  }

  const form = listingFormProps(t, price === 0 ? t('mercadito.form.submit_free') : t('mercadito.form.submit_create', { cost: price }));

  return shell(
    <>
      <Limits t={t} rules={rules} you={you} />
      <p className="mb0">
        {t('mercadito.publish.balance', { balance })} <Link href="/account/tokens">{t('mercadito.publish.see_tokens')}</Link>
      </p>

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
          <ListingForm
            mode="create"
            listingId={randomUUID()}
            {...form}
            prefillNotice={t('roxi.prefill.notice')}
            presetCategory={(LISTING_CATEGORIES as readonly string[]).includes(query.cat ?? '') ? query.cat : undefined}
          />
        </>
      )}
    </>,
  );
}
