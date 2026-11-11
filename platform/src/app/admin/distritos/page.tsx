import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { signInPath } from '@/server/auth/sign-in-path';
import { BOARD_DISTRICTS, isBoardDistrict } from '@/config/boards';
import { BOARD_DECISIONS, boardQueue } from '@/server/domains/boards/service';
import { resolveBoardTicketAction } from '@/app/boards/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** The moderation queue of the six board districts. */
export default async function BoardModerationPage() {
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'moderation.queue.read'))) notFound();
  const session = await currentSession();
  const queue = await boardQueue(db(), session ? { userId, status: session.user.status } : null);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('board.mod.title')}</h1>
          <p className="lead mb0">{t('board.mod.lead')}</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingBottom: 56 }}>
        {queue.length === 0 ? (
          <p className="muted">{t('board.mod.empty')}</p>
        ) : (
          queue.map((item) => (
            <article key={item.ticketId} className="card" style={{ padding: 16, marginBottom: 14 }}>
              <p className="muted">
                {item.code} · {t(`mercadito.report.category.${item.category}` as MessageKey)} · {t('board.mod.reports', { count: item.reports })}
              </p>
              <h2 className="h-sm">
                {isBoardDistrict(item.post.district) ? (
                  <Link href={`/${BOARD_DISTRICTS[item.post.district].slug}/${item.post.id}`}>{item.post.title}</Link>
                ) : (
                  item.post.title
                )}
              </h2>
              <p className="muted">
                {isBoardDistrict(item.post.district) ? t(`district.${item.post.district}.name` as MessageKey) : item.post.district} · {item.post.authorName} · {item.post.authorYayId}
              </p>
              <p style={{ whiteSpace: 'pre-line' }}>{item.post.body}</p>
              <form action={resolveBoardTicketAction} className="mk-form">
                <input type="hidden" name="ticketId" value={item.ticketId} />
                <label>
                  {t('board.mod.note')}
                  <input name="note" maxLength={1000} />
                </label>
                <div className="btn-row">
                  {BOARD_DECISIONS.map((decision) => (
                    <button key={decision} className={decision === 'remove' ? 'btn btn-gold' : 'btn btn-line'} type="submit" name="decision" value={decision}>
                      {t(`board.mod.${decision}` as MessageKey)}
                    </button>
                  ))}
                </div>
              </form>
            </article>
          ))
        )}
      </div>
    </SiteShell>
  );
}
