import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { getTranslator } from '@/i18n/server';
import { readSecondStep } from '@/server/auth/two-step-cookies';
import { RecoveryCard } from '../recovery-card';
import { SecondStepForm } from '../recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('two_step.title'), robots: { index: false } };
}

/** The second step of signing in. Without the first step's note there is nothing to finish. */
export default async function SecondStepPage() {
  if (!(await readSecondStep())) redirect('/login');
  const { t, language, theme, member } = await shellContext();
  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt="off">
      <RecoveryCard title={t('two_step.code.title')} lead={t('two_step.code.lead')}>
        <SecondStepForm
          labels={{
            code: t('two_step.code.label'),
            recovery: t('two_step.code.recovery_label'),
            useRecovery: t('two_step.code.use_recovery'),
            useApp: t('two_step.code.use_app'),
            submit: t('two_step.code.submit'),
          }}
        />
        <p className="auth-switch">
          <Link href="/login">{t('two_step.code.start_over')}</Link>
        </p>
      </RecoveryCard>
    </AppShell>
  );
}
