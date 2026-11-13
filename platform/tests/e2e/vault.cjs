/*
 * The Vault in a phone's browser (docs/PLAY.md, "The Vault"): reached from
 * the Plaza; every product carries its status; a piece not usable yet shows
 * the disclosure and cannot be bought while the owner's switch is off; a
 * wearable outfit is bought for gems, numbered, and appears in the
 * inventory; nothing is wider than the screen; and the admin page lists the
 * products.
 *
 *   npx tsx --conditions=react-server tests/e2e/vault-setup.ts > /tmp/vault.json
 *   VAULT_SETUP=/tmp/vault.json node tests/e2e/vault.cjs [base url]
 */
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const who = JSON.parse(fs.readFileSync(process.env.VAULT_SETUP, 'utf8'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};
const seen = (page, selector) => page.waitForSelector(selector, { timeout: 15_000 }).then(() => true, () => false);
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es' });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);

  await page.goto(`${BASE}/play`, { timeout: 120_000 });
  if (await seen(page, '.yp-option')) {
    await page.click('.yp-option >> nth=1');
    await page.click('.yp-primary');
  }
  check(await seen(page, '.yp-plaza'), 'the Plaza opens');
  await page.click('.yp-card:has(.yp-card-title:text-is("La Bóveda")) .yp-primary');
  check(await seen(page, '.yp-vault'), 'and the Vault opens from it');
  check(((await page.textContent('.yp-vault-headline')) ?? '').includes('Toda leyenda tiene un comienzo'), 'with the headline');
  check(await page.isVisible('.yp-vault-soon'), 'and the "more game modes coming soon" note');
  check((await page.$$('.yp-vault-collection')).length >= 6, 'six collections');
  const cards = await page.$$('.yp-vault-card');
  const badges = await page.$$('.yp-vault-card .yp-vault-badge');
  check(cards.length > 60 && badges.length === cards.length, `every product carries its status (${badges.length}/${cards.length})`);
  check((await page.$$('.yp-vault-badge.is-available')).length === 2, 'two of them usable now');
  check(await fits(page), 'nothing is wider than the screen');
  await shot(page, 'vault-collections');

  // A piece not usable yet: the disclosure, and no sale while the switch is off.
  await page.click('.yp-vault-card:has(.yp-vault-badge.is-future) >> nth=0');
  check(await seen(page, '.yp-vault-disclosure'), 'a piece not usable yet shows the disclosure');
  check(((await page.textContent('.yp-vault-disclosure')) ?? '').includes('No se garantiza ninguna fecha'), "in the owner's words");
  check(await page.isDisabled('.yp-vault-detail .yp-vault-price'), "and cannot be bought while the owner's switch is off");
  await shot(page, 'vault-disclosure');
  await page.click('.yp-vault-detail .yp-icon');

  // A wearable outfit, bought for gems.
  await page.click('.yp-vault-card:has(.yp-vault-badge.is-available) >> nth=0');
  check(!(await page.isVisible('.yp-vault-disclosure')), 'a wearable piece needs no disclosure');
  await page.click('.yp-vault-detail .yp-vault-price');
  check(await seen(page, '.yp-vault-mine'), 'it is bought');
  const mine = (await page.textContent('.yp-vault-mine')) ?? '';
  check(/Nº \d{3}/.test(mine), `with its edition number (${mine})`);
  await shot(page, 'vault-bought');
  await page.click('.yp-vault-detail .yp-icon');
  await page.click('.yp-vault .yp-tab >> nth=1');
  check((await page.$$('.yp-vault-body .yp-card')).length === 1, 'and it is in the inventory');
  await shot(page, 'vault-inventory');

  await page.goto(`${BASE}/admin/vault`, { timeout: 120_000 });
  check((await page.$$('.va-product')).length > 60, 'the admin page lists the products');
  check(await fits(page), 'and fits the phone');
  await shot(page, 'vault-admin');

  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exitCode = failures ? 1 : 0;
})();
