import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { isDomainError } from '@/server/errors';
import { shellContext } from '@/ui/shell-context';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { getThread, markThreadRead } from '@/server/domains/safe-space/service';
import { ErrorNote, VioletaShell, when, Who } from '@/ui/violeta/parts';
import { LiveRefresh } from '@/ui/violeta/client';
import { VIOLETA_METADATA } from '../../meta';
import { violetaPage } from '../../guard';
import { ReportForm } from '../../report';
import { blockAction, deleteMessageAction, sendThreadAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A private conversation. Only these two people can read it. */
export default async function PrivateThread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { t, locale, userId } = await shellContext();
  const { member, guardian } = await violetaPage(userId);
  let thread;
  try {
    thread = await getThread(db(), member, id);
  } catch (error) {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  }
  await db().transaction((tx) => markThreadRead(tx, { viewer: member, threadId: id }));
  const page = `/violeta/privado/${id}`;
  const otherIsPro = thread.other.kind === 'professional';

  return (
    <VioletaShell t={t} active="private" guardian={guardian}>
      <LiveRefresh seconds={SAFE_SPACE_RULES.refreshSeconds} pingSeconds={SAFE_SPACE_RULES.presencePingSeconds} />
      <div className="cm-column">
        <p>
          <Link href="/violeta/privado">← {t('violeta.private.back')}</Link>
        </p>
        <h1 className="vt-title">
          <Who t={t} handle={thread.other.handle} kind={thread.other.kind} profession={thread.other.profession} online={thread.other.online} />
        </h1>
        <p className="muted">{thread.other.online ? t('violeta.private.online_now') : t('violeta.private.not_here')}</p>
        <p className="vt-sealed">{t(otherIsPro ? 'violeta.private.only_two_pro' : 'violeta.private.only_two')}</p>
        {query.reported ? <p className="mk-banner" role="status">{t('violeta.report.done')}</p> : null}
        <ErrorNote t={t} error={query.error} />

        <ol className="vt-messages" aria-live="polite">
          {thread.messages.length === 0 ? <li className="muted">{t('violeta.private.start')}</li> : null}
          {[...thread.messages].reverse().map((m) => (
            <li key={m.id} className={`vt-msg${m.kind === 'professional' ? ' pro' : ''}${m.mine ? ' mine' : ''}`}>
              <p className="vt-msg-head">
                <Who t={t} handle={m.handle} kind={m.kind} profession={m.profession} />
                <span className="vt-time">{when(m.createdAt, locale)}</span>
              </p>
              <p className="vt-text">{m.text ?? t('violeta.unreadable')}</p>
              <div className="vt-msg-actions">
                {m.mine ? (
                  <form action={deleteMessageAction}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="source" value="thread" />
                    <input type="hidden" name="from" value={page} />
                    <button className="vt-link" type="submit">
                      {t('violeta.delete')}
                    </button>
                  </form>
                ) : (
                  <ReportForm t={t} source="thread" messageId={m.id} from={page} />
                )}
              </div>
            </li>
          ))}
        </ol>

        {thread.blocked ? (
          <p className="mk-banner">{t(thread.blockedByMe ? 'violeta.private.you_closed' : 'violeta.private.they_closed')}</p>
        ) : (
          <form id="end" action={sendThreadAction} className="mk-form vt-compose">
            <input type="hidden" name="threadId" value={id} />
            <label>
              <span className="sr-only">{t('violeta.room.write')}</span>
              <textarea name="text" required maxLength={SAFE_SPACE_RULES.messageMaxLength} placeholder={t('violeta.private.placeholder')} />
            </label>
            <button className="btn btn-gold" type="submit">
              {t('violeta.send')}
            </button>
          </form>
        )}

        <form action={blockAction} className="vt-block">
          <input type="hidden" name="threadId" value={id} />
          {thread.blockedByMe ? (
            <button className="vt-link" type="submit" name="blocked" value="0">
              {t('violeta.private.reopen')}
            </button>
          ) : !thread.blocked ? (
            <>
              <button className="vt-link" type="submit" name="blocked" value="1">
                {t('violeta.private.close')}
              </button>
              <span className="hint muted"> {t('violeta.private.close_hint')}</span>
            </>
          ) : null}
        </form>
      </div>
    </VioletaShell>
  );
}
