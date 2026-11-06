/**
 * Browser check of Roxi's wave-2 pages — Mi mundo (/roxi/hoy), the business
 * ledger (/roxi/negocio), watches/missions/capsules on /roxi/memory and the
 * front door on the homepage — against a local server:
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-plans-setup.ts > /tmp/plans.json
 *   PLANS_SETUP=/tmp/plans.json BASE=http://localhost:3100 node tests/e2e/roxi-world.cjs
 *
 * The server needs ROXI_KEY set. SHOTS=<dir> keeps screenshots.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = process.env.BASE ?? 'http://localhost:3100';
const setup = JSON.parse(fs.readFileSync(process.env.PLANS_SETUP, 'utf8'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

async function signIn(browser, who, viewport) {
  // The member has no place yet, so the site's day clock (Managua) is their today; the device agrees.
  const context = await browser.newContext({ viewport, locale: 'es', timezoneId: 'America/Managua' });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return page;
}

const seen = (locator) => locator.first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const submit = (page, form) => Promise.all([page.waitForURL(/done=|error=/, { timeout: 60_000, waitUntil: 'commit' }), form.locator('button[type="submit"]').first().click()]);

(async () => {
  const browser = await chromium.launch();

  // A visitor sees the homepage without the member's front door.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/`);
    check((await page.locator('.rx-door').count()) === 0, 'visitors do not get the member front door');
    await page.close();
  }

  const page = await signIn(browser, setup.plain, { width: 390, height: 844 });

  // Homepage: the front door with its five ways in.
  await page.goto(`${BASE}/`);
  check(await seen(page.locator('.rx-door.is-hero')), 'signed-in homepage shows the front door');
  check((await page.locator('.rx-door-btn').count()) === 5, 'front door has five ways in');
  check(await noHorizontalScroll(page), 'homepage fits a phone with the door');
  await shot(page, 'home-door-phone');

  // Mi mundo.
  await page.goto(`${BASE}/roxi/hoy`);
  check(await seen(page.locator('h1:has-text("Vecina")')), 'Mi mundo greets the member by name');
  check((await page.locator('.rx-cards > .rx-card').count()) === 3, 'Mi mundo has three cards');
  check(await seen(page.locator('text=Elige tu pueblo o ciudad')), 'without a place, it asks for one instead of inventing a community');
  check((await page.locator('.rx-opportunity').count()) === 0, 'Free members get no daily opportunity');
  check(await noHorizontalScroll(page), 'Mi mundo fits a phone');
  await shot(page, 'hoy-phone');

  // The ledger: a sale with its cost, an expense, then a correction.
  await page.goto(`${BASE}/roxi/negocio`);
  let form = page.locator('form.rx-form');
  await form.locator('select[name="kind"]').selectOption('sale');
  await form.locator('input[name="amount"]').fill('1.800');
  await form.locator('input[name="cost"]').fill('1200');
  check((await form.locator('input[name="currency"]').inputValue()) === '', 'without a place, no currency is guessed');
  await form.locator('input[name="currency"]').fill('NIO');
  await submit(page, form);
  check(await seen(page.locator('.rx-banner.is-good')), 'sale saved');
  const today = page.locator('.rx-cards > .rx-card').first();
  check(/NIO\s*1[.,]?800/.test(await today.innerText()), 'today shows the sale of 1,800 (1.800 read as thousands)');
  check(/NIO\s*600/.test(await today.innerText()), 'estimated gross profit on the costed sale is 600');
  form = page.locator('form.rx-form');
  await form.locator('select[name="kind"]').selectOption('expense');
  await form.locator('input[name="amount"]').fill('250');
  await form.locator('input[name="currency"]').fill('NIO');
  await submit(page, form);
  // The URL already carries done= from the first save, so wait for the totals themselves.
  const cashCell = page.locator('.rx-cards > .rx-card').first().locator('dd').nth(4);
  await page.waitForFunction((el) => /1[.,]?550/.test(el.textContent ?? ''), await cashCell.elementHandle(), { timeout: 20_000 }).catch(() => undefined);
  const cash = await cashCell.innerText();
  check(/1[.,]?550/.test(cash), `cash difference is sales − expenses (${cash})`);
  await Promise.all([page.waitForURL(/done=|error=/, { timeout: 60_000, waitUntil: 'commit' }), page.locator('.rx-items li').first().locator('button.rx-icon').click()]);
  check(await seen(page.locator('.rx-items li.is-done')), 'a voided entry stays in the history, marked');
  check(await noHorizontalScroll(page), 'ledger fits a phone');
  await shot(page, 'negocio-phone');

  // Memory: a watch works on Free; missions and capsules say they need Pro.
  await page.goto(`${BASE}/roxi/memory#watch`);
  form = page.locator('#watch form');
  await form.locator('input[name="query"]').fill('bicicleta');
  await form.locator('input[name="max"]').fill('3000');
  await form.locator('input[name="currency"]').fill('NIO');
  await submit(page, form);
  check(await seen(page.locator('#watch .rx-item-title:has-text("bicicleta")')), 'a watch is saved and listed');
  check((await page.locator('#mission form').count()) === 0, 'Free gets no mission form');
  check(await seen(page.locator('#mission >> text=Pro')), 'missions say they need Pro');
  check(await seen(page.locator('#camino')), 'Mi camino is shown');
  check(await seen(page.locator('#camino >> text=Registro de Yavaya')), 'the path marks what Yavaya recorded');
  check(await noHorizontalScroll(page), 'memory page fits a phone');
  await shot(page, 'memory-phone');

  // An administrator on Max can keep a mission and tick a step.
  const admin = await signIn(browser, setup.admin, { width: 1280, height: 900 });
  await admin.goto(`${BASE}/roxi`);
  await admin.click('button:has-text("Probar Max")');
  await admin.waitForURL(/done=trial/, { waitUntil: 'commit' });
  await admin.goto(`${BASE}/roxi/memory#mission`);
  form = admin.locator('#mission form');
  if (await form.count()) {
    await form.locator('input[name="title"]').fill('Abrir mi pulpería');
    await form.locator('textarea[name="steps"]').fill('Sacar permiso\nComprar estante');
    await submit(admin, form);
    check(await seen(admin.locator('#mission .rx-item-title:has-text("pulpería")')), 'Max member keeps a mission');
    await Promise.all([admin.waitForURL(/done=|error=/, { timeout: 60_000, waitUntil: 'commit' }), admin.locator('#mission .rx-tick').first().click()]);
    check(await seen(admin.locator('#mission .rx-tick.is-done')), 'a mission step can be ticked');
    await shot(admin, 'memory-max-desktop');
  } else {
    check(false, 'admin could not switch to Max to try missions');
  }

  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exitCode = failures ? 1 : 0;
})();
