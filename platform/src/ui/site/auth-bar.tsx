import Link from 'next/link';
import type { Translator } from '@/i18n';
import { SESSION_RULES } from '@/config/business-rules';
import { GoogleButton } from '@/ui/components/google-button';

/**
 * The way in, at the very top of every page for someone signed out: enter,
 * create an account, or — when it is configured — continue with Google.
 * When the browser still holds a session the server has closed (two hours
 * without activity), it says so, so a returning member is not greeted as a
 * stranger.
 *
 * On a phone the bar is one row of buttons: the sentence is left out (the
 * buttons say it) unless the session ended, which is news worth the line.
 */
export function AuthBar({ t, google, ended }: { t: Translator; google: boolean; ended: boolean }) {
  return (
    <div className={ended ? 'authbar authbar-ended' : 'authbar'} role="region" aria-label={t('auth.bar.label')}>
      <div className="wrap authbar-in">
        <p className="authbar-text">
          {ended ? t('auth.bar.ended', { hours: SESSION_RULES.idleTimeoutMinutes / 60 }) : t('auth.bar.lead')}
        </p>
        <div className="authbar-actions">
          {google ? <GoogleButton href="/auth/google" label={t('auth.google.continue')} /> : null}
          <Link className="btn btn-line authbar-btn" href="/login">
            {t('auth.submit_login')}
          </Link>
          <Link className="btn btn-gold authbar-btn" href="/register">
            {t('auth.bar.register')}
          </Link>
        </div>
      </div>
    </div>
  );
}
