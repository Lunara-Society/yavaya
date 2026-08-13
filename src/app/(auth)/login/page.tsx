import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const { t, language, theme, member } = await shellContext();

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.login.title')}</h1>

        <LoginForm
          labels={{
            email: t('auth.email'),
            password: t('auth.password'),
            submit: t('auth.submit_login'),
            error: t('error.unauthenticated'),
          }}
        />

        <p className="mt-6 text-sm text-[var(--text-secondary)]">
          {t('auth.no_account')}{' '}
          <Link href="/register" className="font-medium underline underline-offset-4">
            {t('auth.submit_register')}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
