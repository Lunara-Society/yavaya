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
import { GET as providerReturn } from '@/app/api/payments/[provider]/return/route';
import { resetTransactionalData } from '../helpers/database';

/**
 * Stripe for every country; dLocal Go, where it is licensed, only while Stripe
 * is not configured. Stripe is a stand-in that behaves as Checkout documents:
 * a session is created, paid by the buyer on Stripe's page, then read by the
 * server — and only that answer is money.
 */

const context = { networkHash: null, addressHash: 'routing-test', deviceFingerprint: null, userAgent: 'vitest' };

type FakeSession = { id: string; amount_total: number; currency: string; status: string; payment_status: string };
let sessions: Map<string, FakeSession>;
let dlocalCountries: string[];

function fakeProviders() {
  sessions = new Map();
  dlocalCountries = [];
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

const KEYS = ['DLOCALGO_ENV', 'DLOCALGO_API_KEY', 'DLOCALGO_SECRET_KEY', 'STRIPE_SECRET_KEY'] as const;
function configure(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}
const DLOCAL = { DLOCALGO_ENV: 'live', DLOCALGO_API_KEY: 'k', DLOCALGO_SECRET_KEY: 's' };
const BOTH = { ...DLOCAL, STRIPE_SECRET_KEY: 'rk_live_abc123' };

describe('payments by country', () => {
  beforeEach(async () => {
    await resetTransactionalData();
    configure(DLOCAL);
    fakeProviders();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    configure({});
  });
  afterAll(async () => {
    await closeDb();
  });

  it('finds a member country from the location they chose', async () => {
    expect(await memberCountry(db(), await memberIn('NI'))).toBe('NI');
    expect(await memberCountry(db(), await memberIn(null))).toBeNull();
  });

  it('falls back to dLocal Go where it is licensed while Stripe is not configured', () => {
    expect(routeFor('GT')).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
    expect(routeFor('MX')).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
    // Elsewhere only Stripe can take the payment, and it is not connected.
    for (const iso of ['NI', 'HN', 'SV', 'BZ']) expect(routeFor(iso)).toEqual({ status: 'pending', providerKey: 'stripe' });
    // No country on the profile: a provider whose checkout asks for it.
    expect(routeFor(null)).toMatchObject({ status: 'ready', provider: { key: 'dlocalgo' } });
  });

  it('lists every country Yavaya serves with how it pays', async () => {
    const rows = await countryRoutes(db(), 'es');
    const byIso = Object.fromEntries(rows.map((r) => [r.iso, r]));
    expect(byIso.GT).toMatchObject({ providerKey: 'dlocalgo', ready: true });
    expect(byIso.NI).toMatchObject({ providerKey: 'stripe', ready: false });
  });

  it('sends a Guatemalan member to dLocal Go, with the country filled in', async () => {
    const { transaction } = await buy(await memberIn('GT'));
    expect(transaction.provider).toBe('dlocalgo');
    expect(dlocalCountries).toEqual(['GT']);
  });

  it('refuses honestly when the country provider is not connected yet', async () => {
    await expect(buy(await memberIn('NI'))).rejects.toMatchObject({ messageKey: 'payments.error.country' });
    expect(await db().select().from(paymentTransactions)).toHaveLength(0);
  });

  it('credits a paid Stripe session whose buyer never came back', async () => {
    configure(BOTH);
    const userId = await memberIn('HN');
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid' });
    const result = await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(result).toMatchObject({ settled: 1, failed: 0 });
    expect(await getBalance(db(), userId)).toBe(before + 10);
  });

  it('has no PayPal: its old return address is not found', async () => {
    const response = await providerReturn(new Request('https://yavaya.lat/api/payments/paypal/return?token=ORDER000001'), { params: Promise.resolve({ provider: 'paypal' }) });
    expect(response.status).toBe(404);
  });

  it('sends every country to Stripe once it is configured', async () => {
    configure(BOTH);
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
    await providerReturn(new Request(`https://yavaya.lat/api/payments/stripe/return?session_id=${sessionId}`), route);
    expect(await getBalance(db(), userId)).toBe(before);

    Object.assign(sessions.get(sessionId)!, { status: 'complete', payment_status: 'paid' });
    const back = await providerReturn(new Request(`https://yavaya.lat/api/payments/stripe/return?session_id=${sessionId}`), route);
    expect(back.headers.get('location')).toContain('purchase=paid');
    expect(await getBalance(db(), userId)).toBe(before + 10);
    await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(await getBalance(db(), userId)).toBe(before + 10);
  });

  it('never credits a Stripe session paid for a different amount', async () => {
    configure(BOTH);
    const userId = await memberIn('BZ');
    const before = await getBalance(db(), userId);
    const { transaction } = await buy(userId);
    Object.assign(sessions.get(transaction.providerTransactionId!)!, { status: 'complete', payment_status: 'paid', amount_total: 49 });
    await reconcilePendingPayments(db(), new Date(Date.now() + 10 * 60_000));
    expect(await getBalance(db(), userId)).toBe(before);
  });
});
