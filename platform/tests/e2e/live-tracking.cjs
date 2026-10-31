/**
 * Live tracking, end to end, in a real browser against a running local site.
 *
 * A driver's phone reports its position (the browser's geolocation, set by
 * the test) from the driver page; the position goes through the backend; the
 * customer sees it on the live map. Then: nobody else can see it, a lost
 * connection is said and recovered from, an old point is shown as old, a
 * finished delivery stops tracking, and the public demonstration sends
 * nothing anywhere.
 *
 *   npm run dev                                            (another terminal)
 *   npx tsx --conditions=react-server tests/e2e/tracking-setup.ts > /tmp/order.json
 *   node tests/e2e/live-tracking.cjs /tmp/order.json
 *
 * Needs Playwright with Chromium (`require('playwright')`), which this
 * repository does not install; and psql, to age a position and count rows.
 * Local databases only: tracking-setup refuses anything else.
 */
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const setup = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const DATABASE_URL = process.env.DATABASE_URL ?? readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1];
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};
/** A wait that ran out is not a failure by itself (the check after it says what was seen); it is said, not swallowed. */
const gaveUp = (error) => console.log(`  (stopped waiting: ${String(error?.message ?? error).split('\n')[0]})`);
const sql = (query) => execFileSync('psql', [DATABASE_URL, '-At', '-c', query], { encoding: 'utf8' }).trim();

async function signIn(context, who) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { timeout: 120_000 });
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
  return page;
}

/**
 * The order's tracking as the customer's page reads it, read again every
 * second until `done` or the time is up. (Not page.waitForFunction: it does
 * not wait for a promise, and a promise is truthy, so an async check there
 * passes at once without having waited for anything.)
 */
async function trackingUntil(page, done, timeoutMs) {
  const url = `/api/go/orders/${setup.orderId}/tracking`;
  const end = Date.now() + timeoutMs;
  for (;;) {
    const seen = await page.evaluate(async (address) => (await fetch(address, { cache: 'no-store' })).json(), url);
    if (done(seen) || Date.now() > end) return seen;
    await page.waitForTimeout(1000);
  }
}

const ownText = (page) => page.locator('.lm-own').innerText().catch(() => '');

(async () => {
  const browser = await chromium.launch();
  const near = { latitude: setup.store.latitude + 0.001, longitude: setup.store.longitude + 0.001 };

  // --- The driver's phone shares its position from the driver page ---------------------------
  const driverContext = await browser.newContext({ permissions: ['geolocation'], geolocation: near, viewport: { width: 390, height: 844 } });
  const driver = await signIn(driverContext, setup.driver);
  const firstReport = driver.waitForResponse((r) => r.url().endsWith('/api/go/position') && r.request().method() === 'POST', { timeout: 60_000 });
  await driver.goto(`${BASE}/yavayago/driver`);
  const report = await firstReport.catch(() => null);
  // What was sent, not the reply: the page reads only the status, and Chromium
  // reports a request finished only once its body is read, so asking
  // Playwright for that body waits forever.
  check('the driver page reports the phone position to the server', report?.status() === 200, report ? report.request().postDataJSON() : 'no report');
  const stored = sql(`select latitude || ',' || longitude from go_tracking where order_id = '${setup.orderId}'`);
  check('the position is stored for that order only', stored === `${near.latitude},${near.longitude}`, stored);

  // --- The customer sees it on the live map ---------------------------------------------------
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customer = await signIn(customerContext, setup.customer);
  await customer.goto(`${BASE}/yavayago/mapa`);
  await customer.waitForFunction(() => /En vivo/.test(document.querySelector('.lm-own')?.textContent ?? ''), null, { timeout: 30_000 }).catch(gaveUp);
  check('the customer’s live map shows their order with a live position', /Tu pedido #/.test(await ownText(customer)) && /En vivo/.test(await ownText(customer)), await ownText(customer));
  check('the driver’s marker is on the customer’s map, not marked old', (await customer.locator('.go-pin-driver:not(.stale):not(.is-demo)').count()) === 1);
  const seen = await customer.evaluate(async (url) => (await fetch(url, { cache: 'no-store' })).json(), `/api/go/orders/${setup.orderId}/tracking`);
  check('what the customer’s map reads is the point the phone sent', seen.driver?.latitude === near.latitude && seen.driver?.longitude === near.longitude, seen.driver);

  // The driver drives on and stops: the phone reports twice in a moment, then
  // nothing more, as a phone standing still does. The second point comes too
  // soon after the first to be sent at once; it must arrive later, not be
  // dropped (it used to be, leaving the customer looking at where the driver
  // had been).
  const passing = { latitude: near.latitude - 0.002, longitude: near.longitude + 0.001 };
  const moved = { latitude: near.latitude - 0.003, longitude: near.longitude + 0.002 };
  await driverContext.setGeolocation(passing);
  await driver.waitForTimeout(300);
  await driverContext.setGeolocation(moved);
  const after = await trackingUntil(customer, (seen) => seen.driver?.latitude === moved.latitude, 30_000);
  check('the phone’s latest position replaces the old one, even when it came too soon to send at once', after.driver?.latitude === moved.latitude, after.driver);

  // --- Nobody else can follow it --------------------------------------------------------------
  const strangerContext = await browser.newContext();
  const stranger = await signIn(strangerContext, setup.stranger);
  const strangerStatus = await stranger.evaluate(async (url) => (await fetch(url, { cache: 'no-store' })).status, `/api/go/orders/${setup.orderId}/tracking`);
  check('another member gets nothing (404) from the order’s tracking', strangerStatus === 404, strangerStatus);
  await stranger.goto(`${BASE}/yavayago/mapa`);
  check('another member’s live map shows no delivery of theirs and no driver', (await stranger.locator('.lm-own').count()) === 0 && (await stranger.locator('.go-pin-driver').count()) === 0);
  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto(`${BASE}/yavayago/mapa`);
  const anonymousStatus = await anonymous.evaluate(async (url) => (await fetch(url, { cache: 'no-store' })).status, `/api/go/orders/${setup.orderId}/tracking`);
  check('someone signed out gets 401 from the order’s tracking', anonymousStatus === 401, anonymousStatus);
  const publicSummary = await anonymous.evaluate(async () => (await fetch('/api/go/live-map', { cache: 'no-store' })).json());
  const publicText = JSON.stringify(publicSummary);
  check('the public map counts the delivery', publicSummary.activeDeliveries >= 1, publicSummary.activeDeliveries);
  check('the public map never carries the driver’s or the customer’s position', ![near.latitude, near.longitude, passing.latitude, passing.longitude, moved.latitude, moved.longitude, setup.dropoff.latitude, setup.dropoff.longitude].some((v) => publicText.includes(String(v))));

  // --- A lost connection is said, and recovered from ---------------------------------------------
  await customerContext.setOffline(true);
  await customer.waitForFunction(() => /Sin conexión/.test(document.querySelector('.lm-own')?.textContent ?? ''), null, { timeout: 20_000 }).catch(gaveUp);
  check('offline, the customer’s map says tracking is not being refreshed', /Sin conexión/.test(await ownText(customer)), await ownText(customer));
  await customerContext.setOffline(false);
  await customer.waitForFunction(() => /En vivo/.test(document.querySelector('.lm-own')?.textContent ?? ''), null, { timeout: 20_000 }).catch(gaveUp);
  check('back online, it recovers by itself', /En vivo/.test(await ownText(customer)), await ownText(customer));

  // --- An old point is shown as old --------------------------------------------------------------
  await driver.close();
  sql(`update go_tracking set recorded_at = now() - interval '5 minutes' where order_id = '${setup.orderId}'`);
  await customer.waitForFunction(() => /puede no ser la actual/.test(document.querySelector('.lm-own')?.textContent ?? ''), null, { timeout: 20_000 }).catch(gaveUp);
  check('a position five minutes old is labelled as possibly not current', /puede no ser la actual/.test(await ownText(customer)), await ownText(customer));
  check('and its marker is drawn as old', (await customer.locator('.go-pin-driver.stale').count()) === 1);

  // --- A finished delivery stops tracking ----------------------------------------------------------
  execFileSync('npx', ['tsx', '--conditions=react-server', join(__dirname, 'tracking-setup.ts'), 'finish', setup.orderId, setup.driver.userId, setup.owner.userId], { cwd: join(__dirname, '..', '..'), encoding: 'utf8' });
  await customer.waitForFunction(() => /Terminó/.test(document.querySelector('.lm-own')?.textContent ?? ''), null, { timeout: 20_000 }).catch(gaveUp);
  check('once delivered, the map says tracking stopped', /Terminó/.test(await ownText(customer)), await ownText(customer));
  check('and the last position is deleted', sql(`select count(*) from go_tracking where order_id = '${setup.orderId}'`) === '0');

  // --- The demonstration sends nothing anywhere ------------------------------------------------------
  const tables = ['go_orders', 'go_trips', 'go_tracking', 'go_trip_tracking', 'go_drivers', 'go_stores'];
  const countRows = () => Object.fromEntries(tables.map((table) => [table, sql(`select count(*) from ${table}`)]));
  const before = countRows();
  const demoContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const demo = await demoContext.newPage();
  const requests = [];
  demo.on('request', (request) => requests.push({ method: request.method(), url: request.url().replace(BASE, '') }));
  await demo.goto(`${BASE}/yavayago/mapa?demo=1`);
  await demo.waitForFunction(() => /Entregado/.test(document.querySelector('.lm-demo h2')?.textContent ?? ''), null, { timeout: 120_000 }).catch(gaveUp);
  check('the demonstration plays to the end', /Entregado/.test(await demo.locator('.lm-demo h2').innerText()), await demo.locator('.lm-demo h2').innerText());
  check('it is labelled as simulated the whole time', (await demo.locator('.lm-demo-banner').innerText()).includes('DATOS SIMULADOS'));
  // Page views are counted for every page (POST /api/metrics); nothing else may be sent.
  const writes = requests.filter((r) => r.method !== 'GET' && !r.url.startsWith('/api/metrics'));
  const goCalls = requests.filter((r) => r.url.startsWith('/api/go/') && !r.url.startsWith('/api/go/live-map'));
  check('it sent nothing but page loads, map tiles and the public summary', writes.length === 0 && goCalls.length === 0, { writes, goCalls });
  check('no YavayaGo table changed while it played', JSON.stringify(countRows()) === JSON.stringify(before), { before, after: countRows() });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? `ALL ${results.length} PASSED` : `${failed.length} OF ${results.length} FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
