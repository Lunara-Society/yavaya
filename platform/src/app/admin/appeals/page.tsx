import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SANCTION_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { openAppeals } from '@/server/domains/access/sanctions';
import { formatDate } from '@/ui/mercadito/format';
import { appealDecisionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Appeals against a suspension or ban, oldest first. The admin sees the
 * internal note beside the member's words; the member only ever sees the
 * response written here.
 */
export default async function AppealsPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'users.restore'))) notFound();
  const session = await currentSession();
  const appeals = await openAppeals(db(), session ? { userId, status: session.user.status } : null);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/admin">← {t('ops.title')}</Link>
          </p>
          <h1>{t('appeal.admin.title')}</h1>
          <p className="lead mb0">{t('appeal.admin.lead')}</p>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t(query.done === 'lifted' ? 'appeal.admin.done_lifted' : 'appeal.admin.done_upheld')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        {appeals.length === 0 ? <p className="muted">{t('appeal.admin.empty')}</p> : null}
        {appeals.map((appeal) => (
          <article key={appeal.id} className="card" style={{ marginTop: 16 }}>
            <h2 className="h-md" style={{ fontSize: '1.2rem' }}>
              <Link href={`/admin/members?q=${encodeURIComponent(appeal.yayId)}`}>
                {appeal.displayName} · {appeal.yayId}
              </Link>
            </h2>
            <dl className="staff-facts">
              <dt>{t('appeal.admin.sanction')}</dt>
              <dd>
                {t(`sanctions.type.${appeal.type}` as MessageKey)} · {t(`sanctions.reason.${appeal.reason}` as MessageKey)}
              </dd>
              <dt>{t('appeal.admin.issued')}</dt>
              <dd>{formatDate(appeal.issuedAt, locale)}</dd>
              {appeal.type === 'suspension' ? (
                <>
                  <dt>{t('appeal.admin.until')}</dt>
                  <dd>{appeal.until ? formatDate(appeal.until, locale) : t('sanctions.duration.review')}</dd>
                </>
              ) : null}
              <dt>{t('appeal.admin.note')}</dt>
              <dd className="muted">{appeal.note ?? '—'}</dd>
              <dt>{t('appeal.admin.received')}</dt>
              <dd>{formatDate(appeal.createdAt, locale)}</dd>
            </dl>
            <h3 style={{ marginTop: 14 }}>{t('appeal.admin.their_words')}</h3>
            <blockquote style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{appeal.body}</blockquote>
            <form action={appealDecisionAction} className="mk-form" style={{ marginTop: 14 }}>
              <input type="hidden" name="appealId" value={appeal.id} />
              <label>
                {t('appeal.admin.response')}
                <textarea name="response" required minLength={5} maxLength={SANCTION_RULES.responseMaxLength} style={{ minHeight: 90 }} />
              </label>
              <p className="muted mb0">{t('appeal.admin.response_help')}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-line" type="submit" name="outcome" value="lifted">
                  {t('appeal.admin.lift')}
                </button>
                <button className="btn btn-line staff-danger" type="submit" name="outcome" value="upheld">
                  {t('appeal.admin.uphold')}
                </button>
              </div>
            </form>
          </article>
        ))}
      </div>
    </SiteShell>
  );
}
