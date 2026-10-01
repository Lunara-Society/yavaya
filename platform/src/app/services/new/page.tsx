import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SERVICES_RULES } from '@/config/business-rules';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_KEYS } from '@/config/services';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { categoryName } from '@/ui/services/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { createRequestAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('services.form.title'), robots: { index: false } };
}

const LIMITS: Record<string, Record<string, number>> = {
  'services.error.title': { min: SERVICES_RULES.titleMinLength, max: SERVICES_RULES.titleMaxLength },
  'services.error.body': { min: SERVICES_RULES.bodyMinLength, max: SERVICES_RULES.bodyMaxLength },
  'services.error.too_many_open': { limit: SERVICES_RULES.maxOpenRequestsPerMember },
};

/** A plain form: asking works without JavaScript, on any phone, at 3 a.m. */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ error?: string; cat?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const countries = await placeOptions(db(), locale);
  const error = params.error && /^[a-z_.]+$/.test(params.error) ? params.error : null;
  const initial = (SERVICE_CATEGORY_KEYS as readonly string[]).includes(params.cat ?? '') ? params.cat : '';

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="services" tone="services">
      <div className="wrap cm-column" style={{ padding: '32px var(--gutter) 56px' }}>
        <p>
          <Link href="/services">← {t('services.back')}</Link>
        </p>
        <h1 className="h-md">{t('services.form.title')}</h1>
        <p className="muted">{t('services.form.free')}</p>
        {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
        <form action={createRequestAction} className="mk-form" style={{ marginTop: 18 }}>
          <label>
            {t('services.form.category')}
            <select name="category" required defaultValue={initial}>
              <option value="" disabled>
                {t('mercadito.form.choose')}
              </option>
              {SERVICE_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {categoryName(t, cat.key)} — {t(`services.category.${cat.key}.examples` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="sv-urgent-check">
            <span>
              <input type="checkbox" name="urgent" /> <strong>{t('services.form.urgent')}</strong>
            </span>
            <span className="hint">{t('services.form.urgent_hint')}</span>
          </label>
          <label>
            {t('services.form.headline')}
            <span className="hint">{t('services.form.headline_hint')}</span>
            <input name="title" required minLength={SERVICES_RULES.titleMinLength} maxLength={SERVICES_RULES.titleMaxLength} />
          </label>
          <label>
            {t('services.form.body')}
            <span className="hint">{t('services.form.body_hint')}</span>
            <textarea name="body" required minLength={SERVICES_RULES.bodyMinLength} maxLength={SERVICES_RULES.bodyMaxLength} />
          </label>
          <label>
            {t('services.form.location')}
            <select name="locationId" required defaultValue="">
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
            <span>
              <input type="checkbox" name="anonymous" /> {t('services.form.anonymous')}
            </span>
            <span className="hint">{t('services.form.anonymous_hint')}</span>
          </label>
          <p className="muted">{t('services.form.privacy')}</p>
          <button className="btn btn-gold" type="submit">
            {t('services.form.submit')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
