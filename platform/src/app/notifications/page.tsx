import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { Icon } from '@/ui/site/icons';
import { listNotifications } from '@/server/domains/notifications/service';
import { markAllReadAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('notifications.title'), robots: { index: false } };
}

const CATEGORY_ICON = { community: 'community', mercadito: 'mercadito', services: 'services', sanctuary: 'sanctuary', moderation: 'flag', account: 'id' } as const;

function when(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default async function NotificationsPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const items = await listNotifications(db(), userId);
  const unread = items.filter((item) => !item.read).length;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap cm-column">
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>{t('notifications.title')}</h1>
            {unread > 0 ? (
              <form action={markAllReadAction}>
                <button className="btn btn-line" type="submit">
                  {t('notifications.mark_all')}
                </button>
              </form>
            ) : null}
          </div>
          <p className="muted mb0">{t('notifications.lead')}</p>
          <p className="mb0" style={{ marginTop: 6 }}>
            <Link href="/settings#notifications">{t('notifications.settings')} →</Link>
          </p>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {items.length === 0 ? (
          <p className="sc-empty">{t('notifications.empty')}</p>
        ) : (
          <ul className="nt-list">
            {items.map((item) => (
              <li key={item.id}>
                <a className={item.read ? 'nt-item' : 'nt-item nt-unread'} href={`/notifications/open/${item.id}`}>
                  <span className="nt-icon" aria-hidden="true">
                    <Icon name={CATEGORY_ICON[item.category as keyof typeof CATEGORY_ICON] ?? 'bell'} />
                  </span>
                  <span className="nt-text">
                    <span className="nt-title">{t(item.titleKey as MessageKey, item.params)}</span>
                    {item.bodyKey ? <span className="nt-body">{t(item.bodyKey as MessageKey, item.params)}</span> : null}
                    <span className="nt-when">{when(item.createdAt, locale)}</span>
                  </span>
                  {!item.read ? <span className="nt-dot" aria-label={t('notifications.unread')} /> : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
