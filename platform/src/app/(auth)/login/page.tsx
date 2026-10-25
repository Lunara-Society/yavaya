import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { AppShell } from '@/ui/components/app-shell';
import { AuthCard } from '@/ui/components/auth-card';
import { shellContext } from '@/ui/shell-context';
import { readSessionCookie } from '@/server/auth/cookies';
import { googleHint } from '@/server/auth/google-cookies';
import { safeNext } from '@/server/auth/return-path';
import { googleSignIn } from '@/server/domains/identity/google';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { absolute: t('auth.login.title') } };
}

const GOOGLE_NOTICES = ['cancelled', 'failed', 'unavailable', 'busy'] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ salida?: string; google?: string; clave?: string; next?: string }> }) {
  const { t, language, theme, member } = await shellContext();
  const query = await searchParams;
  const googleNotice = GOOGLE_NOTICES.find((code) => code === query.google) ?? null;
  // A session cookie the server no longer honours: closed by the idle window.
  const ended = !member && Boolean(await readSessionCookie());
  const signedOut = Boolean(query.salida);
  const google = googleSignIn().available;
  // Where the visitor was going when they were asked to sign in (return-path.ts).
  const next = safeNext(query.next);

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt={signedOut ? 'after-sign-out' : 'auto'}>
      <AuthCard
        t={t}
        mode="login"
        title={t('auth.login.title')}
        subtitle={t(google ? 'auth.login.subtitle' : 'auth.login.subtitle_email')}
        notice={googleNotice ?? (query.clave ? 'password_reset' : signedOut ? 'signed_out' : ended ? 'ended' : null)}
        google={google}
        googleHref={next === '/' ? '/auth/google' : `/auth/google?next=${encodeURIComponent(next)}`}
        remembered={Boolean(await googleHint())}
        next={next}
      >
        <LoginForm next={next} labels={{ email: t('auth.email'), password: t('auth.password'), submit: t('auth.submit_login'), forgot: t('auth.forgot.link') }} />
      </AuthCard>
    </AppShell>
  );
}
