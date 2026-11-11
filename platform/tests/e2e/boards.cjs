/**
 * The board districts in a real browser, end to end: a member publishes in
 * Hogar, a second member finds it, sees the WhatsApp button and reports it,
 * and a moderator takes it down.
 *
 *   npx tsx --conditions=react-server tests/e2e/boards-setup.ts > /tmp/boards.json
 *   node tests/e2e/boards.cjs /tmp/boards.json [http://127.0.0.1:3000]
 */
const { chromium } = require('playwright');
const who = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
const BASE = process.argv[3] ?? 'http://127.0.0.1:3000';
const TITLE = `Casa en alquiler ${Date.now()}`;

const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};

async function signedIn(browser, member) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', member.email);
  await page.fill('input[name="password"]', member.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const author = await signedIn(browser, who.author);
    await author.goto(`${BASE}/hogar/new?sub=rentals`);
    await author.selectOption('select[name="kind"]', 'offer');
    check((await author.inputValue('select[name="subdistrict"]')) === 'rentals', 'the subdistrict chosen on the district page arrives in the form');
    await author.fill('input[name="title"]', TITLE);
    await author.fill('textarea[name="body"]', 'Dos cuartos, patio y agua todo el día. Cerca de la parada de buses.');
    await author.fill('input[name="priceText"]', 'C$ 5,500 al mes');
    await author.fill('[role="combobox"]', 'Mana');
    await author.locator('[role="listbox"] [role="option"]').first().click();
    await Promise.all([author.waitForURL(/\/hogar\/[0-9a-f-]{36}/), author.click('form.mk-form button[type="submit"]')]);
    const postUrl = author.url().split('?')[0];
    check(await author.getByRole('heading', { name: TITLE }).isVisible(), 'the author lands on the published post');
    check((await author.locator('.bd a[href^="https://wa.me/"]').count()) === 0, 'the author is not shown a contact button for their own post');

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`${BASE}/hogar?sub=rentals`);
    check(await visitor.getByText(TITLE).isVisible(), 'a visitor sees the post in its subdistrict');
    await visitor.goto(postUrl);
    check((await visitor.locator('.bd a[href^="https://wa.me/"]').count()) === 0, 'a visitor is not shown the WhatsApp number');

    const reader = await signedIn(browser, who.reader);
    await reader.goto(`${BASE}/hogar?q=${encodeURIComponent(TITLE)}`);
    check(await reader.getByText(TITLE).isVisible(), 'a member finds it by its words');
    await reader.goto(`${BASE}/hogar?sub=rentals`);
    await Promise.all([reader.waitForURL(/mine=1&saved=1/), reader.click('form.bd-alert-save button[type="submit"]')]);
    await reader.locator('.bd-alerts li').first().waitFor({ timeout: 10000 }).catch(() => {});
    check((await reader.locator('.bd-alerts li').count()) === 1, 'a member saves the search as an alert and sees it under their alerts');
    await reader.goto(postUrl);
    check(((await reader.locator('.bd a[href^="https://wa.me/"]').first().getAttribute('href')) ?? '').startsWith('https://wa.me/50588881234'), 'a signed-in member gets the author’s WhatsApp');
    await reader.locator('details.bd-report summary').click();
    await reader.selectOption('details.bd-report select[name="category"]', 'scam');
    await Promise.all([reader.waitForURL(/reported=TCK-/), reader.click('details.bd-report button[type="submit"]')]);
    await reader.locator('.bd-ok').waitFor({ timeout: 10000 }).catch(() => {});
    check(await reader.locator('.bd-ok').isVisible(), 'the report is acknowledged with a case number');

    const moderator = await signedIn(browser, who.moderator);
    await moderator.goto(`${BASE}/admin/distritos`);
    const item = moderator.locator('article', { hasText: TITLE });
    check(await item.isVisible(), 'the moderator sees the case');
    await Promise.all([moderator.waitForLoadState('networkidle'), item.locator('button[value="remove"]').click()]);
    await moderator.goto(`${BASE}/admin/distritos`);
    check((await moderator.locator('article', { hasText: TITLE }).count()) === 0, 'the case leaves the queue once decided');

    await visitor.goto(`${BASE}/hogar?sub=rentals`);
    check((await visitor.getByText(TITLE).count()) === 0, 'the removed post is gone from the district');
    const gone = await visitor.goto(postUrl);
    check(gone.status() === 404, 'and its page answers 404');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
