'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { currentSession, requestContext, userAgentHash } from '@/server/auth/context';
import { consumeRateLimit, RATE_LIMITS } from '@/server/security/rate-limit';
import { isDomainError } from '@/server/errors';
import { closeListing, setWhatsapp } from '@/server/domains/mercadito/service';
import { normalizeWhatsapp } from '@/server/domains/mercadito/rules';
import { LISTING_REPORT_CATEGORIES, reportListing, type ListingReportCategory } from '@/server/domains/mercadito/moderation';

/**
 * Mercadito's small mutations: plain forms that work without JavaScript.
 * Publishing and editing, which carry photos, go through the route handler
 * at /api/mercadito/listings instead.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function auditContext() {
  const context = await requestContext();
  return { ipHash: context.addressHash, userAgentHash: await userAgentHash() };
}

export async function saveWhatsappAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const back = String(formData.get('back') ?? '/mercadito/publish');
  const safeBack = back.startsWith('/mercadito') ? back : '/mercadito/publish';
  const remove = formData.get('remove') === '1';
  const phone = remove ? null : normalizeWhatsapp(String(formData.get('phone') ?? ''));
  if (!remove && !phone) redirect(`${safeBack}?wa=invalid`);

  const audit = await auditContext();
  await db().transaction((tx) => setWhatsapp(tx, { userId: session.user.userId, phoneE164: phone, audit }));
  revalidatePath('/mercadito', 'layout');
  redirect(safeBack);
}

export async function closeListingAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const listingId = String(formData.get('listingId') ?? '');
  const outcome = formData.get('outcome') === 'sold' ? 'sold' : 'withdrawn';
  if (!UUID.test(listingId)) redirect('/mercadito/mine');

  const audit = await auditContext();
  try {
    await db().transaction((tx) =>
      closeListing(tx, { listingId, sellerUserId: session.user.userId, outcome, audit }),
    );
  } catch (error) {
    if (!isDomainError(error)) throw error;
  }
  revalidatePath('/mercadito', 'layout');
  redirect(`/mercadito/${listingId}`);
}

export async function reportListingAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (!session) redirect('/login');

  const listingId = String(formData.get('listingId') ?? '');
  if (!UUID.test(listingId)) redirect('/mercadito');
  const categoryValue = String(formData.get('category') ?? '');
  if (!(LISTING_REPORT_CATEGORIES as readonly string[]).includes(categoryValue)) {
    redirect(`/mercadito/${listingId}`);
  }
  const description = String(formData.get('details') ?? '').trim().slice(0, 2000) || null;

  const limit = await consumeRateLimit(db(), RATE_LIMITS.report, `user:${session.user.userId}`);
  if (!limit.allowed) redirect(`/mercadito/${listingId}?report=limited`);

  let code: string | null = null;
  try {
    const result = await db().transaction((tx) =>
      reportListing(tx, {
        listingId,
        reporterUserId: session.user.userId,
        category: categoryValue as ListingReportCategory,
        description,
      }),
    );
    code = result.ticketCode;
  } catch (error) {
    if (!isDomainError(error)) throw error;
  }
  redirect(code ? `/mercadito/${listingId}?reported=${encodeURIComponent(code)}` : `/mercadito/${listingId}`);
}
