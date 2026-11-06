/**
 * Browser check of Roxi's plans, memory and connections pages, against a
 * local server (see tests/e2e/README.md):
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-plans-setup.ts > /tmp/plans.json
 *   PLANS_SETUP=/tmp/plans.json BASE=http://localhost:3100 node tests/e2e/roxi-plans.cjs
 *
 * The server needs ROXI_KEY and ROXI_AGENT_ID set. Paid plans stay unbuyable
 * without ELEVENLABS_API_KEY, which this checks too. SHOTS=<dir> keeps screenshots.
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
  const context = await browser.newContext({ viewport, locale: 'es' });
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

(async () => {
  const browser = await chromium.launch();

  // Signed out: the plans are readable, nothing can be bought.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/roxi`);
    check((await page.locator('.rx-plan').count()) === 3, 'three plans shown to a visitor');
    check(/4[.,]99/.test(await page.locator('.rx-plan.is-pro .rx-price').innerText()), 'Pro shows its price');
    check((await page.locator('button:has-text("Elegir")').count()) === 0, 'no buy button while plans cannot be bought');
    check(await noHorizontalScroll(page), 'plans page fits a phone');
    await shot(page, 'plans-visitor-phone');
    await page.close();
  }

  // A plain member: Free, memory works within Free's limits, connections are closed to Free.
  {
    const page = await signIn(browser, setup.plain, { width: 390, height: 844 });
    await page.goto(`${BASE}/roxi`);
    check(await seen(page.locator('.rx-mine >> text=Gratis')), 'member sees their plan is Free');
    check(await seen(page.locator('text=Los planes de pago todavía no se pueden comprar')), 'says plainly why paid plans cannot be bought');
    check((await page.locator('.rx-skills .is-soon').count()) > 0, 'skills that do not work yet are marked as coming');

    await page.goto(`${BASE}/roxi/memory`);
    await page.fill('#goal input[name="title"]', 'Comprar una moto');
    await page.fill('#goal input[name="target"]', '30000');
    await page.click('#goal button:has-text("Añadir")');
    await page.waitForURL(/done=added/, { waitUntil: 'commit' });
    check(await seen(page.locator('#goal .rx-item-title', { hasText: 'Comprar una moto' })), 'a goal is saved and shown');
    await page.fill('#goal input[name="title"]', 'Segunda meta');
    await page.click('#goal button:has-text("Añadir")');
    await page.waitForURL(/error=/, { waitUntil: 'commit' });
    check(await seen(page.locator('[role="alert"]', { hasText: '1 metas' })), 'Free stops at one goal, with the reason');

    await page.fill('#task input[name="title"]', 'Ir al banco');
    await page.click('#task button:has-text("Añadir")');
    await page.waitForURL(/done=added/, { waitUntil: 'commit' });
    check(await seen(page.locator('#task .rx-item-title', { hasText: 'Ir al banco' })), 'a task for today is saved');
    await page.locator('#task li', { hasText: 'Ir al banco' }).locator('.rx-tick').click();
        check(await seen(page.locator('#task li.is-done', { hasText: 'Ir al banco' })), 'a task can be ticked off');

    const select = page.locator('#reminder select[name="repeat"] option');
    check((await select.count()) === 1, 'Free offers no repeating reminders');
    const tomorrow = new Date(Date.now() + 86_400_000);
    const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T08:00`;
    await page.fill('#reminder input[name="title"]', 'Comprar comida del perro');
    await page.fill('#reminder input[name="due"]', local);
    await page.click('#reminder button:has-text("Añadir")');
    await page.waitForURL(/done=added/, { waitUntil: 'commit' });
    check(await seen(page.locator('#reminder .rx-item-title', { hasText: 'Comprar comida del perro' })), 'a reminder is saved');
    check(await seen(page.locator('#reminder li', { hasText: 'perro' }).locator('text=08:00')), 'the reminder keeps the time the member chose');

    await page.fill('#moment input[name="title"]', 'Ayudé a una señora con sus bolsas');
    await page.click('#moment button:has-text("Añadir")');
    await page.waitForURL(/done=added/, { waitUntil: 'commit' });
    check(await seen(page.locator('#moment .rx-item-title', { hasText: 'bolsas' })), 'a good moment is saved');
    check(await noHorizontalScroll(page), 'memory page fits a phone');
    await shot(page, 'memory-phone');

    await page.goto(`${BASE}/roxi/connections`);
    check(await seen(page.locator('text=Disponible con Max.').first()), 'MCP and API say they need Max');
    check((await page.locator('form input[name="url"]').count()) === 0, 'no connection form a Free member could not use');
    await shot(page, 'connections-free-phone');

    // Forget everything.
    await page.goto(`${BASE}/roxi/memory`);
    await page.check('input[name="confirm"]');
    await page.click('button:has-text("Olvidar todo")');
    await page.waitForURL(/done=forgotten/, { waitUntil: 'commit' });
    check((await page.locator('.rx-item-title').count()) === 0, 'forget everything empties the page');
    await page.context().close();
  }

  // An administrator tries Max: connects a real public MCP server.
  {
    const page = await signIn(browser, setup.admin, { width: 1280, height: 900 });
    await page.goto(`${BASE}/roxi`);
    await page.click('button:has-text("Probar Max")');
    await page.waitForURL(/done=trial/, { waitUntil: 'commit' });
    check(await seen(page.locator('.rx-mine >> text=Max')), 'admin trial switches the plan to Max');
    await shot(page, 'plans-max-desktop');
    await page.goto(`${BASE}/roxi/connections`);
    await page.fill('form:has(input[name="token"]) input[name="label"]', 'DeepWiki');
    await page.fill('form:has(input[name="token"]) input[name="url"]', 'https://mcp.deepwiki.com/mcp');
    await page.click('button:has-text("Conectar servidor")');
    await page.waitForURL(/connected=mcp|error=/, { timeout: 60_000, waitUntil: 'commit' });
    check(page.url().includes('connected=mcp'), 'a real public MCP server connects');
    check(await seen(page.locator('.rx-conn', { hasText: 'DeepWiki' }).locator('text=herramientas')), 'its tools are listed');
    await page.fill('form:has(input[name="token"]) input[name="url"]', 'https://169.254.169.254/latest');
    await page.click('button:has-text("Conectar servidor")');
    await page.waitForURL(/error=/, { timeout: 60_000, waitUntil: 'commit' });
    check(await seen(page.locator('[role="alert"]', { hasText: 'https y pública' })), 'a private address is refused');
    await shot(page, 'connections-max-desktop');
    // The connection's tools as Roxi sees them.
    const tools = await page.evaluate(async () => (await fetch('/api/roxi/connectors/tools')).json());
    check(Array.isArray(tools.tools) && tools.tools.some((tool) => tool.connection === 'DeepWiki'), 'Roxi can list the connected tools');
    const call = tools.tools.find((tool) => tool.tool === 'read_wiki_structure');
    if (call) {
      const result = await page.evaluate(async (c) => (await fetch('/api/roxi/connectors/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ connection_id: c.connection_id, tool: c.tool, args: { repoName: 'vercel/next.js' } }) })).json(), call);
      check(result.ok === true || result.needsConfirmation === true, 'a tool call goes through (or asks first when it is not read-only)');
    }
    await page.goto(`${BASE}/roxi/connections`);
    await page.locator('.rx-conn', { hasText: 'DeepWiki' }).locator('button:has-text("Quitar")').click();
    await page.waitForURL(/done=removed/, { waitUntil: 'commit' });
    check((await page.locator('.rx-conn').count()) === 0, 'a connection can be removed');
    await page.context().close();
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
