import type { Metadata } from 'next';
import { AppShell } from '@/ui/components/app-shell';
import { AuthCard } from '@/ui/components/auth-card';
import { shellContext } from '@/ui/shell-context';
import { readSessionCookie } from '@/server/auth/cookies';
import { googleHint } from '@/server/auth/google-cookies';
import { googleSignIn } from '@/server/domains/identity/google';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const GOOGLE_NOTICES = ['cancelled', 'failed', 'unavailable', 'busy'] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ salida?: string; google?: string }> }) {
  const { t, language, theme, member } = await shellContext();
  const query = await searchParams;
  const googleNotice = GOOGLE_NOTICES.find((code) => code === query.google) ?? null;
  // A session cookie the server no longer honours: closed by the idle window.
  const ended = !member && Boolean(await readSessionCookie());
  const signedOut = Boolean(query.salida);
  const google = googleSignIn().available;

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt={signedOut ? 'after-sign-out' : 'auto'}>
      <AuthCard
        t={t}
        mode="login"
        title={t('auth.login.title')}
        subtitle={t(google ? 'auth.login.subtitle' : 'auth.login.subtitle_email')}
        notice={googleNotice ?? (signedOut ? 'signed_out' : ended ? 'ended' : null)}
        google={google}
        googleHref="/auth/google"
        remembered={Boolean(await googleHint())}
      >
        <LoginForm labels={{ email: t('auth.email'), password: t('auth.password'), submit: t('auth.submit_login') }} />
      </AuthCard>
    </AppShell>
  );
}
