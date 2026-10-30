'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { signInPath } from '@/server/auth/sign-in-path';
import { isDomainError } from '@/server/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { findPublicMember } from '@/server/domains/identity/profile';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { PROFILE_REPORT_CATEGORIES, reportProfile, type ProfileReportCategory } from '@/server/domains/identity/profile-reports';

function errorKey(error: unknown): string {
  if (isDomainError(error) && error.expose) return error.messageKey;
  throw error;
}

/** A signed-in member reports what another member shows on their profile. */
export async function reportProfileAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect(await signInPath());
  const profile = await findPublicMember(db(), String(formData.get('yayId') ?? ''));
  if (!profile) redirect('/');
  const back = `/members/${formatYayId(profile.yayDigits)}`;
  const category = String(formData.get('category') ?? '');
  if (!(PROFILE_REPORT_CATEGORIES as readonly string[]).includes(category)) redirect(back);
  const description = String(formData.get('details') ?? '').trim().slice(0, 2000) || null;

  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(`${back}?error=mercadito.report.limited#report`);

  let code: string;
  try {
    const result = await db().transaction((tx) =>
      reportProfile(tx, { profileUserId: profile.userId, reporterUserId: session.user.userId, category: category as ProfileReportCategory, description }),
    );
    code = result.ticketCode;
  } catch (error) {
    redirect(`${back}?error=${encodeURIComponent(errorKey(error))}#report`);
  }
  redirect(`${back}?reported=${encodeURIComponent(code)}#report`);
}
