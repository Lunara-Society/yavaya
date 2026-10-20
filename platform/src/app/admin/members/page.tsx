import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookUpMember, SANCTION_REASONS } from '@/server/domains/access/sanctions';
import { formatDate } from '@/ui/mercadito/format';
import { memberAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * One member at a time: find by YAY ID or exact email, see where they stand,
 * act. Each action sits behind a <details> and needs a written note, so a
 * sanction is never one stray tap — and each is checked again on the server.
 */
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'users.read'))) notFound();
  const session = await currentSession();
  const actor = session ? { userId, status: session.user.status } : null;
  const q = (query.q ?? '').slice(0, 100);
  const [found, canSuspend, canBan, canRestore, canResetTwoStep] = await Promise.all([
    q ? lookUpMember(db(), actor, q) : Promise.resolve(null),
    hasPermission(db(), userId, 'users.suspend'),
    hasPermission(db(), userId, 'users.ban'),
    hasPermission(db(), userId, 'users.restore'),
    hasPermission(db(), userId, 'users.verify_identity'),
  ]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const sanctioned = found?.status === 'suspended' || found?.status === 'banned';
  const self = found?.id === userId;

  const action = (what: 'suspend' | 'ban' | 'reinstate' | 'two_step' | 'sign_out', help?: string, withReason = false) =>
    found ? (
      <details className="staff-remove">
        <summary>{t(`sanctions.do.${what}`)}</summary>
        <form action={memberAction} className="mk-form" style={{ marginTop: 10 }}>
          <input type="hidden" name="userId" value={found.id} />
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="do" value={what} />
          {help ? <p className="muted mb0">{help}</p> : null}
          {withReason ? (
            <label>
              {t('sanctions.reason')}
              <select name="reason" defaultValue="other">
                {SANCTION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(`sanctions.reason.${reason}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            {t('sanctions.note')}
            <textarea name="note" required minLength={5} maxLength={500} style={{ minHeight: 90 }} />
          </label>
          <button className={`btn btn-line${what === 'ban' || what === 'suspend' ? ' staff-danger' : ''}`} type="submit">
            {t(`sanctions.do.${what}`)}
          </button>
        </form>
      </details>
    ) : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/admin">← {t('ops.title')}</Link>
          </p>
          <h1>{t('sanctions.title')}</h1>
          <p className="lead mb0">{t('sanctions.lead')}</p>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('sanctions.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <form className="sc-filter" action="/admin/members">
          <label style={{ flex: 1 }}>
            <span className="sr-only">{t('sanctions.search')}</span>
            <input name="q" defaultValue={q} placeholder={t('sanctions.search')} minLength={3} />
          </label>
          <button className="btn btn-line" type="submit">
            {t('sanctions.search_submit')}
          </button>
        </form>
        {q && !found ? <p className="muted">{t('sanctions.not_found')}</p> : null}
        {found ? (
          <article className="card" style={{ marginTop: 16 }}>
            <h2 className="h-md" style={{ fontSize: '1.3rem' }}>
              {found.displayName} · {found.yayId}
            </h2>
            <p className="muted mb0">{found.email}</p>
            <dl className="staff-facts">
              <dt>{t('sanctions.status')}</dt>
              <dd>
                <strong>{t(`sanctions.status.${found.status}` as MessageKey)}</strong>
              </dd>
              <dt>{t('sanctions.joined')}</dt>
              <dd>{formatDate(found.createdAt, locale)}</dd>
              <dt>{t('sanctions.email_verified')}</dt>
              <dd>{found.emailVerified ? t('sanctions.yes') : t('sanctions.no')}</dd>
              <dt>{t('sanctions.two_step')}</dt>
              <dd>{found.twoStep ? t('sanctions.yes') : t('sanctions.no')}</dd>
              <dt>{t('sanctions.sessions')}</dt>
              <dd>{found.liveSessions}</dd>
              {found.staffRoles.length > 0 ? (
                <>
                  <dt>{t('sanctions.staff')}</dt>
                  <dd>{found.staffRoles.map((role) => t(`staff.role.${role}` as MessageKey)).join(', ')}</dd>
                </>
              ) : null}
            </dl>

            <h3 style={{ marginTop: 18 }}>{t('sanctions.history')}</h3>
            {found.history.length === 0 ? <p className="muted">{t('sanctions.history_empty')}</p> : null}
            <ul className="staff-history">
              {found.history.map((entry, index) => (
                <li key={index}>
                  <span className="muted">{formatDate(entry.issuedAt, locale)}</span> · {t(`sanctions.type.${entry.type}` as MessageKey)} ·{' '}
                  {t(`sanctions.reason.${entry.reason}` as MessageKey)}
                  {entry.revokedAt ? <span className="muted"> ({t('sanctions.revoked')})</span> : null}
                  {entry.note ? <span className="muted"> — {entry.note}</span> : null}
                </li>
              ))}
            </ul>

            {self ? null : (
              <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                {canSuspend && found.liveSessions > 0 ? action('sign_out') : null}
                {canResetTwoStep && found.twoStep ? action('two_step', t('sanctions.two_step_help')) : null}
                {canSuspend && !sanctioned ? action('suspend', t('sanctions.suspend_help'), true) : null}
                {canBan && found.status !== 'banned' ? action('ban', undefined, true) : null}
                {canRestore && sanctioned ? action('reinstate') : null}
              </div>
            )}
          </article>
        ) : null}
      </div>
    </SiteShell>
  );
}
