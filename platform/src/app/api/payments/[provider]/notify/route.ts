import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getProvider, markWebhookProcessed, recordWebhook, settleFromProvider } from '@/server/domains/payments/service';

/**
 * Payment notifications from a provider.
 *
 * Order matters: verify the signature, store the notification, then read the
 * payment's state from the provider and apply it. A notification is only a
 * signed "something changed"; the money moves on what the provider's API
 * says when asked directly.
 *
 * Any non-200 answer makes the provider retry (dLocal Go: every 10 minutes
 * for 30 days), so a failure while settling answers 500 on purpose.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: key } = await params;
  let provider;
  try {
    provider = getProvider(key);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const rawBody = await request.text();
  if (rawBody.length > 16_384) return new NextResponse(null, { status: 413 });
  const headers = Object.fromEntries(request.headers.entries());

  const verification = await provider.verifyWebhook({ rawBody, headers });
  if (!verification.verified) {
    // Not stored: an unsigned body is anyone's, and storing it would let
    // anyone fill the table.
    console.warn('payment notification rejected:', key, verification.reason);
    return new NextResponse(null, { status: 401 });
  }

  // The same body arrives once per status change, so the arrival time is
  // part of what makes one notification distinct from the next.
  const { id } = await recordWebhook(db(), {
    provider: provider.key,
    providerEventId: `${verification.providerEventId}@${new Date().toISOString()}`,
    eventType: verification.eventType,
    signatureVerified: true,
    payload: verification.raw,
  });

  if (!verification.providerTransactionId) {
    // A refund notification: refunds are started by a person in the admin
    // area and confirmed there; nothing to apply automatically yet.
    if (id) await markWebhookProcessed(db(), id);
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await settleFromProvider(db(), { providerKey: provider.key, providerTransactionId: verification.providerTransactionId, source: 'webhook' });
    if (id) await markWebhookProcessed(db(), id, result.reason === 'amount_mismatch' ? 'amount_mismatch' : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('payment notification not settled:', key, message);
    if (id) await markWebhookProcessed(db(), id, message.slice(0, 500));
    return new NextResponse(null, { status: 500 });
  }
}
