'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { isDomainError } from '@/server/errors';
import { isPlausibleE164 } from '@/server/domains/identity/normalize';
import { confirmPhoneVerification, startPhoneVerification } from '@/server/domains/identity/phone/service';
import { setWhatsapp } from '@/server/domains/mercadito/service';

/**
 * Phone verification: plain forms that work without JavaScript. Every result
 * comes back as a query parameter the page turns into a sentence.
 */

/** Numbers are asked for in international form; see docs/CONFIGURATION.md. */
function normalizeInput(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, '');
  return isPlausibleE164(compact) ? compact : null;
}

export async function sendPhoneCodeAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const phone = normalizeInput(String(formData.get('phone') ?? ''));
  if (!phone) redirect('/account/phone?error=invalid_number');

  const [account] = await db().select({ locale: users.locale }).from(users).where(eq(users.id, session.user.userId)).limit(1);
  let reason: string;
  try {
    const result = await startPhoneVerification(db(), {
      userId: session.user.userId,
      phoneE164: phone,
      locale: account?.locale === 'en' ? 'en' : 'es',
    });
    if (result.ok) redirect('/account/phone?sent=1');
    reason = result.reason;
  } catch (error) {
    if (!isDomainError(error)) throw error;
    reason = 'rate_limited';
  }
  redirect(`/account/phone?error=${reason}`);
}

export async function confirmPhoneCodeAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) redirect('/account/phone?sent=1&error=format');

  let reason: string;
  try {
    const result = await confirmPhoneVerification(db(), { userId: session.user.userId, code });
    if (result.ok) {
      revalidatePath('/', 'layout');
      redirect('/account/phone?verified=1');
    }
    reason = result.reason;
  } catch (error) {
    if (!isDomainError(error)) throw error;
    reason = 'rate_limited';
  }
  // A wrong code keeps the code form open; a dead challenge sends them back
  // to ask for a new one.
  redirect(reason === 'mismatch' || reason === 'failed' ? `/account/phone?sent=1&error=${reason}` : `/account/phone?error=${reason}`);
}

/** Makes the verified number the one Mercadito buyers reach on WhatsApp. */
export async function useVerifiedForWhatsappAction(): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const [account] = await db()
    .select({ phone: users.phoneE164, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.userId))
    .limit(1);
  // Read from the account, never from the form: only a verified number moves.
  if (!account?.phone || !account.verifiedAt) redirect('/account/phone');

  const context = await requestContext();
  const audit = { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
  await db().transaction((tx) => setWhatsapp(tx, { userId: session.user.userId, phoneE164: account.phone, audit }));
  revalidatePath('/mercadito', 'layout');
  redirect('/account/phone?whatsapp=1');
}
