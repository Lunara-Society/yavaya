import type { Metadata } from 'next';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { getTranslator } from '@/i18n/server';
import { SANCTION_RULES } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { readAppealLink } from '@/server/domains/access/sanctions';
import { formatDate } from '@/ui/mercadito/format';
import { RecoveryCard } from '@/app/(auth)/login/recovery-card';
import { AppealForm } from './form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  // The address carries the sealed link: never indexed, never sent onward.
  return { title: t('appeal.title'), robots: { index: false }, referrer: 'no-referrer' };
}

export const dynamic = 'force-dynamic';

/**
 * Where the link in a sanction email lands. The member cannot sign in, so
 * the sealed link is what says whose sanction this is. Shows what was
 * decided and why (the reason category, never the internal note), then
 * takes one appeal.
 */
export default async function AppealPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = ((await searchParams).t ?? '').slice(0, 400);
  const { t, locale, language, theme, member } = await shellContext();
  const link = token ? await readAppealLink(db(), token) : null;

  let lead = t('appeal.invalid', { days: SANCTION_RULES.appealWindowDays });
  if (link) {
    const what = t(link.type === 'suspension' ? 'appeal.what.suspension' : 'appeal.what.ban', {
      date: formatDate(link.issuedAt, locale),
      reason: t(`sanctions.reason.${link.reason}` as MessageKey),
    });
    const until = link.type === 'suspension' ? ' ' + (link.until ? t('appeal.until', { date: formatDate(link.until, locale) }) : t('appeal.until_review')) : '';
    lead = link.lifted ? t('appeal.lifted') : link.appealedAt ? `${what}${until} ${t('appeal.already')}` : `${what}${until}`;
  }

  return (
    <AppShell t={t} language={language} theme={theme} member={member} authBar={false} googlePrompt="off">
      <RecoveryCard title={t('appeal.title')} lead={lead}>
        {link && !link.lifted && !link.appealedAt ? (
          <AppealForm
            token={token}
            min={SANCTION_RULES.appealMinLength}
            max={SANCTION_RULES.appealMaxLength}
            labels={{ body: t('appeal.body'), help: t('appeal.help', { min: SANCTION_RULES.appealMinLength }), submit: t('appeal.submit') }}
          />
        ) : null}
      </RecoveryCard>
    </AppShell>
  );
}
