import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { locations, paymentTransactions, userProfiles, users } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { getBalance } from '@/server/domains/tokens/service';
import { reconcilePendingPayments } from '@/server/domains/payments/service';
import { startTokenPurchase } from '@/server/domains/payments/token-purchase';
import { countryRoutes, memberCountry, routeFor } from '@/server/domains/payments/routing';
import { paypalMinor, paypalValue } from '@/server/domains/payments/providers/paypal';
import { GET as paypalReturn } from '@/app/api/payments/[provider]/return/route';
import { resetTransactionalData } from '../helpers/database';

/**
 * Two providers, chosen by the member's country: dLocal Go where it is
 * licensed, PayPal elsewhere. PayPal is a stand-in that behaves as Orders v2
 * documents: an order is created, approved by the buyer on PayPal, then
 * captured by the server — and only the capture's answer is money.
 */

const context = { networkHash: null, addressHash: 'routing-test', deviceFingerprint: null, userAgent: 'vitest' };

type FakeSession = { id: string; amount_total: number; currency: string; status: string; payment_status: string };
let sessions: Map<string, FakeSession>;
type FakeOrder = { id: string; status: string; value: string; currency: string; captured: boolean };
let orders: Map<string, FakeOrder>;
let dlocalCountries: string[];
let captureCalls: number;

function fakeProviders() {
  orders = new Map();
  sessions = new Map();
  dlocalCountries = [];
  captureCalls = 0;
  let next = 1;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    // dLocal Go: just enough to see where a checkout went.
    if (pathname === '/v1/payments' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { country?: string };
      dlocalCountries.push(body.country ?? '');
      return Response.json({ id: `DP-${next++}`, redirect_url: 'https://checkout.dlocalgo.com/validate/x' });
    }
    // Stripe Checkout.
    if (pathname === '/v1/checkout/sessions' && init.method === 'POST') {
      const form = new URLSearchParams(String(init.body));
      const id = `cs_live_${'a'.repeat(20)}${next++}`;
      sessions.set(id, { id, amount_total: Number(form.get('line_items[0][price_data][unit_amount]')), currency: form.get('line_items[0][price_data][currency]')!, status: 'open', payment_status: 'unpaid' });
      expect(form.get('success_url')).toContain('session_id={CHECKOUT_SESSION_ID}');
      return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const stripe = /^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/.exec(pathname);
    if (stripe) {
      const session = sessions.get(stripe[1]!);
      return session ? Response.json(session) : Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 });
    }
    // PayPal.
    if (pathname === '/v1/oauth2/token') return Response.json({ access_token: 'token', expires_in: 3600 });
    if (pathname === '/v2/checkout/orders' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { purchase_units: Array<{ amount: { value: string; currency_code: string } }> };
      const id = `ORDER${String(next++).padStart(6, '0')}`;
      orders.set(id, { id, status: 'CREATED', value: body.purchase_units[0]!.amount.value, currency: body.purchase_units[0]!.amount.currency_code, captured: false });
      return Response.json({ id, status: 'CREATED', links: [{ rel: 'payer-action', href: `https://www.paypal.com/checkoutnow?token=${id}` }] });
    }
    const match = /^\/v2\/checkout\/orders\/([A-Z0-9]+)(\/capture)?$/.exec(pathname);
    if (match) {
      const order = orders.get(match[1]!);
      if (!order) return Response.json({ name: 'RESOURCE_NOT_FOUND' }, { status: 404 });
      if (match[2]) {
        captureCalls += 1;
        if (order.captured) return Response.json({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, { status: 422 });
        if (order.status !== 'APPROVED') return Response.json({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] }, { status: 422 });
        order.captured = true;
        order.status = 'COMPLETED';
      }
      const captures = order.captured ? [{ id: `CAP${order.id}`, status: 'COMPLETED', amount: { currency_code: order.currency, value: order.value } }] : [];
      return Response.json({ id: order.id, status: order.status, purchase_units: [{ payments: { captures } }] });
    }
    return Response.json({ name: 'UNEXPECTED' }, { status: 400 });
  });
}

async function memberIn(countryIso: string | null) {
  const { userId } = await register(
    db(),
    { email: `route-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Compradora', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  if (countryIso) {
    const [country] = await db().select({ id: locations.id }).from(locations).where(and(eq(locations.level, 'country'), eq(locations.isoCode, countryIso)));
    // A place below the country, as a real member would choose.
    const [below] = await db().select({ id: locations.id }).from(locations).where(eq(locations.parentId, country!.id)).limit(1);
    const locationId = below?.id ?? country!.id;
    await db().insert(userProfiles).values({ userId, locationId }).onConflictDoUpdate({ target: userProfiles.userId, set: { locationId } });
  }
  return userId;
}

async function buy(userId: string) {
  const { reference, redirectUrl } = await startTokenPurchase(db(), { userId, packageKey: 'tokens_10', attemptId: crypto.randomUUID(), appUrl: 'https://yavaya.lat', description: 'Tokens de Yavaya' });
  const [transaction] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.reference, reference));
  return { redirectUrl, transaction: transaction! };
}

const KEYS = ['DLOCALGO_ENV', 'DLOCALGO_API_KEY', 'DLOCALGO_SECRET_KEY', 'PAYPAL_ENV', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'STRIPE_SECRET_KEY'] as const;
function configure(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}
const BOTH = { DLOCALGO_ENV: 'live', DLOCALGO_API_KEY: 'k', DLOCALGO_SECRET_KEY: 's', PAYPAL_ENV: 'live', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret' };

describe('payments by country', () => {
  beforeEach(async () => {
    await resetTransactionalData();
    configure(BOTH);
    fakeProviders();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    configure({});
  });
  afterAll(async () => {
    await closeDb();
  });

  it('formats PayPal amounts in the currency precision', () => {
    expect(paypalValue({ amountMinor: 449, currency: 'USD' })).toBe('4.49');
    expect(paypalMinor('4.49', 'USD')).toBe(449);
  });

  it('finds a member country from the location they chose', async () => {
    expect(await memberCountry(db(), await memberIn('NI'))).toBe('NI');
    expect(await memberCountry(db(), await memberIn(null))).toBeNull();
  });

  it('routes each country to the provider that works there', () => {
    expect(routeFor('GT')).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
    expect(routeFor('MX')).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
    for (const iso of ['NI', 'HN', 'SV', 'BZ']) expect(routeFor(iso)).toMatchObject({ status: 'ready', provider: { key: 'paypal' } });

    configure({ DLOCALGO_ENV: 'live', DLOCALGO_API_KEY: 'k', DLOCALGO_SECRET_KEY: 's' });
    expect(routeFor('NI')).toEqual({ status: 'pending', providerKey: 'stripe' });
    // No country on the profile: a provider whose checkout asks for it.
    expect(routeFor(null)).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
  });

  it('lists every country Yavaya serves with how it pays', async () => {
    const rows = await countryRoutes(db(), 'es');
    const byIso = Object.fromEntries(rows.map((r) => [r.iso, r]));
    expect(byIso.GT).toMatchObject({ providerKey: 'dlocalgo', ready: true });
    expect(byIso.NI).toMatchObject({ providerKey: 'paypal', ready: true });
  });

  it('sends a Guatemalan member to dLocal Go, with the country filled in', async () => {
    const { transaction } = await buy(await memberIn('GT'));
    expect(transaction.provider).toBe('dlocalgo');
    expect(dlocalCountries).toEqual(['GT']);
  });

  it('refuses honestly when the country provider is not connected yet', async () => {
    configure({ DLOCALGO_ENV: 'live', DLOCALGO_API_KEY: 'k', DLOCALGO_SECRET_KEY: 's' });
    await expect(buy(await memberIn('NI'))).rejects.toMatchObject({ messageKey: 'payments.error.country' });
    expect(await db().select().from(paymentTransactions)).toHaveLength(0);
  });

  it('lets a Nicaraguan member pay with PayPal, credited only after capture', async () => {
    const userId = await memberIn('NI');
    const before = await getBalance(db(), userId);
    const { redirectUrl, transaction } = await buy(userId);
    expect(transaction.provider).toBe('paypal');
    expect(redirectUrl).toMatch(/^https:\/\/www\.paypal\.com\//);
    const orderId = transaction.providerTransactionId!;
    expect(orders.get(orderId)).toMatchObject({ value: '4.49', currency: 'USD' });

    // Coming back before approving changes nothing.
    const early = await paypalReturn(new Request(`https://yavaya.lat/api/payments/paypal/return?token=${orderId}`), { params: Promise.resolve({ provider: 'paypal' }) });
    expect(early.headers.get('location')).toContain('purchase=returned');
    expect(await getBalance(db(), userId)).toBe(before);

    orders.get(orderId)!.status = 'APPROVED';
    const back = await paypalReturn(new Request(`https://yavaya.lat/api/payments/paypal/return?token=${orderId}`), { params: Promise.resolve({ provider: 'paypal' }) });
    expect(back.headers.get('location')).toContain('purchase=paid');
    expect(await getBalance(db(), userId)).toBe(before + 10);

    // Returning again, or the reconciliation job, never credits twice.
    await paypalReturn(new Request(`https://yavaya.lat/api/payments/paypal/return?token=${orderId}`), { params: Promise.resolve({ provider: 'paypal' }) });
    await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(await getBalance(db(), userId)).toBe(before + 10);
  });

  it('captures an approved order whose buyer never came back', async () => {
    const userId = await memberIn('HN');
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    orders.get(transaction.providerTransactionId!)!.status = 'APPROVED';
    const result = await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(result).toMatchObject({ settled: 1, failed: 0 });
    expect(captureCalls).toBe(1);
    expect(await getBalance(db(), userId)).toBe(before + 10);
  });

  it('sends every country to Stripe once it is configured', async () => {
    configure({ ...BOTH, STRIPE_SECRET_KEY: 'rk_live_abc123' });
    for (const iso of ['NI', 'HN', 'SV', 'BZ', 'GT', 'CR', 'PA', 'MX']) expect(routeFor(iso)).toMatchObject({ status: 'ready', provider: { key: 'stripe' } });

    const userId = await memberIn('NI');
    const before = await getBalance(db(), userId);
    const { redirectUrl, transaction } = await buy(userId);
    expect(transaction.provider).toBe('stripe');
    expect(redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const sessionId = transaction.providerTransactionId!;
    expect(sessions.get(sessionId)).toMatchObject({ amount_total: 449, currency: 'usd' });

    const route = { params: Promise.resolve({ provider: 'stripe' }) };
    // Back before paying: nothing.
    await paypalReturn(new Request(`https://yavaya.lat/api/payments/stripe/return?session_id=${sessionId}`), route);
    expect(await getBalance(db(), userId)).toBe(before);

    Object.assign(sessions.get(sessionId)!, { status: 'complete', payment_status: 'paid' });
    const back = await paypalReturn(new Request(`https://yavaya.lat/api/payments/stripe/return?session_id=${sessionId}`), route);
    expect(back.headers.get('location')).toContain('purchase=paid');
    expect(await getBalance(db(), userId)).toBe(before + 10);
    await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(await getBalance(db(), userId)).toBe(before + 10);
  });

  it('never credits a Stripe session paid for a different amount', async () => {
    configure({ ...BOTH, STRIPE_SECRET_KEY: 'rk_live_abc123' });
    const userId = await memberIn('BZ');
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid', amount_total: 49 });
    await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(await getBalance(db(), userId)).toBe(before);
  });

  it('never credits a PayPal capture for a different amount', async () => {
    const userId = await memberIn('SV');
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(orders.get(transaction.providerTransactionId!)!, { status: 'APPROVED', value: '0.49' });
    await paypalReturn(new Request(`https://yavaya.lat/api/payments/paypal/return?token=${transaction.providerTransactionId}`), { params: Promise.resolve({ provider: 'paypal' }) });
    expect(await getBalance(db(), userId)).toBe(before);
    const [after] = await db().select().from(paymentTransactions).where(eq(paymentTransactions.id, transaction.id));
    expect(after?.reconciliationState).toBe('discrepancy');
  });
});
