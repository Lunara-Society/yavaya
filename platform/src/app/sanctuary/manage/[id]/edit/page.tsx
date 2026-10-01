import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sanctuaryChurches } from '@/server/db/schema';
import type { MessageKey } from '@/i18n';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ChurchForm } from '@/ui/sanctuary/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { getChurch } from '@/server/domains/sanctuary/service';
import { updateChurchAction } from '../../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditChurchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const church = await getChurch(db(), { churchId: id, viewerId: userId, locale });
  if (!church || church.ownerUserId !== userId) notFound();
  const [row] = await db().select({ locationId: sanctuaryChurches.locationId }).from(sanctuaryChurches).where(eq(sanctuaryChurches.id, church.id));
  const countries = await placeOptions(db(), locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href={`/sanctuary/manage/${church.id}`}>← {church.name}</Link>
          </p>
          <h1>{t('sanctuary.form.title_edit')}</h1>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {error ? (
          <p className="mk-error">
            {t(error as MessageKey, { limit: SANCTUARY_RULES.maxChurchesPerOwner, min: SANCTUARY_RULES.descriptionMinLength, max: SANCTUARY_RULES.descriptionMaxLength })}
          </p>
        ) : null}
        <ChurchForm
          t={t}
          countries={countries}
          action={updateChurchAction}
          churchId={church.id}
          initial={{
            name: church.name,
            denomination: church.denomination,
            description: church.description,
            locationId: row!.locationId,
            address: church.address,
            whatsappE164: church.whatsappE164,
            streamUrl: church.streamUrl,
            services: church.services,
          }}
        />
      </div>
    </SiteShell>
  );
}
