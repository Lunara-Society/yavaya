import Link from 'next/link';
import { db } from '@/server/db/client';
import { shellContext } from '@/ui/shell-context';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { myThreads } from '@/server/domains/safe-space/service';
import { VioletaShell, when, Who } from '@/ui/violeta/parts';
import { LiveRefresh } from '@/ui/violeta/client';
import { VIOLETA_METADATA } from '../meta';
import { violetaPage } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

/** Her private conversations: the names she knows, and who is here now. */
export default async function PrivateList() {
  const { t, locale, userId } = await shellContext();
  const { member, unread, guardian } = await violetaPage(userId);
  const threads = await myThreads(db(), member);
  return (
    <VioletaShell t={t} active="private" unread={unread} guardian={guardian}>
      <LiveRefresh seconds={SAFE_SPACE_RULES.refreshSeconds * 2} pingSeconds={SAFE_SPACE_RULES.presencePingSeconds} />
      <div className="cm-column">
        <h1 className="vt-title">{t('violeta.private.title')}</h1>
        <p className="muted">{t('violeta.private.lead')}</p>
        {threads.length === 0 ? <p className="muted">{t(member.kind === 'professional' ? 'violeta.private.empty_pro' : 'violeta.private.empty')}</p> : null}
        <ul className="vt-threads">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link href={`/violeta/privado/${thread.id}`} className={thread.unread && !thread.blocked ? 'vt-thread unread' : 'vt-thread'}>
                <Who t={t} handle={thread.other.handle} kind={thread.other.kind} profession={thread.other.profession} online={thread.other.online} />
                <span className="vt-time">
                  {thread.blocked ? t('violeta.private.closed') : thread.unread ? t('violeta.private.new') : thread.lastMessageAt ? when(thread.lastMessageAt, locale) : t('violeta.private.no_messages')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </VioletaShell>
  );
}
