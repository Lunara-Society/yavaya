import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { getTranslator } from '@/i18n/server';
import { resetLinkUsable } from '@/server/domains/identity/password';
import { RecoveryCard } from '../recovery-card';
import { NewPasswordForm } from '../recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  // The link carries the token: this page must never be indexed or cached.
  return { title: t('auth.reset.title'), robots: { index: false }, referrer: 'no-referrer' };
}

export const dynamic = 'force-dynamic';

/**
 * Where the emailed link lands. Google's sign-in prompt is off here: its
 * script would run on a page whose address holds a key to the account.
 */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = ((await searchParams).t ?? '').slice(0, 100);
  const { t, language, theme, member } = await shellContext();
  const usable = token ? await resetLinkUsable(db(), token) : false;
  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt="off">
      <RecoveryCard title={t('auth.reset.title')} lead={usable ? t('auth.reset.lead') : t('auth.reset.invalid')}>
        {usable ? (
          <NewPasswordForm token={token} labels={{ password: t('auth.reset.password'), confirm: t('auth.reset.confirm'), submit: t('auth.reset.submit') }} />
        ) : (
          <p className="auth-switch">
            <Link href="/login/olvide">{t('auth.reset.ask_again')}</Link>
          </p>
        )}
      </RecoveryCard>
    </AppShell>
  );
}
