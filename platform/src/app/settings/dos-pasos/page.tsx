import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { getTranslator } from '@/i18n/server';
import { readSetup } from '@/server/auth/two-step-cookies';
import { enrolmentUri, twoStepAvailable, twoStepStatus } from '@/server/domains/identity/two-step';
import { startTwoStepAction } from '../security-actions';
import { ConfirmTwoStepForm, TwoStepCodeForm } from '../security-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('two_step.title'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/**
 * Turning two-step on, and managing it once it is on. The secret shown here
 * lives only in a sealed cookie until the first code proves the app has it.
 */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ respaldo?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId) redirect('/login');
  const status = await twoStepStatus(db(), userId);
  const usedRecovery = Boolean((await searchParams).respaldo);
  const recoveryLabels = { title: t('two_step.recovery.title'), lead: t('two_step.recovery.lead'), done: t('two_step.recovery.done') };

  if (status.enabled) {
    const since = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(status.enabledAt);
    return (
      <AppShell t={t} language={language} theme={theme} member={member}>
        <h1 className="text-2xl font-semibold tracking-tight">{t('two_step.title')}</h1>
        {usedRecovery ? (
          <p role="status" className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--accent)' }}>
            {t('two_step.recovery.used_notice', { count: status.recoveryLeft })}
          </p>
        ) : null}
        <p className="mt-3">{t('two_step.manage.on')} {t('two_step.settings.on', { date: since })}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('two_step.settings.recovery_left', { count: status.recoveryLeft })}</p>
        <div className="mt-6 space-y-4">
          <TwoStepCodeForm
            kind="new_codes"
            labels={{ ...recoveryLabels, code: t('two_step.manage.code_label'), submit: t('two_step.manage.new_codes'), title: t('two_step.manage.new_codes'), lead: t('two_step.manage.new_codes_lead') }}
          />
          <TwoStepCodeForm
            kind="off"
            labels={{ ...recoveryLabels, code: t('two_step.manage.code_label'), submit: t('two_step.manage.off'), title: t('two_step.manage.off'), lead: t('two_step.manage.off_lead') }}
          />
        </div>
      </AppShell>
    );
  }

  const secret = twoStepAvailable() ? await readSetup(userId) : null;
  if (!secret) {
    return (
      <AppShell t={t} language={language} theme={theme} member={member}>
        <h1 className="text-2xl font-semibold tracking-tight">{t('two_step.title')}</h1>
        <p className="mt-3 text-[var(--text-secondary)]">{twoStepAvailable() ? t('two_step.settings.off_lead') : t('two_step.error.unavailable')}</p>
        {twoStepAvailable() ? (
          <form action={startTwoStepAction} className="mt-5">
            <button type="submit" className="min-h-touch w-full rounded-xl px-5 font-medium" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}>
              {t('two_step.settings.turn_on')}
            </button>
          </form>
        ) : null}
      </AppShell>
    );
  }

  const [account] = await db().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const uri = enrolmentUri(secret, account?.email ?? 'Yavaya');
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1526', light: '#ffffff' } });
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('two_step.settings.turn_on')}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">{t('two_step.setup.lead')}</p>
      <ol className="mt-6 space-y-6">
        <li>
          <p className="font-medium">1. {t('two_step.setup.step1')}</p>
        </li>
        <li>
          <p className="font-medium">2. {t('two_step.setup.step2')}</p>
          {/* Our own data, drawn by the qrcode library: an SVG with no script. */}
          <div className="mt-3 w-56 max-w-full rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
          <a href={uri} className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
            {t('two_step.setup.open_app')}
          </a>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('two_step.setup.manual')}</p>
          <p className="mt-1 select-all break-all font-mono text-base tracking-wider">{grouped}</p>
        </li>
        <li>
          <p className="font-medium">3. {t('two_step.setup.step3')}</p>
          <ConfirmTwoStepForm labels={{ ...recoveryLabels, code: t('two_step.code.label'), submit: t('two_step.setup.submit') }} />
        </li>
      </ol>
    </AppShell>
  );
}
