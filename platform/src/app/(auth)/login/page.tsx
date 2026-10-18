import type { Metadata } from 'next';
import { AppShell } from '@/ui/components/app-shell';
import { AuthEntry } from '@/ui/components/auth-entry';
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
  const notice = googleNotice ?? (query.salida ? 'signed_out' : ended ? 'ended' : null);

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false}>
      <div className="mx-auto w-full max-w-md">
        <AuthEntry
          t={t}
          active="login"
          google={googleSignIn().available}
          googleHref="/auth/google"
          remembered={Boolean(await googleHint())}
          notice={notice}
        />
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.login.title')}</h1>

        <LoginForm
          labels={{
            email: t('auth.email'),
            password: t('auth.password'),
            submit: t('auth.submit_login'),
          }}
        />
      </div>
    </AppShell>
  );
}
