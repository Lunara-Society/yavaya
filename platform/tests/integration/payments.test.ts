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
import { notificationSignature, toMajor, toMinor } from '@/server/domains/payments/providers/dlocalgo';
import { POST as notify } from '@/app/api/payments/[provider]/notify/route';
import { resetTransactionalData } from '../helpers/database';

/**
 * dLocal Go, against a stand-in for its API that behaves as documented
 * (https://docs.dlocalgo.com/integration-api): payments created with a
 * redirect URL, notifications that carry only a payment id and an
 * HMAC-SHA256 signature, and the status read back with GET.
 */

const API_KEY = 'test-api-key';
const SECRET = 'test-secret-key';
const context = { networkHash: null, addressHash: 'payments-test', deviceFingerprint: null, userAgent: 'vitest' };

type FakePayment = { id: string; amount: number; currency: string; order_id: string; status: string };
let payments: Map<string, FakePayment>;
let lastAuthorization: string | null;

function fakeDLocalGo() {
  payments = new Map();
  let next = 1000;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    lastAuthorization = new Headers(init.headers).get('authorization');
    const path = new URL(url).pathname;
    if (init.method === 'POST' && path === '/v1/payments') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const payment = { id: `DP-${next++}`, amount: Number(body.amount), currency: String(body.currency), order_id: String(body.order_id), status: 'PENDING' };
      payments.set(payment.id, payment);
      return Response.json({ ...payment, redirect_url: `https://checkout-sbx.dlocalgo.com/validate/${payment.id}` });
    }
    const match = /^\/v1\/payments\/(.+)$/.exec(path);
    if (init.method === 'GET' && match) {
      const payment = payments.get(decodeURIComponent(match[1]!));
      return payment ? Response.json(payment) : Response.json({ code: 404, message: 'not found' }, { status: 404 });
    }
    return Response.json({ code: 400, message: 'unexpected' }, { status: 400 });
  });
}

function signedNotification(body: string, signature = notificationSignature(API_KEY, SECRET, body)) {
  return new Request('https://yavaya.lat/api/payments/dlocalgo/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `V2-HMAC-SHA256, Signature: ${signature}` },
    body,
  });
}

const route = { params: Promise.resolve({ provider: 'dlocalgo' }) };

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

describe('dLocal Go payments', () => {
  beforeEach(async () => {
    await resetTransactionalData();
    // Live mode against the stand-in; the sandbox rules have their own test.
    process.env.DLOCALGO_ENV = 'live';
    process.env.DLOCALGO_API_KEY = API_KEY;
    process.env.DLOCALGO_SECRET_KEY = SECRET;
    resetServerEnvCache();
    fakeDLocalGo();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DLOCALGO_ENV;
    delete process.env.DLOCALGO_API_KEY;
    delete process.env.DLOCALGO_SECRET_KEY;
    resetServerEnvCache();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('converts between minor units and the amounts dLocal Go uses', () => {
    expect(toMajor({ amountMinor: 399, currency: 'USD' })).toBe(3.99);
    expect(toMinor(3.99, 'USD')).toBe(399);
    // Chilean pesos have no cents.
    expect(toMajor({ amountMinor: 5000, currency: 'CLP' })).toBe(5000);
  });

  it('is unavailable, and offers nothing, until its keys are set', async () => {
    delete process.env.DLOCALGO_API_KEY;
    resetServerEnvCache();
    expect(listProviderAvailability().find((p) => p.key === 'dlocalgo')?.available).toBe(false);
    const userId = await member();
    await expect(buy(userId)).rejects.toMatchObject({ code: 'integration_unconfigured' });
    expect(await db().select().from(paymentTransactions)).toHaveLength(0);
  });

  it('sends the member to checkout, and credits nothing when they come back', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { redirectUrl, transaction } = await buy(userId);
    expect(redirectUrl).toMatch(/^https:\/\/checkout-sbx\.dlocalgo\.com\//);
    expect(lastAuthorization).toBe(`Bearer ${API_KEY}:${SECRET}`);
    const payment = payments.get(transaction.providerTransactionId!)!;
    expect(payment).toMatchObject({ amount: 9.99, currency: 'USD', order_id: transaction.reference });
    expect(transaction.status).toBe('pending_provider');
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('credits the tokens once dLocal Go confirms, and only once', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    const body = JSON.stringify({ payment_id: transaction.providerTransactionId });

    // A notification while still pending changes nothing.
    expect((await notify(signedNotification(body), route)).status).toBe(200);
    expect(await getBalance(db(), userId)).toBe(before);

    payments.get(transaction.providerTransactionId!)!.status = 'PAID';
    expect((await notify(signedNotification(body), route)).status).toBe(200);
    expect(await getBalance(db(), userId)).toBe(before + 25);

    // dLocal Go retries; a redelivery must not credit again.
    expect((await notify(signedNotification(body), route)).status).toBe(200);
    expect(await getBalance(db(), userId)).toBe(before + 25);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.status).toBe('succeeded');
  });

  it('refuses a notification that is not signed with our keys', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    payments.get(transaction.providerTransactionId!)!.status = 'PAID';
    const body = JSON.stringify({ payment_id: transaction.providerTransactionId });

    expect((await notify(signedNotification(body, notificationSignature(API_KEY, 'someone-elses-secret', body)), route)).status).toBe(401);
    expect((await notify(new Request('https://yavaya.lat/api/payments/dlocalgo/notify', { method: 'POST', body }), route)).status).toBe(401);
    expect(await getBalance(db(), userId)).toBe(before);
    expect(await db().select().from(paymentWebhookEvents)).toHaveLength(0);
  });

  it('never fulfils a payment whose amount differs from the price', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(payments.get(transaction.providerTransactionId!)!, { status: 'PAID', amount: 0.99 });

    expect((await notify(signedNotification(JSON.stringify({ payment_id: transaction.providerTransactionId })), route)).status).toBe(200);
    expect(await getBalance(db(), userId)).toBe(before);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.reconciliationState).toBe('discrepancy');
    expect(after?.status).toBe('pending_provider');
    expect(await db().select().from(auditEvents).where(eq(auditEvents.action, 'payments.discrepancy'))).toHaveLength(1);
  });

  it('marks a rejected payment as failed, crediting nothing', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    payments.get(transaction.providerTransactionId!)!.status = 'REJECTED';
    await notify(signedNotification(JSON.stringify({ payment_id: transaction.providerTransactionId })), route);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.status).toBe('failed');
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('settles a payment whose notification never arrived', async () => {
    const userId = await member();
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    payments.get(transaction.providerTransactionId!)!.status = 'PAID';
    const later = new Date(Date.now() + 10 * 60_000);
    const result = await reconcilePendingPayments(db(), later);
    expect(result).toMatchObject({ checked: 1, settled: 1, failed: 0 });
    expect(await getBalance(db(), userId)).toBe(before + 25);
  });

  it('treats a repeated purchase attempt as a double click, not a second charge', async () => {
    const userId = await member();
    const attemptId = crypto.randomUUID();
    const params = { userId, packageKey: 'tokens_2', attemptId, appUrl: 'https://yavaya.lat', description: 'Tokens' };
    await startTokenPurchase(db(), params);
    await expect(startTokenPurchase(db(), params)).rejects.toMatchObject({ messageKey: 'payments.error.duplicate' });
    expect(payments.size).toBe(1);
  });

  it('in the test environment, lets only an administrator buy — test cards are not money', async () => {
    process.env.DLOCALGO_ENV = 'sandbox';
    resetServerEnvCache();
    expect(listProviderAvailability().find((p) => p.key === 'dlocalgo')).toMatchObject({ available: true, testMode: true });
    const userId = await member();
    await expect(buy(userId)).rejects.toMatchObject({ code: 'integration_unconfigured' });
    expect(payments.size).toBe(0);

    const adminId = await member();
    await db().transaction((tx) => grantRole(tx, { userId: adminId, roleKey: 'admin', grantedBy: null }));
    const { redirectUrl } = await buy(adminId);
    expect(redirectUrl).toContain('checkout-sbx.dlocalgo.com');
  });

  it('refuses a package that is not offered', async () => {
    const userId = await member();
    // Retired from the catalogue: kept for past purchases, never sold again.
    await expect(buy(userId, 'tokens_5')).rejects.toMatchObject({ messageKey: 'payments.error.package' });
    expect(payments.size).toBe(0);
  });
});
