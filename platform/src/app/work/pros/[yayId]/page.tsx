import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { parseYayId } from '@/server/domains/identity/yay-id';
import { profilePage, WORK_REPORT_CATEGORIES } from '@/server/domains/work/service';
import { reportWorkAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** A professional profile, for members: what they do and where to see their work. */
export default async function ProProfilePage({ params, searchParams }: { params: Promise<{ yayId: string }>; searchParams: Promise<{ reported?: string; error?: string }> }) {
  const [{ yayId }, query] = await Promise.all([params, searchParams]);
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const digits = parseYayId(decodeURIComponent(yayId));
  if (!digits) notFound();
  const profile = await profilePage(db(), { yayDigits: digits, locale });
  if (!profile) notFound();
  const page = `/work/pros/${profile.yayId}`;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/work">← {t('work.back')}</Link>
        </p>
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <h1 className="h-md">{profile.displayName}</h1>
        <p className="lead">{profile.headline}</p>
        <p className="sv-meta">
          {profile.fields.map((value) => t(`work.field.${value}` as MessageKey)).join(' · ')} · {profile.placeName}
        </p>
        <p className="sv-meta">
          {t('services.provider.reputation', { score: profile.reputation })}
          {profile.experienceYears !== null ? ` · ${t('work.profile.years', { count: profile.experienceYears })}` : ''}
          {profile.openToWork ? ` · ${t('work.profile.open_badge')}` : ''}
        </p>
        <p className="cm-body">{profile.about}</p>
        {profile.skills ? (
          <p>
            <strong>{t('work.profile.skills')}:</strong> {profile.skills}
          </p>
        ) : null}
        {profile.portfolioLinks.length > 0 ? (
          <ul className="wk-links">
            {profile.portfolioLinks.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer nofollow">
                  {link.replace(/^https:\/\//, '')}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {profile.userId !== userId ? (
          <details className="card sc-section">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('services.report.provider_title')}</summary>
            <form action={reportWorkAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
              <input type="hidden" name="subject" value="profile" />
              <input type="hidden" name="subjectId" value={profile.userId} />
              <input type="hidden" name="from" value={page} />
              <label>
                {t('services.report.category')}
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {WORK_REPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`work.report.category.${category}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('services.report.description')}
                <textarea name="description" maxLength={1000} style={{ minHeight: 70 }} />
              </label>
              <button className="btn btn-line" type="submit">
                {t('services.report.submit')}
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </SiteShell>
  );
}
