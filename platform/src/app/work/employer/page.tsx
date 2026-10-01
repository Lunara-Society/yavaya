import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { WORK_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { placeOptions } from '@/server/domains/mercadito/service';
import { EMPLOYER_KINDS, getEmployer } from '@/server/domains/work/service';
import { saveEmployerAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Becoming a verified employer: who you are, checked once by a person, before the first post. */
export default async function EmployerPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; kind?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [employer, countries] = await Promise.all([getEmployer(db(), userId), placeOptions(db(), locale)]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const kind = query.kind === 'business' || query.kind === 'person' ? query.kind : (employer?.kind ?? 'business');
  const status = employer?.status ?? null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/work">← {t('work.back')}</Link>
        </p>
        <h1 className="h-md">{t('work.employer.title')}</h1>
        <p className="lead">{t('work.employer.lead')}</p>
        {query.saved === 'review' ? <p className="mk-banner" role="status">{t('work.employer.saved_review')}</p> : query.saved ? <p className="mk-banner" role="status">{t('work.employer.saved')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        {status ? (
          <div className={`wk-status ${status}`}>
            <p>
              <strong>{t(`work.employer.status.${status}` as MessageKey)}</strong> {t(`work.employer.status_text.${status}` as MessageKey)}
            </p>
            {employer?.reviewNote && status !== 'approved' ? <p className="muted">{t('work.employer.review_note', { note: employer.reviewNote })}</p> : null}
            {status === 'approved' ? (
              <p className="btn-row">
                <Link className="btn btn-gold" href="/work/posts/new">
                  {t('work.board.post')}
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {status === 'suspended' ? null : (
          <>
            <h2 style={{ marginTop: 24, fontSize: "1.2rem" }}>
              {t('work.employer.how_title')}
            </h2>
            <ul className="vt-list muted">
              <li>{t('work.employer.how_check')}</li>
              <li>{t('work.employer.how_name')}</li>
              <li>{t('work.employer.how_change')}</li>
            </ul>
            <nav className="cm-tabs" style={{ marginTop: 18 }}>
              {EMPLOYER_KINDS.map((k) => (
                <Link key={k} href={`/work/employer?kind=${k}`} aria-current={kind === k ? 'true' : undefined}>
                  {t(`work.employer.kind.${k}` as MessageKey)}
                </Link>
              ))}
            </nav>
            <form action={saveEmployerAction} className="mk-form" style={{ marginTop: 18 }}>
              <input type="hidden" name="kind" value={kind} />
              <label>
                {t(kind === 'business' ? 'work.employer.name_business' : 'work.employer.name_person')}
                <span className="hint">{t(kind === 'business' ? 'work.employer.name_business_hint' : 'work.employer.name_person_hint')}</span>
                <input name="name" required minLength={WORK_RULES.employerNameMinLength} maxLength={WORK_RULES.employerNameMaxLength} defaultValue={employer?.kind === kind ? employer.name : ''} />
              </label>
              {kind === 'business' ? (
                <label>
                  {t('work.employer.registration')}
                  <span className="hint">{t('work.employer.registration_hint')}</span>
                  <input name="registration" required maxLength={WORK_RULES.registrationMaxLength} defaultValue={employer?.registration ?? ''} />
                </label>
              ) : null}
              <label>
                {t('work.employer.about')}
                <span className="hint">{t(kind === 'business' ? 'work.employer.about_business_hint' : 'work.employer.about_person_hint')}</span>
                <textarea name="about" required minLength={WORK_RULES.employerAboutMinLength} maxLength={WORK_RULES.employerAboutMaxLength} defaultValue={employer?.about ?? ''} />
              </label>
              <label>
                {t('work.employer.website')}
                <input name="website" type="url" placeholder="https://" defaultValue={employer?.website ?? ''} />
              </label>
              <label>
                {t('work.form.location')}
                <select name="locationId" required defaultValue={employer?.locationId ?? ''}>
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
                <span className="hint">{t('work.employer.whatsapp_hint')}</span>
                <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" defaultValue={employer?.whatsappE164 ?? ''} />
              </label>
              <button className="btn btn-gold" type="submit">
                {t(employer ? 'work.employer.save' : 'work.employer.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </SiteShell>
  );
}
