import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { WORK_RULES } from '@/config/business-rules';
import { EMPLOYMENT_TYPES, PLACE_MODES, WORK_FIELDS } from '@/config/work';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { placeOptions } from '@/server/domains/mercadito/service';
import { publishPostAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const LIMITS = {
  min: WORK_RULES.titleMinLength,
  max: WORK_RULES.titleMaxLength,
  limit: WORK_RULES.maxOpenPostsPerEmployer,
};

/** Posting a job or a project. The pay is a required field: that is what "no auctions" means. */
export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ kind?: string; error?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const kind = query.kind === 'project' ? 'project' : 'job';
  const countries = await placeOptions(db(), locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const employments = kind === 'project' ? (['freelance'] as const) : EMPLOYMENT_TYPES.filter((e) => e !== 'freelance');

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/work">← {t('work.back')}</Link>
        </p>
        <h1 className="h-md">{t(kind === 'project' ? 'work.form.title_project' : 'work.form.title_job')}</h1>
        <nav className="cm-tabs">
          <Link href="/work/posts/new?kind=job" aria-current={kind === 'job' ? 'true' : undefined}>
            {t('work.kind.job')}
          </Link>
          <Link href="/work/posts/new?kind=project" aria-current={kind === 'project' ? 'true' : undefined}>
            {t('work.kind.project')}
          </Link>
        </nav>
        <p className="muted">{t('work.form.lead')}</p>
        {error ? <p className="mk-error">{t(error as MessageKey, LIMITS)}</p> : null}
        <form action={publishPostAction} className="mk-form" style={{ marginTop: 18 }}>
          <input type="hidden" name="kind" value={kind} />
          <label>
            {t('work.form.post_title')}
            <span className="hint">{t(kind === 'project' ? 'work.form.post_title_hint_project' : 'work.form.post_title_hint_job')}</span>
            <input name="title" required minLength={WORK_RULES.titleMinLength} maxLength={WORK_RULES.titleMaxLength} />
          </label>
          <label>
            {t('work.form.field')}
            <select name="field" required defaultValue="">
              <option value="" disabled>
                {t('mercadito.form.choose')}
              </option>
              {WORK_FIELDS.map((value) => (
                <option key={value} value={value}>
                  {t(`work.field.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('work.form.employment')}
            <select name="employment" required defaultValue={employments.length === 1 ? employments[0] : ''}>
              {employments.length > 1 ? (
                <option value="" disabled>
                  {t('mercadito.form.choose')}
                </option>
              ) : null}
              {employments.map((value) => (
                <option key={value} value={value}>
                  {t(`work.employment.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="wk-pay-field">
            {t('work.form.pay')}
            <span className="hint">{t('work.form.pay_hint')}</span>
            <input name="payText" required minLength={WORK_RULES.payMinLength} maxLength={WORK_RULES.payMaxLength} placeholder={t(kind === 'project' ? 'work.form.pay_placeholder_project' : 'work.form.pay_placeholder_job')} />
          </label>
          <label>
            {t('work.form.description')}
            <span className="hint">{t('work.form.description_hint')}</span>
            <textarea name="description" required minLength={WORK_RULES.descriptionMinLength} maxLength={WORK_RULES.descriptionMaxLength} />
          </label>
          <label>
            {t('work.form.requirements')}
            <textarea name="requirements" maxLength={WORK_RULES.requirementsMaxLength} style={{ minHeight: 80 }} />
          </label>
          <label>
            {t('work.form.company')}
            <span className="hint">{t('work.form.company_hint')}</span>
            <input name="companyName" maxLength={WORK_RULES.companyMaxLength} />
          </label>
          <label>
            {t('work.form.location')}
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
            {t('work.form.place_mode')}
            <select name="placeMode" required defaultValue="onsite">
              {PLACE_MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`work.place_mode.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('services.provider.whatsapp')}
            <span className="hint">{t('work.form.whatsapp_hint')}</span>
            <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" />
          </label>
          <label className="sv-urgent-check">
            <span>
              <input type="checkbox" name="noFeePromise" required /> <strong>{t('work.form.no_fee')}</strong>
            </span>
            <span className="hint">{t('work.form.no_fee_hint')}</span>
          </label>
          <button className="btn btn-gold" type="submit">
            {t('work.form.submit')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
