import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { NEW_USER_RULES } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { AuthCard } from '@/ui/components/auth-card';
import { googleHint } from '@/server/auth/google-cookies';
import { safeNext } from '@/server/auth/return-path';
import { googleSignIn } from '@/server/domains/identity/google';
import { shellContext } from '@/ui/shell-context';
import { RegisterForm } from './register-form';
import { db } from '@/server/db/client';
import { referralRules } from '@/server/domains/referrals/service';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { absolute: t('auth.register.title') } };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invita?: string; next?: string }> }) {
  const { locale, t, language, theme, member } = await shellContext();
  const query = await searchParams;
  // An invitation link carries the inviter's YAY ID; the server checks it.
  const invita = query.invita?.trim().slice(0, 20) || null;
  const rules = invita ? await referralRules(db()) : null;
  // Where the visitor was going; they go on there once the address is confirmed.
  const next = safeNext(query.next);
  const googleQuery = new URLSearchParams({ ...(invita ? { invita } : {}), ...(next !== '/' ? { next } : {}) }).toString();

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false}>
      <AuthCard
        t={t}
        mode="register"
        title={t('auth.register.title')}
        subtitle={t('auth.register.subtitle')}
        notice={null}
        google={googleSignIn().available}
        googleHref={googleQuery ? `/auth/google?${googleQuery}` : '/auth/google'}
        remembered={Boolean(await googleHint())}
        next={next}
      >
        {invita && rules ? (
          <p className="surface-card mt-4 p-3 text-sm" role="status">
            {t('invite.register_banner', { invitee: rules.inviteeReward })}
          </p>
        ) : null}

        <RegisterForm
          locale={locale}
          inviter={invita}
          next={next}
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
      </AuthCard>
    </AppShell>
  );
}
