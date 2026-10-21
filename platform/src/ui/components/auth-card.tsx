import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import { SESSION_RULES } from '@/config/business-rules';
import { Icon, Mark } from '@/ui/site/icons';
import { PageScene } from '@/ui/site/art';
import { GoogleButton } from './google-button';

export type AuthNotice = 'signed_out' | 'password_reset' | 'ended' | 'cancelled' | 'failed' | 'unavailable' | 'busy' | null;

/**
 * The one shape of every way in: the seal and a title, any notice, Google
 * first when it is configured, the email form, and a single line to switch
 * between signing in and creating an account.
 *
 * Beside it on a wide screen (below it on a phone), a full-colour photograph
 * and three things that are true of Yavaya — the moment someone decides to
 * join is the one that should look most like the place they are joining.
 * The form comes first in the document, so a keyboard or a screen reader
 * reaches it before the photograph.
 */
export function AuthCard({
  t,
  mode,
  title,
  subtitle,
  notice,
  google,
  googleHref,
  remembered,
  children,
}: {
  t: Translator;
  mode: 'login' | 'register';
  title: string;
  subtitle: string;
  notice: AuthNotice;
  google: boolean;
  googleHref: string;
  /** A Google account signed in here before: the button goes straight back to it, so offer to switch. */
  remembered: boolean;
  children: ReactNode;
}) {
  const noticeText =
    notice === 'signed_out'
      ? t('auth.notice.signed_out')
      : notice === 'password_reset'
        ? t('auth.notice.password_reset')
        : notice === 'ended'
          ? t('auth.bar.ended', { hours: SESSION_RULES.idleTimeoutMinutes / 60 })
          : notice
            ? t(`auth.google.error.${notice}`)
            : null;
  return (
    <div className="auth-split">
      <section className="auth-card">
        <header className="auth-head">
          <Mark size={56} />
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {noticeText ? (
          <p className="auth-notice" role="status">
            {noticeText}
          </p>
        ) : null}
        {google ? (
          <div className="auth-google">
            <GoogleButton href={googleHref} label={mode === 'login' ? t('auth.google.continue') : t('auth.google.register')} className="btn-google-wide" />
            {remembered ? (
              <a className="auth-other" href="/auth/google?otra=1">
                {t('auth.google.other')}
              </a>
            ) : null}
            <p className="auth-or">
              <span>{t('auth.or_email')}</span>
            </p>
          </div>
        ) : null}
        {children}
        <p className="auth-switch">
          {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
          <Link href={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? t('auth.bar.register') : t('auth.submit_login')}</Link>
        </p>
      </section>
      <aside className="auth-art">
        <PageScene name="trust" className="auth-art-photo" />
        <div className="auth-art-copy">
          <p className="auth-art-title">{t('auth.side.title')}</p>
          <p className="auth-art-lead">{t('auth.side.lead')}</p>
          <ul className="auth-art-points">
            <li>
              <span className="auth-art-icon">
                <Icon name="shield" />
              </span>
              <span>
                <b>{t('auth.side.one.title')}</b> {t('auth.side.one.text')}
              </span>
            </li>
            <li>
              <span className="auth-art-icon">
                <Icon name="tag" />
              </span>
              <span>
                <b>{t('auth.side.free.title')}</b> {t('auth.side.free.text')}
              </span>
            </li>
            <li>
              <span className="auth-art-icon">
                <Icon name="lock" />
              </span>
              <span>
                <b>{t('auth.side.data.title')}</b> {t('auth.side.data.text')}
              </span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
