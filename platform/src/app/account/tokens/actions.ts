'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { serverEnv } from '@/config/env';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { startTokenPurchase } from '@/server/domains/payments/token-purchase';
import { createTranslator } from '@/i18n';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sends the member to the provider's checkout. Nothing is credited here. */
export async function buyTokensAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login?next=/account/tokens');
  const packageKey = String(formData.get('package') ?? '');
  const attemptId = String(formData.get('attempt') ?? '');
  if (!UUID.test(attemptId) || !/^[a-z0-9_]{1,40}$/.test(packageKey)) redirect('/account/tokens');

  const limit = await consumeRateLimit(db(), RATE_LIMITS.paymentCheckout, `user:${session.user.userId}`);
  if (!limit.allowed) redirect('/account/tokens?error=payments.error.rate_limited');

  let destination: string;
  try {
    const t = createTranslator(session.user.locale === 'en' ? 'en' : 'es');
    const { redirectUrl } = await startTokenPurchase(db(), {
      userId: session.user.userId,
      packageKey,
      attemptId,
      appUrl: serverEnv().APP_URL,
      description: t('payments.checkout.description'),
    });
    destination = redirectUrl;
  } catch (error) {
    if (isDomainError(error) && error.expose) redirect(`/account/tokens?error=${encodeURIComponent(error.messageKey)}`);
    console.error('checkout not started:', error instanceof Error ? error.message : error);
    redirect('/account/tokens?error=payments.error.provider');
  }
  redirect(destination);
}
