import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, paymentTransactions, paymentWebhookEvents, users } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { getBalance } from '@/server/domains/tokens/service';
import { listProviderAvailability, reconcilePendingPayments } from '@/server/domains/payments/service';
import { startTokenPurchase } from '@/server/domains/payments/token-purchase';
import { POST as notify } from '@/app/api/payments/[provider]/notify/route';
import { GET as providerReturn } from '@/app/api/payments/[provider]/return/route';
import { resetTransactionalData } from '../helpers/database';

/**
 * Buying tokens through Stripe, against a stand-in that behaves as Checkout
 * documents: a session is created, paid by the buyer on Stripe's page, then
 * read by the server — and only that answer is money.
 */

const context = { networkHash: null, addressHash: 'payments-test', deviceFingerprint: null, userAgent: 'vitest' };

type FakeSession = { id: string; amount_total: number; currency: string; status: string; payment_status: string };
let sessions: Map<string, FakeSession>;

function fakeStripe() {
  sessions = new Map();
  let next = 1;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    if (pathname === '/v1/checkout/sessions' && init.method === 'POST') {
      const form = new URLSearchParams(String(init.body));
      const id = `cs_live_${'a'.repeat(20)}${next++}`;
      sessions.set(id, {
        id,
        amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
        currency: form.get('line_items[0][price_data][currency]')!,
        status: 'open',
        payment_status: 'unpaid',
      });
      return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const match = /^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/.exec(pathname);
    if (match && init.method === 'GET') {
      const session = sessions.get(match[1]!);
      return session ? Response.json(session) : Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 });
    }
    return Response.json({ error: { type: 'invalid_request_error', code: 'unexpected' } }, { status: 400 });
  });
}

async function member() {
  const { userId } = await register(
    db(),
    { email: `pay-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Compradora', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

async function buy(userId: string, packageKey = 'tokens_25') {
  const { redirectUrl, reference } = await startTokenPurchase(db(), { userId, packageKey, attemptId: crypto.randomUUID(), appUrl: 'https://yavaya.lat', description: 'Tokens de Yavaya' });
  const [transaction] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.reference, reference));
  return { redirectUrl, transaction: transaction! };
}

const back = (sessionId: string) => providerReturn(new Request(`https://yavaya.lat/api/payments/stripe/return?session_id=${sessionId}`), { params: Promise.resolve({ provider: 'stripe' }) });

const later = () => new Date(Date.now() + 10 * 60_000);

describe('token payments', () => {
  beforeEach(async () => {
    await resetTransactionalData();
    process.env.STRIPE_SECRET_KEY = 'rk_live_abc123';
    resetServerEnvCache();
    fakeStripe();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
    resetServerEnvCache();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('is unavailable, and offers nothing, until its key is set', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    resetServerEnvCache();
    expect(listProviderAvailability().find((p) => p.key === 'stripe')?.available).toBe(false);
    const userId = await member();
    await expect(buy(userId)).rejects.toMatchObject({ code: 'integration_unconfigured' });
    expect(await db().select().from(paymentTransactions)).toHaveLength(0);
  });

  it('sends the member to checkout, and credits nothing when they come back unpaid', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { redirectUrl, transaction } = await buy(userId);
    expect(redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(sessions.get(transaction.providerTransactionId!)).toMatchObject({ amount_total: 999, currency: 'usd' });
    expect(transaction.status).toBe('pending_provider');
    await back(transaction.providerTransactionId!);
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('credits the tokens once Stripe says paid, and only once', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid' });

    expect((await back(transaction.providerTransactionId!)).headers.get('location')).toContain('purchase=paid');
    expect(await getBalance(db(), userId)).toBe(before + 25);

    // The buyer reloads the page and the reconciliation job runs: nothing more.
    await back(transaction.providerTransactionId!);
    await reconcilePendingPayments(db(), later());
    expect(await getBalance(db(), userId)).toBe(before + 25);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.status).toBe('succeeded');
  });

  it('never fulfils a payment whose amount differs from the price', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid', amount_total: 99 });

    await back(transaction.providerTransactionId!);
    expect(await getBalance(db(), userId)).toBe(before);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.reconciliationState).toBe('discrepancy');
    expect(after?.status).toBe('pending_provider');
    expect(await db().select().from(auditEvents).where(eq(auditEvents.action, 'payments.discrepancy'))).toHaveLength(1);
  });

  it('marks an expired checkout as failed, crediting nothing', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    sessions.get(transaction.providerTransactionId!)!.status = 'expired';
    await reconcilePendingPayments(db(), later());
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.status).toBe('failed');
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('settles a paid checkout whose buyer never came back', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid' });
    const result = await reconcilePendingPayments(db(), later());
    expect(result).toMatchObject({ checked: 1, settled: 1, failed: 0 });
    expect(await getBalance(db(), userId)).toBe(before + 25);
  });

  it('treats a repeated purchase attempt as a double click, not a second charge', async () => {
    const userId = await member();
    const attemptId = crypto.randomUUID();
    const params = { userId, packageKey: 'tokens_10', attemptId, appUrl: 'https://yavaya.lat', description: 'Tokens' };
    await startTokenPurchase(db(), params);
    await expect(startTokenPurchase(db(), params)).rejects.toMatchObject({ messageKey: 'payments.error.duplicate' });
    expect(sessions.size).toBe(1);
  });

  it('in the test environment, lets only an administrator buy — test cards are not money', async () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_abc123';
    resetServerEnvCache();
    expect(listProviderAvailability().find((p) => p.key === 'stripe')).toMatchObject({ available: true, testMode: true });
    const userId = await member();
    await expect(buy(userId)).rejects.toMatchObject({ code: 'integration_unconfigured' });
    expect(sessions.size).toBe(0);

    const adminId = await member();
    await db().transaction((tx) => grantRole(tx, { userId: adminId, roleKey: 'admin', grantedBy: null }));
    const { redirectUrl } = await buy(adminId);
    expect(redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  it('refuses a package that is not offered', async () => {
    const userId = await member();
    // Retired from the catalogue: kept for past purchases, never sold again.
    await expect(buy(userId, 'tokens_5')).rejects.toMatchObject({ messageKey: 'payments.error.package' });
    expect(sessions.size).toBe(0);
  });

  it('takes no payment notification: Stripe is read, not heard, and removed providers are gone', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const post = (provider: string) => notify(new Request(`https://yavaya.lat/api/payments/${provider}/notify`, { method: 'POST', body }), { params: Promise.resolve({ provider }) });
    expect((await post('stripe')).status).toBe(401);
    expect((await post('dlocalgo')).status).toBe(404);
    expect((await post('paypal')).status).toBe(404);
    expect(await db().select().from(paymentWebhookEvents)).toHaveLength(0);
  });
});
