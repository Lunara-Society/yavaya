import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import type { MessageKey } from '@/i18n';
import { WORK_RULES } from '@/config/business-rules';
import { WORK_FIELDS } from '@/config/work';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { placeOptions } from '@/server/domains/mercadito/service';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { getProfile } from '@/server/domains/work/service';
import { saveProfileAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const LIMITS: Record<string, Record<string, number>> = {
  'work.error.headline': { min: WORK_RULES.headlineMinLength, max: WORK_RULES.headlineMaxLength },
  'work.error.about': { min: WORK_RULES.aboutMinLength, max: WORK_RULES.aboutMaxLength },
  'work.error.fields': { max: WORK_RULES.maxFieldsPerProfile },
  'work.error.links': { max: WORK_RULES.maxPortfolioLinks },
};

/** Your professional profile: what employers see when you apply. */
export default async function WorkProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; next?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [profile, countries, [me]] = await Promise.all([getProfile(db(), userId), placeOptions(db(), locale), db().select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1)]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const next = query.next && /^[0-9a-f-]{36}$/i.test(query.next) ? query.next : null;
  const links = [...(profile?.portfolioLinks ?? []), '', '', ''].slice(0, WORK_RULES.maxPortfolioLinks);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/work">← {t('work.back')}</Link>
        </p>
        <h1 className="h-md">{t('work.profile.title')}</h1>
        <p className="muted">{t('work.profile.lead')}</p>
        {query.saved ? <p className="mk-banner" role="status">{t('work.profile.saved')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
        {profile?.status === 'suspended' ? <p className="mk-error">{t('work.error.suspended')}</p> : null}
        {profile && me ? (
          <p>
            <Link href={`/work/pros/${formatYayId(me.yayId)}`}>{t('services.provider.public_link')}</Link>
          </p>
        ) : null}
        <form action={saveProfileAction} className="mk-form" style={{ marginTop: 18 }}>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label>
            {t('work.profile.headline')}
            <span className="hint">{t('work.profile.headline_hint')}</span>
            <input name="headline" required minLength={WORK_RULES.headlineMinLength} maxLength={WORK_RULES.headlineMaxLength} defaultValue={profile?.headline ?? ''} />
          </label>
          <fieldset className="sv-checks">
            <legend>{t('work.profile.fields', { max: WORK_RULES.maxFieldsPerProfile })}</legend>
            {WORK_FIELDS.map((value) => (
              <label key={value}>
                <input type="checkbox" name="fields" value={value} defaultChecked={profile?.fields.includes(value)} /> {t(`work.field.${value}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          <label>
            {t('work.profile.about')}
            <span className="hint">{t('work.profile.about_hint')}</span>
            <textarea name="about" required minLength={WORK_RULES.aboutMinLength} maxLength={WORK_RULES.aboutMaxLength} defaultValue={profile?.about ?? ''} />
          </label>
          <label>
            {t('work.profile.skills')}
            <input name="skills" maxLength={WORK_RULES.skillsMaxLength} defaultValue={profile?.skills ?? ''} />
          </label>
          <label>
            {t('work.profile.experience')}
            <input name="experienceYears" type="number" inputMode="numeric" min={0} max={60} defaultValue={profile?.experienceYears ?? ''} />
          </label>
          <fieldset className="sv-checks">
            <legend>{t('work.profile.links', { max: WORK_RULES.maxPortfolioLinks })}</legend>
            {links.map((link, index) => (
              <input key={index} name="portfolioLinks" type="url" inputMode="url" placeholder="https://" defaultValue={link} />
            ))}
          </fieldset>
          <label>
            {t('work.form.location')}
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
            <span className="hint">{t('work.profile.whatsapp_hint')}</span>
            <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" defaultValue={profile?.whatsappE164 ?? ''} />
          </label>
          <label>
            <span>
              <input type="checkbox" name="openToWork" defaultChecked={profile?.openToWork ?? true} /> {t('work.profile.open_to_work')}
            </span>
            <span className="hint">{t('work.profile.open_to_work_hint')}</span>
          </label>
          <button className="btn btn-gold" type="submit">
            {profile ? t('services.provider.save') : t('work.profile.create')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
