import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { getTranslator } from '@/i18n/server';
import { RecoveryCard } from '../recovery-card';
import { ForgotForm } from '../recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('auth.forgot.title'), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const { t, language, theme, member } = await shellContext();
  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt="off">
      <RecoveryCard title={t('auth.forgot.title')} lead={t('auth.forgot.lead')}>
        <ForgotForm labels={{ email: t('auth.email'), submit: t('auth.forgot.submit') }} />
        <p className="auth-switch">
          <Link href="/login">{t('auth.submit_login')}</Link>
        </p>
      </RecoveryCard>
    </AppShell>
  );
}
