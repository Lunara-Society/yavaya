import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { AppShell } from '@/ui/components/app-shell';
import { CopyButton } from '@/ui/components/copy-button';
import { shellContext } from '@/ui/shell-context';
import { invitationSummary } from '@/server/domains/referrals/service';

export const metadata: Metadata = { title: 'Invita' };
export const dynamic = 'force-dynamic';

/**
 * The member's invitation link, ready to send on WhatsApp — where people here
 * actually share things — and what it has earned so far. The numbers are the
 * member's own, counted from the ledger, never estimated.
 */
export default async function InvitePage() {
  const { t, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect('/login');

  const summary = await invitationSummary(db(), userId);
  if (!summary.code) redirect('/account');
  const link = `${serverEnv().APP_URL.replace(/\/$/, '')}/register?invita=${summary.code}`;
  const message = t('invite.whatsapp_message', { link });

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <div className="mx-auto w-full max-w-xl" style={{ display: 'grid', gap: 20 }}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('invite.title')}</h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            {t('invite.subtitle', { inviter: summary.rules.inviterReward, invitee: summary.rules.inviteeReward })}
          </p>
        </div>

        <section className="surface-card p-5" style={{ display: 'grid', gap: 12 }}>
          <p className="text-sm font-semibold">{t('invite.your_link')}</p>
          <p id="invite-link" className="font-mono text-sm" style={{ wordBreak: 'break-all' }}>
            {link}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn btn-gold" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              {t('invite.share_whatsapp')}
            </a>
            <CopyButton text={link} label={t('invite.copy')} done={t('invite.copied')} targetId="invite-link" />
          </div>
        </section>

        <section className="surface-card p-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, textAlign: 'center' }}>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{summary.joined}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('invite.stat_joined')}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{summary.rewarded}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('invite.stat_verified')}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{summary.earned}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('invite.stat_earned')}</p>
          </div>
        </section>

        <section className="surface-card p-5" style={{ display: 'grid', gap: 8 }}>
          <p className="text-sm font-semibold">{t('invite.how_title')}</p>
          <ol className="text-sm text-[var(--text-secondary)]" style={{ display: 'grid', gap: 6, paddingLeft: 18, listStyle: 'decimal' }}>
            <li>{t('invite.how_1')}</li>
            <li>{t('invite.how_2')}</li>
            <li>{t('invite.how_3', { inviter: summary.rules.inviterReward, invitee: summary.rules.inviteeReward })}</li>
          </ol>
          <p className="text-xs text-[var(--text-secondary)]">{t('invite.fine_print', { max: summary.rules.maxRewardedPerMonth })}</p>
        </section>

        <p className="text-sm">
          <Link href="/mercadito/mine" className="underline underline-offset-4">
            {t('invite.use_tokens')}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
