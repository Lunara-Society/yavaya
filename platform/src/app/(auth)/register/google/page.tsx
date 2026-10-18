import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { readSignup } from '@/server/auth/google-cookies';
import { GoogleSignupForm } from './google-signup-form';

export const metadata: Metadata = { title: 'Create account', robots: { index: false } };

/** The one step between Google confirming an address and a new account: a name and the rules. */
export default async function GoogleSignupPage() {
  const { t, language, theme, member } = await shellContext();
  if (member) redirect('/');
  const signup = await readSignup();
  if (!signup) redirect('/register');

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false}>
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.google.signup.title')}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t('auth.google.signup.lead', { email: signup.profile.email })}</p>
        <GoogleSignupForm
          defaultName={signup.profile.name}
          labels={{
            displayName: t('auth.display_name'),
            acceptTerms: t('auth.accept_terms'),
            readTerms: t('auth.read_terms'),
            submit: t('auth.google.signup.submit'),
          }}
        />
      </div>
    </AppShell>
  );
}
