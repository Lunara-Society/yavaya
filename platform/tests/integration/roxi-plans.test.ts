import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { listNotifications } from '@/server/domains/notifications/service';
import { roxiCreditLedger, roxiItems, roxiSubscriptions, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { ROXI_CREDIT_RULES, ROXI_PLANS, planAllows } from '@/config/business-rules';
import { canStart, creditView, creditsForCost, currentPlan, grantPurchasedCredits, periodKey, setPlan, spendCredits } from '@/server/domains/roxi/credits';
import { addItem, cleanBody, deleteAllItems, deliverDueReminders, listItems, memoryForRoxi, nextDue, updateItem } from '@/server/domains/roxi/items';
import { confirmationToken, confirmationValid } from '@/server/domains/roxi/connectors/service';
import { checkUrl, isPublicAddress, UnsafeAddressError } from '@/server/domains/roxi/connectors/safe-http';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'roxi-plans-test', deviceFingerprint: null, userAgent: 'vitest' };

async function member() {
  const { userId } = await register(
    db(),
    { email: `rx-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Vecina', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const nov = new Date(Date.UTC(2026, 10, 5, 12));
const dec = new Date(Date.UTC(2026, 11, 2, 12));

beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('Roxi credits', () => {
  it('gives Free its monthly allowance, refills it each month and never twice', async () => {
    const userId = await member();
    const first = await creditView(db(), userId, nov);
    expect(first.plan.plan).toBe('free');
    expect(first.available).toBe(ROXI_PLANS.free.monthlyCredits);
    await creditView(db(), userId, nov);
    const grants = await db().select().from(roxiCreditLedger).where(eq(roxiCreditLedger.userId, userId));
    expect(grants).toHaveLength(1);
    await spendCredits(db(), { userId, credits: 400, reason: 'conversation', reference: 'conv_a', now: nov });
    expect((await creditView(db(), userId, dec)).available).toBe(ROXI_PLANS.free.monthlyCredits);
  });

  it('counts a conversation once, and lets a long one go below zero without cutting it', async () => {
    const userId = await member();
    await spendCredits(db(), { userId, credits: 1_400, reason: 'conversation', reference: 'conv_1', now: nov });
    const again = await spendCredits(db(), { userId, credits: 1_400, reason: 'conversation', reference: 'conv_1', now: nov });
    expect(again.recorded).toBe(false);
    expect(again.view.planCredits).toBe(ROXI_PLANS.free.monthlyCredits - 1_400);
    const over = await spendCredits(db(), { userId, credits: 300, reason: 'conversation', reference: 'conv_2', now: nov });
    expect(over.view.planCredits).toBe(ROXI_PLANS.free.monthlyCredits - 1_700);
    expect(over.view.available).toBe(0);
    expect(canStart(over.view)).toBe(false);
    // The debt comes off the next month's allowance.
    expect((await creditView(db(), userId, dec)).planCredits).toBe(ROXI_PLANS.free.monthlyCredits - 200);
  });

  it('spends plan credits before bought ones, and bought ones lapse after a year', async () => {
    const userId = await member();
    await grantPurchasedCredits(db(), { userId, credits: 1_000, paymentReference: 'YAV-1', now: nov });
    expect(await grantPurchasedCredits(db(), { userId, credits: 1_000, paymentReference: 'YAV-1', now: nov })).toBe(false);
    const spent = await spendCredits(db(), { userId, credits: ROXI_PLANS.free.monthlyCredits + 200, reason: 'conversation', reference: 'conv_x', now: nov });
    expect(spent.view.planCredits).toBe(0);
    expect(spent.view.purchasedCredits).toBe(800);
    const later = new Date(nov);
    later.setUTCMonth(later.getUTCMonth() + ROXI_CREDIT_RULES.purchasedCreditMonths + 1);
    expect((await creditView(db(), userId, later)).purchasedCredits).toBe(0);
  });

  it('turns a provider cost into credits, rounding up', () => {
    expect(creditsForCost(0.049378)).toBe(50);
    expect(creditsForCost(0.001)).toBe(1);
    expect(creditsForCost(0)).toBe(0);
    expect(creditsForCost(Number.NaN)).toBe(0);
  });
});

describe('Roxi plans', () => {
  it('starts Pro for its period, refills on renewal, and counts as Free once the period is over', async () => {
    const userId = await member();
    const end = new Date(Date.UTC(2026, 11, 5, 12));
    await setPlan(db(), { userId, plan: 'pro', source: 'payment', providerSubscriptionId: 'sub_test123456', periodStart: nov, periodEnd: end });
    const pro = await creditView(db(), userId, nov);
    expect(pro.plan.plan).toBe('pro');
    expect(pro.available).toBe(ROXI_PLANS.pro.monthlyCredits);
    expect(periodKey(pro.plan, nov)).toContain('sub_test123456');
    // Past the period with no renewal read: Free.
    expect((await currentPlan(db(), userId, new Date(end.getTime() + 1000))).plan).toBe('free');
  });

  it('carries what was left of Pro into Max on an upgrade, and remembers the Pro subscription to cancel', async () => {
    const userId = await member();
    const end = new Date(Date.UTC(2026, 11, 5, 12));
    await setPlan(db(), { userId, plan: 'pro', source: 'payment', providerSubscriptionId: 'sub_pro1234567', periodStart: nov, periodEnd: end });
    await spendCredits(db(), { userId, credits: 1_000, reason: 'conversation', reference: 'conv_p', now: nov });
    const later = new Date(nov.getTime() + 3_600_000);
    await setPlan(db(), { userId, plan: 'max', source: 'payment', providerSubscriptionId: 'sub_max1234567', periodStart: later, periodEnd: new Date(later.getTime() + 30 * 86_400_000) });
    const max = await creditView(db(), userId, later);
    expect(max.plan.plan).toBe('max');
    expect(max.planCredits).toBe(ROXI_PLANS.max.monthlyCredits + ROXI_PLANS.pro.monthlyCredits - 1_000);
    const [row] = await db().select().from(roxiSubscriptions).where(eq(roxiSubscriptions.userId, userId));
    expect(row?.replacedSubscriptionId).toBe('sub_pro1234567');
  });

  it('keeps the help people with little need on Free', () => {
    for (const skill of ['start_with_nothing', 'lost_pet_guard', 'help_match', 'skill_discovery'] as const) expect(planAllows('free', skill)).toBe(true);
    expect(planAllows('free', 'connectors_google')).toBe(false);
    expect(planAllows('pro', 'connectors_google')).toBe(true);
    expect(planAllows('pro', 'connectors_custom')).toBe(false);
    expect(planAllows('max', 'family_circle')).toBe(true);
  });

  it('prices both paid plans above the most their credits can cost', () => {
    for (const plan of [ROXI_PLANS.pro, ROXI_PLANS.max]) {
      const worstCaseCents = plan.monthlyCredits * ROXI_CREDIT_RULES.usdPerCredit * 100;
      // Card fees are about 30 cents and 3 %: what is left must still cover the credits.
      expect(plan.priceMinor * 0.97 - 30).toBeGreaterThan(worstCaseCents);
    }
  });
});

describe('What Roxi keeps', () => {
  it('seals the member\'s words and enforces the plan\'s limits', async () => {
    const userId = await member();
    const goal = await addItem(db(), userId, { kind: 'goal', body: cleanBody({ title: 'Comprar una moto', target: 30_000, progress: 2_000 }) });
    const [stored] = await db().select().from(roxiItems).where(eq(roxiItems.id, goal.id));
    expect(stored?.bodySealed).not.toContain('moto');
    expect((await listItems(db(), userId, 'goal'))[0]?.title).toBe('Comprar una moto');
    // Free keeps one goal.
    await expect(addItem(db(), userId, { kind: 'goal', body: cleanBody({ title: 'Otra meta' }) })).rejects.toMatchObject({ messageKey: 'roxi.memory.error.goals_one' });
    // Repeating reminders are Pro and Max.
    await expect(addItem(db(), userId, { kind: 'reminder', body: cleanBody({ title: 'Pagar la luz' }), dueAt: dec, repeat: 'monthly' })).rejects.toMatchObject({ messageKey: 'roxi.memory.error.repeat' });
    await updateItem(db(), userId, goal.id, { body: { progress: 5_000 } });
    expect((await listItems(db(), userId, 'goal'))[0]).toMatchObject({ title: 'Comprar una moto', progress: 5_000, target: 30_000 });
  });

  it('only lets the member touch their own things', async () => {
    const owner = await member();
    const other = await member();
    const fact = await addItem(db(), owner, { kind: 'fact', body: cleanBody({ title: 'Mi mamá cumple el 17' }) });
    await expect(updateItem(db(), other, fact.id, { done: true })).rejects.toMatchObject({ code: 'not_found' });
    expect(await deleteAllItems(db(), other)).toBe(0);
    expect(await listItems(db(), owner)).toHaveLength(1);
  });

  it('sends a due reminder once, without its text, and moves a repeating one on', async () => {
    const userId = await member();
    const end = new Date(Date.UTC(2027, 0, 5));
    await setPlan(db(), { userId, plan: 'pro', source: 'admin', providerSubscriptionId: null, periodStart: new Date(Date.now() - 86_400_000), periodEnd: end });
    const due = new Date(Date.now() - 60_000);
    const reminder = await addItem(db(), userId, { kind: 'reminder', body: cleanBody({ title: 'Comprar comida del perro' }), dueAt: due, repeat: 'weekly' });
    expect((await deliverDueReminders(db())).sent).toBe(1);
    expect((await deliverDueReminders(db())).sent).toBe(0);
    const notes = await listNotifications(db(), userId);
    expect(notes[0]?.titleKey).toBe('roxi.notify.reminder');
    expect(JSON.stringify(notes[0])).not.toContain('perro');
    const [after] = await listItems(db(), userId, 'reminder');
    expect(after?.id).toBe(reminder.id);
    expect(after?.dueAt?.getTime()).toBe(nextDue(due, 'weekly')!.getTime());
    expect((await memoryForRoxi(db(), userId, new Date().toISOString().slice(0, 10), 'America/Managua')).reminders).toHaveLength(1);
  });
});

describe('Roxi connectors: safety', () => {
  it('refuses private, internal and non-https addresses', () => {
    for (const bad of ['http://example.com', 'https://localhost/mcp', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://postgres.railway.internal/', 'https://user:pass@example.com/', 'notaurl']) {
      expect(() => checkUrl(bad), bad).toThrow(UnsafeAddressError);
    }
    expect(checkUrl('https://mcp.example.com/mcp').host).toBe('mcp.example.com');
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    for (const address of ['192.168.1.1', '172.16.0.1', '100.64.0.1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) expect(isPublicAddress(address), address).toBe(false);
  });

  it('binds a confirmation to exactly the action the member saw', () => {
    const args = { to: 'ana@example.com', subject: 'Hola', body: 'Gracias' };
    const token = confirmationToken('user-1', 'conn-1', 'gmail_send', args);
    expect(confirmationValid(token, 'user-1', 'conn-1', 'gmail_send', { body: 'Gracias', subject: 'Hola', to: 'ana@example.com' })).toBe(true);
    expect(confirmationValid(token, 'user-1', 'conn-1', 'gmail_send', { ...args, to: 'thief@example.com' })).toBe(false);
    expect(confirmationValid(token, 'user-2', 'conn-1', 'gmail_send', args)).toBe(false);
    expect(confirmationValid(token, 'user-1', 'conn-1', 'gmail_draft', args)).toBe(false);
    expect(confirmationValid(token, 'user-1', 'conn-1', 'gmail_send', args, Date.now() + 10 * 60_000)).toBe(false);
    expect(confirmationValid(undefined, 'user-1', 'conn-1', 'gmail_send', args)).toBe(false);
  });
});
