import { db } from '@/server/db/client';
import { shellContext } from '@/ui/shell-context';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { professionals, roomMessages, whoIsHere } from '@/server/domains/safe-space/service';
import { ErrorNote, VioletaShell, when, Who } from '@/ui/violeta/parts';
import { LiveRefresh } from '@/ui/violeta/client';
import { VIOLETA_METADATA } from '../meta';
import { violetaPage } from '../guard';
import { ReportForm } from '../report';
import { deleteMessageAction, postRoomAction, startThreadAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

/** The shared room: everyone here reads it; nobody outside does. */
export default async function Room({ searchParams }: { searchParams: Promise<{ error?: string; reported?: string; welcome?: string }> }) {
  const query = await searchParams;
  const { t, locale, userId } = await shellContext();
  const { member, unread, guardian } = await violetaPage(userId);
  const [messages, here, pros] = await Promise.all([roomMessages(db(), member), whoIsHere(db()), professionals(db())]);
  const isWoman = member.kind === 'member';

  return (
    <VioletaShell t={t} active="room" unread={unread} guardian={guardian}>
      <LiveRefresh seconds={SAFE_SPACE_RULES.refreshSeconds} pingSeconds={SAFE_SPACE_RULES.presencePingSeconds} />
      <div className="vt-room">
        <section aria-labelledby="room-title">
          <h1 id="room-title" className="vt-title">
            {t('violeta.room.title')}
          </h1>
          <p className="muted">
            {t('violeta.room.you_are')} <Who t={t} handle={member.handle} kind={member.kind} profession={member.profession} />
          </p>
          {query.welcome ? <p className="mk-banner" role="status">{t('violeta.room.welcome', { name: member.handle })}</p> : null}
          {query.reported ? <p className="mk-banner" role="status">{t('violeta.report.done')}</p> : null}
          <ErrorNote t={t} error={query.error} />

          {/* Newest first in the markup, shown newest last: column-reverse keeps the view at the latest message without script. */}
          <ol className="vt-messages" aria-live="polite">
            {messages.length === 0 ? <li className="muted">{t('violeta.room.empty')}</li> : null}
            {[...messages].reverse().map((m) => (
              <li key={m.id} className={`vt-msg${m.kind === 'professional' ? ' pro' : ''}${m.mine ? ' mine' : ''}`}>
                <p className="vt-msg-head">
                  <Who t={t} handle={m.handle} kind={m.kind} profession={m.profession} />
                  {m.talkedBefore && !m.mine ? <span className="vt-known">{t('violeta.room.talked_before')}</span> : null}
                  <span className="vt-time">{when(m.createdAt, locale)}</span>
                </p>
                <p className="vt-text">{m.text ?? t('violeta.unreadable')}</p>
                <div className="vt-msg-actions">
                  {m.mine ? (
                    <form action={deleteMessageAction}>
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="source" value="room" />
                      <input type="hidden" name="from" value="/violeta/sala" />
                      <button className="vt-link" type="submit">
                        {t('violeta.delete')}
                      </button>
                    </form>
                  ) : (
                    <>
                      {isWoman ? (
                        <form action={startThreadAction}>
                          <input type="hidden" name="memberId" value={m.authorId} />
                          <button className="vt-link" type="submit">
                            {t('violeta.talk_privately')}
                          </button>
                        </form>
                      ) : null}
                      <ReportForm t={t} source="room" messageId={m.id} from="/violeta/sala" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <form id="end" action={postRoomAction} className="mk-form vt-compose">
            <label>
              <span className="sr-only">{t('violeta.room.write')}</span>
              <textarea name="text" required maxLength={SAFE_SPACE_RULES.messageMaxLength} placeholder={t('violeta.room.placeholder')} />
            </label>
            <p className="hint">{t('violeta.room.compose_hint')}</p>
            <button className="btn btn-gold" type="submit">
              {t('violeta.send')}
            </button>
          </form>
        </section>

        <aside className="vt-side">
          <h2 className="vt-h">{t('violeta.here.title', { count: here.length })}</h2>
          {here.length === 0 ? <p className="muted">{t('violeta.here.nobody')}</p> : null}
          <ul className="vt-people">
            {here.map((p) => (
              <li key={p.id}>
                <Who t={t} handle={p.handle} kind={p.kind} profession={p.profession} online />
                {p.id === member.id ? <span className="muted"> · {t('violeta.here.you')}</span> : null}
              </li>
            ))}
          </ul>
          <p className="hint muted">{t('violeta.here.hidden_hint')}</p>

          <h2 className="vt-h">{t('violeta.pros.title')}</h2>
          <p className="hint muted">{t('violeta.pros.explain')}</p>
          {pros.length === 0 ? <p className="muted">{t('violeta.pros.none')}</p> : null}
          <ul className="vt-people">
            {pros.map((p) => (
              <li key={p.id}>
                <Who t={t} handle={p.handle} kind={p.kind} profession={p.profession} online={p.online} />
                {isWoman ? (
                  <form action={startThreadAction}>
                    <input type="hidden" name="memberId" value={p.id} />
                    <button className="btn btn-line vt-small" type="submit">
                      {t('violeta.pros.talk')}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </VioletaShell>
  );
}
