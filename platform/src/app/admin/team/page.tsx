import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { APPOINTABLE_ROLES, searchMembers, staffList } from '@/server/domains/access/staff';
import { formatDate } from '@/ui/mercadito/format';
import { appointAction, removeAppointmentAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Who holds which staff role, and appointing someone new. Admin only. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'roles.manage'))) notFound();
  const session = await currentSession();
  const actor = session ? { userId, status: session.user.status } : null;
  const q = (query.q ?? '').slice(0, 100);
  const [staff, results] = await Promise.all([staffList(db(), actor), q ? searchMembers(db(), actor, q) : Promise.resolve([])]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/admin">← {t('ops.title')}</Link>
          </p>
          <h1>{t('staff.title')}</h1>
          <p className="lead mb0">{t('staff.lead')}</p>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {query.done ? <p className="mk-banner" role="status">{t('staff.done')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        <h2 className="h-md" style={{ fontSize: '1.3rem' }}>{t('staff.roles_title')}</h2>
        <ul className="staff-roles">
          {APPOINTABLE_ROLES.map((role) => (
            <li key={role}>
              <strong>{t(`staff.role.${role}` as MessageKey)}</strong> — {t(`staff.role.${role}.what` as MessageKey)}
            </li>
          ))}
        </ul>

        <h2 className="h-md" style={{ fontSize: '1.3rem', marginTop: 28 }}>{t('staff.appoint_title')}</h2>
        <form className="sc-filter" action="/admin/team">
          <label style={{ flex: 1 }}>
            <span className="sr-only">{t('staff.search')}</span>
            <input name="q" defaultValue={q} placeholder={t('staff.search')} minLength={2} />
          </label>
          <button className="btn btn-line" type="submit">
            {t('sanctuary.churches.filter')}
          </button>
        </form>
        {q && results.length === 0 ? <p className="muted">{t('staff.no_results')}</p> : null}
        <ul className="staff-list">
          {results.map((m) => (
            <li key={m.id} className="card">
              <p className="mb0">
                <strong>{m.displayName}</strong> · {m.yayId} · {m.email} {m.status !== 'active' ? <span className="muted">({t(`staff.status.${m.status}` as MessageKey)})</span> : null}
              </p>
              <div className="staff-actions">
                {APPOINTABLE_ROLES.map((role) =>
                  m.roles.includes(role) ? (
                    <form key={role} action={removeAppointmentAction}>
                      <input type="hidden" name="userId" value={m.id} />
                      <input type="hidden" name="role" value={role} />
                      <input type="hidden" name="q" value={q} />
                      <button className="btn btn-line staff-on" type="submit">
                        ✓ {t(`staff.role.${role}` as MessageKey)} · {t('staff.remove')}
                      </button>
                    </form>
                  ) : (
                    <form key={role} action={appointAction}>
                      <input type="hidden" name="userId" value={m.id} />
                      <input type="hidden" name="role" value={role} />
                      <input type="hidden" name="q" value={q} />
                      <button className="btn btn-line" type="submit" disabled={m.status !== 'active'}>
                        + {t(`staff.role.${role}` as MessageKey)}
                      </button>
                    </form>
                  ),
                )}
              </div>
            </li>
          ))}
        </ul>

        <h2 className="h-md" style={{ fontSize: '1.3rem', marginTop: 28 }}>{t('staff.current_title')}</h2>
        {staff.length === 0 ? <p className="muted">{t('staff.none')}</p> : null}
        <ul className="staff-list">
          {staff.map((s) => (
            <li key={`${s.id}-${s.roleKey}`} className="card">
              <p className="mb0">
                <strong>{t(`staff.role.${s.roleKey}` as MessageKey)}</strong> · {s.displayName} · {s.yayId} · {s.email}
              </p>
              <p className="muted mb0">{t('staff.since', { date: formatDate(s.grantedAt, locale) })}</p>
              {(APPOINTABLE_ROLES as readonly string[]).includes(s.roleKey) ? (
                <form action={removeAppointmentAction}>
                  <input type="hidden" name="userId" value={s.id} />
                  <input type="hidden" name="role" value={s.roleKey} />
                  <button className="btn btn-line" type="submit">
                    {t('staff.remove')}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
