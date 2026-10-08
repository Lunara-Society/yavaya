import type { Metadata } from 'next';
import Link from 'next/link';
import { NEW_USER_RULES } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { RegisterForm } from './register-form';
import { db } from '@/server/db/client';
import { referralRules } from '@/server/domains/referrals/service';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invita?: string }> }) {
  const { locale, t, language, theme, member } = await shellContext();
  // An invitation link carries the inviter's YAY ID; the server checks it.
  const invita = (await searchParams).invita?.trim().slice(0, 20) || null;
  const rules = invita ? await referralRules(db()) : null;

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.register.title')}</h1>
        <p className="mt-1 text-[var(--text-secondary)]">{t('auth.register.subtitle')}</p>

        {invita && rules ? (
          <p className="surface-card mt-4 p-3 text-sm" role="status">
            {t('invite.register_banner', { invitee: rules.inviteeReward })}
          </p>
        ) : null}

        <RegisterForm
          locale={locale}
          inviter={invita}
          labels={{
            email: t('auth.email'),
            password: t('auth.password'),
            displayName: t('auth.display_name'),
            acceptTerms: t('auth.accept_terms'),
            readTerms: t('auth.read_terms'),
            submit: t('auth.submit_register'),
            yayIdExplained: t('auth.yay_id_explained'),
            registeredTitle: t('auth.registered.title'),
            monitoringNotice: t('auth.monitoring_notice', {
              hours: NEW_USER_RULES.monitoringWindowHours,
            }),
            undeliverable: t('auth.verification_undeliverable'),
            verifyContinue: t('auth.verify.continue'),
          }}
        />

        <p className="mt-6 text-sm text-[var(--text-secondary)]">
          {t('auth.have_account')}{' '}
          <Link href="/login" className="font-medium underline underline-offset-4">
            {t('auth.submit_login')}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
