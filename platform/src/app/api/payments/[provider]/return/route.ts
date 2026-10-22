import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { settleFromProvider } from '@/server/domains/payments/service';

/**
 * Where Stripe sends the buyer back (`?session_id=<session>`).
 *
 * Arriving here proves nothing: anyone can type this address. It only
 * prompts Yavaya to ask Stripe, server to server, about that session.
 * Whoever visits, the outcome is whatever Stripe says, applied to the payment
 * that session belongs to. If this visit never happens (a closed tab), the
 * reconciliation job does the same.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = serverEnv().APP_URL.replace(/\/$/, '');
  const back = (state: string) => NextResponse.redirect(`${base}/account/tokens?purchase=${state}`, 303);
  const query = new URL(request.url).searchParams;
  if (provider !== 'stripe') return new NextResponse(null, { status: 404 });
  const id = query.get('session_id') ?? '';
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(id)) return back('returned');
  try {
    const result = await settleFromProvider(db(), { providerKey: provider, providerTransactionId: id, source: 'server_capture' });
    return back(result.status === 'succeeded' && result.applied ? 'paid' : result.status === 'failed' ? 'failed' : 'returned');
  } catch (error) {
    // Not lost: the reconciliation job retries the capture.
    console.error('payment return not settled:', provider, error instanceof Error ? error.message : error);
    return back('returned');
  }
}
