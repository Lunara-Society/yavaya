import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { settleFromProvider } from '@/server/domains/payments/service';

/**
 * Where PayPal sends the buyer after approving (`?token=<order id>`).
 *
 * Arriving here proves nothing: anyone can type this address. It only
 * prompts Yavaya to ask PayPal, server to server, about that order — and to
 * capture it if the buyer approved. Whoever visits, the outcome is whatever
 * PayPal says, applied to the payment that order belongs to. If this visit
 * never happens (a closed tab), the reconciliation job does the same.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = serverEnv().APP_URL.replace(/\/$/, '');
  const back = (state: string) => NextResponse.redirect(`${base}/account/tokens?purchase=${state}`, 303);
  if (provider !== 'paypal') return new NextResponse(null, { status: 404 });

  const orderId = new URL(request.url).searchParams.get('token') ?? '';
  if (!/^[A-Z0-9]{5,40}$/.test(orderId)) return back('returned');
  try {
    const result = await settleFromProvider(db(), { providerKey: 'paypal', providerTransactionId: orderId, source: 'server_capture' });
    return back(result.status === 'succeeded' && result.applied ? 'paid' : result.status === 'failed' ? 'failed' : 'returned');
  } catch (error) {
    // Not lost: the reconciliation job retries the capture.
    console.error('paypal return not settled:', error instanceof Error ? error.message : error);
    return back('returned');
  }
}
