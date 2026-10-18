import Link from 'next/link';
import type { Translator } from '@/i18n';
import { SESSION_RULES } from '@/config/business-rules';
import { GoogleButton } from './google-button';

/**
 * The top of the sign-in and registration pages: the two as tabs, any notice
 * (signed out, session closed, Google said no), and "Continuar con Google"
 * before the email form when it is configured.
 */
export function AuthEntry({
  t,
  active,
  google,
  googleHref,
  remembered,
  notice,
}: {
  t: Translator;
  active: 'login' | 'register';
  google: boolean;
  googleHref: string;
  /** A Google account signed in here before: offer to switch, since the button goes straight back to it. */
  remembered: boolean;
  notice: 'signed_out' | 'ended' | 'cancelled' | 'failed' | 'unavailable' | 'busy' | null;
}) {
  const noticeText =
    notice === 'signed_out'
      ? t('auth.notice.signed_out')
      : notice === 'ended'
        ? t('auth.bar.ended', { hours: SESSION_RULES.idleTimeoutMinutes / 60 })
        : notice
          ? t(`auth.google.error.${notice}`)
          : null;
  return (
    <>
      <nav className="auth-tabs" aria-label={t('auth.bar.label')}>
        <Link href="/login" aria-current={active === 'login' ? 'page' : undefined}>
          {t('auth.submit_login')}
        </Link>
        <Link href="/register" aria-current={active === 'register' ? 'page' : undefined}>
          {t('auth.submit_register')}
        </Link>
      </nav>
      {noticeText ? (
        <p className="auth-notice" role="status">
          {noticeText}
        </p>
      ) : null}
      {google ? (
        <div className="auth-google">
          <GoogleButton href={googleHref} label={active === 'login' ? t('auth.google.continue') : t('auth.google.register')} className="btn-google-wide" />
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
    </>
  );
}
