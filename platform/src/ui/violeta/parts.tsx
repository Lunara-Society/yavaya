import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MessageKey, Translator } from '@/i18n';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { intlLocale } from '@/ui/mercadito/format';
import { QuickExit } from './client';

/**
 * Espacio Violeta has its own frame. The site header shows the member's real
 * name; here, someone looking over her shoulder must see none of it.
 */
export function VioletaShell({
  t,
  active,
  unread = 0,
  guardian = false,
  children,
}: {
  t: Translator;
  active?: 'room' | 'private' | 'settings' | null;
  unread?: number;
  guardian?: boolean;
  children: ReactNode;
}) {
  const current = (key: string) => (key === active ? ('page' as const) : undefined);
  return (
    <div className="vt tone-violeta">
      <header className="vt-top">
        <div className="wrap vt-top-in">
          <Link className="vt-brand" href="/violeta">
            {t('violeta.name')}
          </Link>
          {active !== null ? (
            <nav className="vt-nav" aria-label={t('violeta.nav.label')}>
              <Link href="/violeta/sala" aria-current={current('room')}>
                {t('violeta.nav.room')}
              </Link>
              <Link href="/violeta/privado" aria-current={current('private')}>
                {t('violeta.nav.private')}
                {unread > 0 ? <span className="vt-count">{unread}</span> : null}
              </Link>
              <Link href="/violeta/ajustes" aria-current={current('settings')}>
                {t('violeta.nav.settings')}
              </Link>
              {guardian ? <Link href="/admin/violeta">{t('violeta.nav.guardian')}</Link> : null}
            </nav>
          ) : null}
          <QuickExit url={SAFE_SPACE_RULES.quickExitUrl} label={t('violeta.exit')} hint={t('violeta.exit_hint')} />
        </div>
      </header>
      <main id="main" className="wrap vt-main">
        {children}
      </main>
    </div>
  );
}

/** A professional is never mistaken for a woman like her: a badge, and a different colour. */
export function Who({ t, handle, kind, profession, online }: { t: Translator; handle: string; kind: string; profession: string | null; online?: boolean }) {
  return (
    <span className={kind === 'professional' ? 'vt-who pro' : 'vt-who'}>
      {online ? <span className="vt-dot" aria-label={t('violeta.online')} title={t('violeta.online')} /> : null}
      <strong>{handle}</strong>
      {kind === 'professional' ? <span className="vt-badge">{t(`violeta.profession.${profession ?? 'psychology'}` as MessageKey)}</span> : null}
    </span>
  );
}

export function when(date: Date, locale: string, now = new Date()): string {
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(intlLocale(locale), sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ErrorNote({ t, error }: { t: Translator; error?: string }) {
  const key = error && /^[a-z_.]+$/.test(error) ? error : null;
  return key ? <p className="mk-error">{t(key as MessageKey)}</p> : null;
}
