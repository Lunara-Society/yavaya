import type { Metadata } from 'next';
import Link from 'next/link';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { verifyUnsubscribe } from '@/server/domains/notifications/digest';
import { digestFromLinkAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Where the email's "stop" link lands. It asks before acting: mail scanners
 * open links, and a summary switched off by a robot is one the member never
 * chose to lose. No sign-in needed — the link is signed.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; s?: string; done?: string }> }) {
  const query = await searchParams;
  const { c, t, language, theme, member } = await siteContext();
  const userId = query.u ?? '';
  const signature = query.s ?? '';
  const valid = verifyUnsubscribe(userId, signature);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap cm-column">
          <h1>{t('digest.unsubscribe.title')}</h1>
          {!valid ? (
            <p className="lead">{t('digest.unsubscribe.invalid')}</p>
          ) : query.done === 'off' ? (
            <>
              <p className="lead">{t('digest.unsubscribe.done')}</p>
              <form action={digestFromLinkAction}>
                <input type="hidden" name="u" value={userId} />
                <input type="hidden" name="s" value={signature} />
                <input type="hidden" name="enabled" value="true" />
                <button className="btn btn-line" type="submit">
                  {t('digest.unsubscribe.undo')}
                </button>
              </form>
            </>
          ) : query.done === 'on' ? (
            <p className="lead">{t('digest.unsubscribe.back_on')}</p>
          ) : (
            <>
              <p className="lead">{t('digest.unsubscribe.ask')}</p>
              <form action={digestFromLinkAction}>
                <input type="hidden" name="u" value={userId} />
                <input type="hidden" name="s" value={signature} />
                <input type="hidden" name="enabled" value="false" />
                <button className="btn btn-gold" type="submit">
                  {t('digest.unsubscribe.confirm')}
                </button>
              </form>
            </>
          )}
          <p className="muted" style={{ marginTop: 18 }}>
            {t('digest.unsubscribe.still_site')} <Link href="/settings#notifications">{t('notifications.settings')}</Link>
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
