import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SERVICES_RULES } from '@/config/business-rules';
import { SERVICE_CATEGORIES } from '@/config/services';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { LicenceBadge, categoryName } from '@/ui/services/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { getProviderProfile } from '@/server/domains/services/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { availabilityAction, saveProviderAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('services.provider.title'), robots: { index: false } };
}

const LIMITS: Record<string, Record<string, number>> = {
  'services.error.headline': { min: SERVICES_RULES.headlineMinLength, max: SERVICES_RULES.headlineMaxLength },
  'services.error.bio': { min: SERVICES_RULES.bioMinLength, max: SERVICES_RULES.bioMaxLength },
  'services.error.categories': { max: SERVICES_RULES.maxCategoriesPerProvider },
};

/** Offering services: who you are, what you do, where, and how to reach you. */
export default async function ProviderPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [profile, countries, [me]] = await Promise.all([
    getProviderProfile(db(), userId),
    placeOptions(db(), locale),
    db().select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const availableToday = profile?.availableUntil ? profile.availableUntil > new Date() : false;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <div className="wrap cm-column" style={{ padding: '32px var(--gutter) 56px' }}>
        <p>
          <Link href="/services">← {t('services.back')}</Link>
        </p>
        <h1 className="h-md">{profile ? t('services.provider.title') : t('services.board.offer')}</h1>
        <p className="muted">{t('services.provider.lead')}</p>
        {query.saved ? <p className="mk-banner" role="status">{t('services.provider.saved')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
        {profile?.status === 'suspended' ? <p className="mk-error">{t('services.error.provider_suspended')}</p> : null}

        {profile && profile.status === 'active' ? (
          <form action={availabilityAction} className={availableToday ? 'sv-available on' : 'sv-available'}>
            <input type="hidden" name="available" value={availableToday ? 'false' : 'true'} />
            <div>
              <strong>{availableToday ? t('services.available.on') : t('services.available.off')}</strong>
              <p className="muted mb0">{t('services.available.explain')}</p>
            </div>
            <button className={availableToday ? 'btn btn-line' : 'btn btn-gold'} type="submit">
              {availableToday ? t('services.available.turn_off') : t('services.available.turn_on')}
            </button>
          </form>
        ) : null}

        {profile && me ? (
          <p>
            <Link href={`/services/providers/${formatYayId(me.yayId)}`}>{t('services.provider.public_link')}</Link>
          </p>
        ) : null}

        <form action={saveProviderAction} className="mk-form" style={{ marginTop: 18 }}>
          <label>
            {t('services.provider.headline')}
            <span className="hint">{t('services.provider.headline_hint')}</span>
            <input name="headline" required minLength={SERVICES_RULES.headlineMinLength} maxLength={SERVICES_RULES.headlineMaxLength} defaultValue={profile?.headline ?? ''} />
          </label>
          <fieldset className="sv-checks">
            <legend>{t('services.provider.categories', { max: SERVICES_RULES.maxCategoriesPerProvider })}</legend>
            {SERVICE_CATEGORIES.map((cat) => (
              <label key={cat.key}>
                <input type="checkbox" name="categories" value={cat.key} defaultChecked={profile?.categories.includes(cat.key)} /> {categoryName(t, cat.key)}
                {cat.regulated ? <span className="sv-regulated"> · {t('services.provider.needs_licence')}</span> : null}
              </label>
            ))}
          </fieldset>
          <label>
            {t('services.provider.bio')}
            <textarea name="bio" required minLength={SERVICES_RULES.bioMinLength} maxLength={SERVICES_RULES.bioMaxLength} defaultValue={profile?.bio ?? ''} />
          </label>
          <label>
            {t('services.form.location')}
            <select name="locationId" required defaultValue={profile?.locationId ?? ''}>
              <option value="" disabled>
                {t('mercadito.form.choose')}
              </option>
              {countries.map((country) => (
                <optgroup key={country.code} label={country.name}>
                  {country.places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            {t('services.provider.whatsapp')}
            <span className="hint">{t('services.provider.whatsapp_hint')}</span>
            <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" defaultValue={profile?.whatsappE164 ?? ''} />
          </label>
          <label>
            {t('services.provider.licence')} {profile ? <LicenceBadge status={profile.licenceStatus} t={t} /> : null}
            <span className="hint">{t('services.provider.licence_hint')}</span>
            <input name="licenceClaim" maxLength={SERVICES_RULES.licenceMaxLength} defaultValue={profile?.licenceClaim ?? ''} />
          </label>
          {profile?.licenceStatus === 'rejected' && profile.licenceNote ? <p className="mk-error">{t('services.provider.licence_rejected', { note: profile.licenceNote })}</p> : null}
          <button className="btn btn-gold" type="submit">
            {profile ? t('services.provider.save') : t('services.provider.create')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
