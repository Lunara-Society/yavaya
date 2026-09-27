import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ListingCard } from '@/ui/mercadito/listing-card';
import { WhatsappForm } from '@/ui/mercadito/whatsapp-form';
import { getWhatsapp, sellerListings } from '@/server/domains/mercadito/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('mercadito.mine.title'), robots: { index: false } };
}

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ wa?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');

  const [listings, whatsapp] = await Promise.all([sellerListings(db(), userId, locale), getWhatsapp(db(), userId)]);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="mercadito" tone="mercadito">
      <section className="mk-head">
        <div className="wrap">
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>{t('mercadito.mine.title')}</h1>
            <Link className="btn btn-gold" href="/mercadito/publish">
              {t('mercadito.browse.publish')}
            </Link>
          </div>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {listings.length === 0 ? (
          <p className="mk-empty">{t('mercadito.mine.empty')}</p>
        ) : (
          <div className="mk-grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} t={t} locale={locale} showStatus />
            ))}
          </div>
        )}
        <div className="mt" style={{ maxWidth: 820 }}>
          <WhatsappForm t={t} current={whatsapp} back="/mercadito/mine" invalid={query.wa === 'invalid'} />
        </div>
      </div>
    </SiteShell>
  );
}
