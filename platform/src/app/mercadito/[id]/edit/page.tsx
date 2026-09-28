import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ListingForm } from '@/ui/mercadito/listing-form';
import { listingFormProps } from '@/ui/mercadito/form-props';
import { priceInputValue } from '@/ui/mercadito/format';
import { getListing, placeOptions } from '@/server/domains/mercadito/service';
import { OPEN_STATUSES } from '@/server/domains/mercadito/rules';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.publish.edit_title'), robots: { index: false } };
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!UUID.test(id)) notFound();

  const listing = await getListing(db(), id, locale);
  // Only the seller edits, and only while the listing is up.
  if (!listing || listing.seller.userId !== userId) notFound();
  if (!(OPEN_STATUSES as readonly string[]).includes(listing.status)) redirect(`/mercadito/${id}`);

  const countries = await placeOptions(db(), locale);
  const form = listingFormProps(t, t('mercadito.form.submit_edit'));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('mercadito.publish.edit_title')}</h1>
        </div>
      </section>
      <div className="wrap" style={{ padding: '24px var(--gutter) 56px', maxWidth: 820 }}>
        <noscript>
          <p className="mk-banner">{t('mercadito.form.needs_js')}</p>
        </noscript>
        <ListingForm
          mode="edit"
          listingId={listing.id}
          countries={countries}
          initial={{
            title: listing.title,
            description: listing.description,
            price: priceInputValue(listing.priceMinor),
            currency: listing.currencyCode,
            category: listing.category,
            condition: listing.condition,
            locationId: listing.locationId,
            photoIds: listing.photos.map((photo) => photo.mediaId),
          }}
          {...form}
        />
      </div>
    </SiteShell>
  );
}
