import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import { SESSION_RULES } from '@/config/business-rules';
import { Mark } from '@/ui/site/icons';
import { GoogleButton } from './google-button';

export type AuthNotice = 'signed_out' | 'password_reset' | 'ended' | 'cancelled' | 'failed' | 'unavailable' | 'busy' | null;

/**
 * The one shape of every way in: the seal and a title, any notice, Google
 * first when it is configured, the email form, and a single line to switch
 * between signing in and creating an account.
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
  );
}
