import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { shellContext } from '@/ui/shell-context';
import { hasPermission } from '@/server/domains/access/authorize';
import { reviewQueue, safeSpaceAvailable } from '@/server/domains/safe-space/service';
import { ErrorNote, VioletaShell, when } from '@/ui/violeta/parts';
import { VIOLETA_METADATA } from '@/app/violeta/meta';
import { resolveReportAction } from '@/app/violeta/actions';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

/**
 * Guardians only. A guardian sees the reported message, the name it was
 * written under and how often that name was reported — never the account
 * behind it, which no decision here needs.
 */
export default async function VioletaGuardian({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const { t, locale, userId } = await shellContext();
  if (!userId) redirect('/login');
  if (!(await hasPermission(db(), userId, 'safe_space.review'))) redirect('/account');
  const reports = safeSpaceAvailable() ? await reviewQueue(db(), { userId, status: 'active' }) : [];
  return (
    <VioletaShell t={t} active="room" guardian>
      <div className="cm-column">
        <h1 className="vt-title">{t('violeta.guardian.title')}</h1>
        <p className="muted">{t('violeta.guardian.guidance')}</p>
        {query.done ? <p className="mk-banner" role="status">{t('violeta.guardian.done')}</p> : null}
        <ErrorNote t={t} error={query.error} />
        {reports.length === 0 ? <p className="muted">{t('violeta.guardian.empty')}</p> : null}
        <ul className="vt-threads">
          {reports.map((report) => (
            <li key={report.id} className="card vt-case">
              <p className="sv-kicker">
                {t(`violeta.report.category.${report.category}` as MessageKey)} · {t(report.source === 'room' ? 'violeta.guardian.in_room' : 'violeta.guardian.in_private')} · {when(report.createdAt, locale)}
              </p>
              <p>
                <strong>{report.reportedHandle}</strong> {report.reportedKind === 'professional' ? `· ${t('violeta.guardian.professional')}` : ''}{' '}
                {report.priorReports > 0 ? <span className="vt-known">{t('violeta.guardian.prior', { count: report.priorReports })}</span> : null}
              </p>
              <blockquote className="vt-text">{report.text ?? t('violeta.unreadable')}</blockquote>
              {report.note ? <p className="muted">{t('violeta.guardian.note', { note: report.note })}</p> : null}
              <form action={resolveReportAction} className="btn-row">
                <input type="hidden" name="reportId" value={report.id} />
                <button className="btn btn-line" type="submit" name="decision" value="dismiss">
                  {t('violeta.guardian.dismiss')}
                </button>
                <button className="btn btn-line" type="submit" name="decision" value="remove">
                  {t('violeta.guardian.remove')}
                </button>
                <button className="btn btn-gold" type="submit" name="decision" value="ban">
                  {t('violeta.guardian.ban')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </VioletaShell>
  );
}
