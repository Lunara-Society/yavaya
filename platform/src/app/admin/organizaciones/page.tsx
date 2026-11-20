import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { hasPermission } from '@/server/domains/access/authorize';
import { organisationsToReview } from '@/server/domains/aid/service';
import { reviewOrganisationAction } from '@/app/mirador/actions';
import { signInPath } from '@/server/auth/sign-in-path';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Food banks, soup kitchens and shelters waiting to be checked, and the
 * approved ones, which can be suspended (`causes.review`). Approving one lets
 * it ask for food given "para comedores" and ask the neighbourhood for help.
 */
export default async function OrganisationsReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'causes.review'))) notFound();
  const rows = await organisationsToReview(db());
  const pending = rows.filter((row) => row.org.status === 'pending');
  const approved = rows.filter((row) => row.org.status === 'approved');
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const card = (row: (typeof rows)[number], decisions: Array<'approve' | 'reject' | 'suspend'>) => (
    <article key={row.org.userId} className="card">
      <p className="muted mb0">
        {formatDate(row.org.createdAt, locale)} · {t(`aid.kind.${row.org.kind}` as MessageKey)} · {row.place}
      </p>
      <h3 style={{ fontSize: '1.2rem', margin: '4px 0' }}>{row.org.name}</h3>
      <p className="cm-body">{row.org.about}</p>
      {row.org.registration ? <p className="mb0">{t('aid.review.registration', { number: row.org.registration })}</p> : null}
      <p className="mb0">{t('aid.review.member', { name: row.member, yayId: row.yayId })}</p>
      <p className="muted mb0">{row.org.whatsappE164}</p>
      <form action={reviewOrganisationAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
        <input type="hidden" name="organisationUserId" value={row.org.userId} />
        <label>
          {t('sanctuary.review.note')}
          <textarea name="note" maxLength={1000} style={{ minHeight: 70 }} />
        </label>
        <div className="btn-row">
          {decisions.map((decision) => (
            <button key={decision} className={decision === 'approve' ? 'btn btn-gold' : 'btn btn-line'} type="submit" name="decision" value={decision}>
              {t(`aid.review.${decision}` as MessageKey)}
            </button>
          ))}
        </div>
      </form>
    </article>
  );
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <p>
            <Link href="/admin">← {t('nav.panel')}</Link>
          </p>
          <h1>{t('aid.review.title')}</h1>
          <p className="lead mb0">{t('aid.review.guidance')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('sanctuary.review.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <h2 className="sc-h">{t('aid.review.pending')}</h2>
        {pending.length === 0 ? <p className="mk-empty">{t('aid.review.none')}</p> : <div className="sc-list">{pending.map((row) => card(row, ['approve', 'reject']))}</div>}
        <h2 className="sc-h">{t('aid.review.approved')}</h2>
        {approved.length === 0 ? <p className="mk-empty">{t('aid.review.none_approved')}</p> : <div className="sc-list">{approved.map((row) => card(row, ['suspend']))}</div>}
      </div>
    </SiteShell>
  );
}
