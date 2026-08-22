import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { VERIFICATION_RULES } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { maskEmail } from '@/server/domains/identity/normalize';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Verify your email' };
export const dynamic = 'force-dynamic';

/**
 * Email verification.
 *
 * This is the step that turns a created account into a usable one. Until it
 * existed, `consumeVerificationCode` was reachable only from a test — a member
 * could register, receive a code, and have nowhere to type it.
 *
 * The address is shown masked. A shoulder-surfer on a bus should not read a
 * member's full address off the screen, and the member only needs enough of it
 * to recognise which inbox to open.
 */
export default async function VerifyPage() {
  const { t, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect('/login');

  const [account] = await db()
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!account) redirect('/login');

  if (account.emailVerifiedAt) {
    return (
      <AppShell t={t} language={language} theme={theme} member={member}>
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.verify.title')}</h1>
          <p
            className="mt-4 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--color-positive)' }}
          >
            {t('auth.verify.already_verified')}
          </p>
          <Link
            href="/account"
            className="mt-6 inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
          >
            {t('nav.member_area')}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.verify.title')}</h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          {t('auth.verify.subtitle', { email: maskEmail(account.email) })}
        </p>

        <VerifyForm
          labels={{
            code: t('auth.verify.code'),
            codeHint: t('auth.verify.code_hint', {
              minutes: VERIFICATION_RULES.emailCodeTtlMinutes,
            }),
            submit: t('auth.verify.submit'),
            resend: t('auth.verify.resend'),
            resendHint: t('auth.verify.resend_hint'),
          }}
        />
      </div>
    </AppShell>
  );
}
