/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run outside the build */
/**
 * Browser check of the First Light as the home page, the worlds behind the
 * district doors, and the owner's switches that undo both:
 *
 *   BASE=http://localhost:3100 node tests/e2e/first-light.cjs
 *
 * With an administrator (LOOKS_ADMIN: the JSON that tests/e2e/roxi-plans-setup.ts
 * prints), it turns each look off in Admin → Diseño del sitio, checks that the
 * previous design is back, and turns it on again:
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-plans-setup.ts > /tmp/plans.json
 *   LOOKS_ADMIN=/tmp/plans.json BASE=http://localhost:3100 node tests/e2e/first-light.cjs
 *
 * With a member (the site run with ROXI_AGENT_ID=agent_localtest), it also
 * checks that the page shows Roxi's real state, against a stand-in for the
 * agent like the panel's own test, so no conversation is held or paid for:
 *
 *   npx tsx --conditions=react-server tests/e2e/roxi-setup.ts > /tmp/roxi.json
 *   BASE=http://localhost:3100 node tests/e2e/first-light.cjs /tmp/roxi.json
 *
 * SHOTS=<dir> keeps screenshots.
 */
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = process.env.SHOTS;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};
const DOORS = ['/mercadito', '/services', '/work', '/yavayago', '/community', '/sanctuary', '/animals'];
const WITH_PEOPLE = new Set(['/mercadito', '/community']);

// Counts audio contexts, so "silent by default" means nothing was even started.
const COUNT_AUDIO = () => {
  const Real = window.AudioContext;
  window.__audioContexts = 0;
  if (Real) {
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        window.__audioContexts += 1;
      }
    };
  }
};

(async () => {
  const browser = await chromium.launch();

  // The page itself, on a phone.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es' });
    await context.addInitScript(COUNT_AUDIO);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      // Google's sign-in (One Tap, where it is configured) reports through the console that a browser
      // with no Google session has no accounts to offer; that is Google's script and Chrome's FedCM, not this page.
      const fromGoogleSignIn = /accounts\.google\.com/.test(message.location().url ?? '') || /GSI_LOGGER|FedCM|identity provider|accounts list is empty/i.test(message.text());
      if (message.type() === 'error' && !fromGoogleSignIn) errors.push(message.text());
    });
    const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check(response && response.status() === 200, 'the home page answers 200');
    check((await page.locator('[data-fl]').count()) === 1, 'the home page is the First Light');
    check(
      (await page.locator('meta[name="robots"][content*="noindex"]').count()) === 0 && !/noindex/.test(response?.headers()['x-robots-tag'] ?? ''),
      'the home page is indexed (no noindex in the meta tag or the header)',
    );
    check((await page.locator('script[type="application/ld+json"]').count()) >= 1, "the home page still tells search engines who Yavaya is (structured data)");
    check((await page.locator('.fl-preview').count()) === 0, 'the home page does not call itself a preview');
    check(await page.locator('h1#fl-title').isVisible(), 'the title is visible');
    check((await page.locator('.fl-g img').count()) === 4, 'the Guardian is drawn in its four layers');
    const hrefs = await page.locator('a[data-fl-door]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    check(JSON.stringify(hrefs) === JSON.stringify(DOORS), `seven doors lead into the seven districts (${hrefs.join(' ')})`);
    check((await page.locator('form.fl-search[action="/mercadito"] input[name="q"]').count()) === 1, "the search is Mercadito's");
    check((await page.locator('.fl-roxi.is-visitor a[href="/login?next=/"]').count()) === 1, 'a visitor is shown the way in to Roxi, and back to the home page');
    const tier = await page.locator('[data-fl]').getAttribute('data-tier');
    check(tier === 'full' || tier === 'lite', `a capable browser is upgraded from the served lite tier (${tier})`);

    const sound = page.locator('button.fl-sound');
    check((await sound.getAttribute('aria-pressed')) === 'false', 'sound is off by default');
    check((await page.evaluate(() => window.__audioContexts)) === 0, 'no audio is started until asked for');
    await sound.click();
    check((await sound.getAttribute('aria-pressed')) === 'true', 'the switch turns sound on');
    check((await page.evaluate(() => window.localStorage.getItem('yavaya.sound'))) === 'on', 'the choice is kept on this device');
    check((await page.evaluate(() => window.__audioContexts)) === 1, 'turning sound on starts one audio context');
    await page.reload({ waitUntil: 'networkidle' });
    check((await page.locator('button.fl-sound').getAttribute('aria-pressed')) === 'true', 'the choice survives a reload');
    await page.locator('button.fl-sound').click();
    check((await page.evaluate(() => window.localStorage.getItem('yavaya.sound'))) === 'off', 'and can be turned off again');

    const cls = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 500);
        }),
    );
    check(cls < 0.1, `layout shift stays under 0.1 (${cls.toFixed(3)})`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fl-phone.png` });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fl-phone-full.png`, fullPage: true });

    // A door opens into its district, and settles onto the world behind it.
    await page.locator('#distritos').scrollIntoViewIfNeeded();
    await page.locator('a[data-fl-door][href="/services"]').click();
    await page.waitForURL(`${BASE}/services`, { timeout: 20_000 });
    const landed = await page
      .waitForSelector('[data-fl-veil="landing"]', { state: 'attached', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    check(landed, "the open door settles onto the district's world");
    await page.waitForSelector('[data-fl-veil]', { state: 'detached', timeout: 8_000 }).catch(() => undefined);
    check((await page.locator('[data-fl-veil]').count()) === 0, 'and then gives way to it');
    const world = await page.locator('[data-dw="services"] img').evaluate((img) => ({
      loaded: img.naturalWidth > 0,
      first: document.querySelector('main#main')?.firstElementChild?.hasAttribute('data-dw') ?? false,
      visible: img.getBoundingClientRect().top < window.innerHeight / 2,
    }));
    check(world.loaded && world.first && world.visible, 'the world is the first thing on the district’s page, in view on arrival');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/world-services-phone.png` });
    check(errors.length === 0, `no errors in the console (${errors.slice(0, 3).join(' | ')})`);
    await context.close();
  }

  // While it is the home page, the preview's address leads there.
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/first-light`, { waitUntil: 'domcontentloaded' });
    check(new URL(page.url()).pathname === '/', `/first-light leads to the home page (${new URL(page.url()).pathname})`);
    await page.close();
  }

  // Asked for less motion: still, and a door still works.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'es' });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check((await page.locator('[data-fl]').getAttribute('data-tier')) === 'still', 'reduced motion gets the still tier');
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    check(moving === 0, `nothing moves (${moving} running animations)`);
    await page.locator('a[data-fl-door][href="/animals"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`${BASE}/animals`, { timeout: 20_000 });
    check(true, 'a door opens from the keyboard');
    await context.close();
  }

  // Every width, without sideways scrolling.
  for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: width < 700 ? 800 : 900 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(fits, `no sideways scroll at ${width}px`);
    if (SHOTS && (width === 1440 || width === 768)) await page.screenshot({ path: `${SHOTS}/fl-${width}.png` });
    await page.close();
  }

  // A member: the page shows what Roxi is really doing, and nothing else.
  if (process.argv[2]) {
    const setup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es' });
    const page = await context.newPage();
    // The agent never answers: the test decides when its connection drops.
    const agent = { sockets: [], asked: false };
    await page.routeWebSocket(/elevenlabs\.io\/v1\/convai\/conversation/, (ws) => {
      agent.sockets.push(ws);
      ws.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'user_message') agent.asked = true;
        if (message.type === 'conversation_initiation_client_data') {
          ws.send(
            JSON.stringify({
              type: 'conversation_initiation_metadata',
              conversation_initiation_metadata_event: { conversation_id: 'conv_fl_e2e', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' },
            }),
          );
        }
      });
    });
    await page.goto(`${BASE}/login`, { timeout: 120_000 });
    await page.fill('input[name="email"]', setup.email);
    await page.fill('input[name="password"]', setup.password);
    await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
    await page.goto(`${BASE}/first-light`, { waitUntil: 'networkidle' });

    const state = () => page.locator('.fl-roxi .fl-orb').getAttribute('data-state');
    const reaches = (wanted) =>
      page
        .waitForFunction((value) => document.querySelector('.fl-roxi .fl-orb')?.getAttribute('data-state') === value, wanted, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
    const call = page.locator('.fl-roxi:not(.is-visitor) button.fl-roxi-go');
    // The button follows the panel a render later: wait for it rather than read it once.
    const offered = (wanted) =>
      page
        .waitForFunction((value) => document.querySelector('.fl-roxi button.fl-roxi-go')?.disabled === !value, wanted, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
    check((await call.count()) === 1 && (await call.isEnabled()), 'a member can call Roxi from the page');
    check((await state()) === 'idle', `she is shown idle while nothing happens (${await state()})`);
    check((await page.locator('.fl-hero .rx-door').count()) === 1, "a member is offered Roxi's doors in the hero");
    check((await page.locator('.fl-closing a[href="/account"]').count()) === 1, 'the closing invitation leads a member to their account');

    await call.click();
    await page.locator('.roxi-panel').waitFor({ timeout: 30_000 });
    check(await offered(false), 'she is not offered twice while her panel is open');
    await page.fill('.roxi-compose input:not([type="file"])', 'Hola Roxi');
    await page.press('.roxi-compose input:not([type="file"])', 'Enter');
    check(await reaches('understanding'), `while the question waits, the page says she is understanding it (${await state()})`);
    // Cut the connection only once the question has really reached the agent.
    for (let tries = 0; tries < 150 && !agent.asked; tries += 1) await page.waitForTimeout(100);
    for (const ws of agent.sockets) await ws.close({ code: 1011, reason: 'Internal error' });
    check(await reaches('error'), `a dropped connection is shown as a problem, not as progress (${await state()})`);
    // Esc tucks the panel away: the problem is still shown, and the page can call her back.
    await page.keyboard.press('Escape');
    await page.locator('.roxi-island').waitFor({ timeout: 15_000 }).catch(() => undefined);
    check((await page.locator('.roxi-island').count()) === 1 && (await offered(true)) && (await state()) === 'error', 'tucked away, the problem still shows and she can be called back');
    await call.click();
    await page.locator('.roxi-panel').waitFor({ timeout: 15_000 }).catch(() => undefined);
    check((await page.locator('.roxi-panel').count()) === 1 && (await offered(false)), 'the call brings her panel back');
    await page.locator('.roxi-panel .roxi-actions button:last-child').click();
    await page.locator('.roxi-panel').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    check((await page.locator('.roxi-panel').count()) === 0 && (await reaches('idle')) && (await offered(true)), 'closing her panel brings her back to idle, ready to be called');
    await context.close();
  }

  // The world behind each door, on every district's front page — and not over search results.
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    for (const path of DOORS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const id = path.slice(1);
      const world = await page.locator(`[data-dw="${id}"]`).count();
      const loaded = world ? await page.locator(`[data-dw="${id}"] img`).evaluate((img) => img.naturalWidth > 0) : false;
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const note = await page.locator(`[data-dw="${id}"] .art-note`).count();
      check(world === 1 && loaded && fits && note === (WITH_PEOPLE.has(path) ? 1 : 0), `${path} opens with its world at ${width}px (loaded, fits${WITH_PEOPLE.has(path) ? ', says "Ilustración"' : ''})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/world-${id}-${width}.png` });
    }
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/mercadito?q=bicicleta`, { waitUntil: 'domcontentloaded' });
    check((await page.locator('[data-dw]').count()) === 0, 'search results open without the world');
    await page.close();
  }

  // The owner's switches: each look can be undone in Admin → Diseño del sitio, and redone.
  if (process.env.LOOKS_ADMIN) {
    const { admin } = JSON.parse(fs.readFileSync(process.env.LOOKS_ADMIN, 'utf8'));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es' });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { timeout: 120_000 });
    await page.fill('input[name="email"]', admin.email);
    await page.fill('input[name="password"]', admin.password);
    await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 }), page.click('form:has(input[name="password"]) button[type="submit"]')]);
    const flip = async (look) => {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await Promise.all([page.waitForURL(/look=saved/, { timeout: 30_000 }), page.locator(`#looks li[data-look="${look}"] button[type="submit"]`).click()]);
      return page.locator(`#looks li[data-look="${look}"]`).getAttribute('data-on');
    };
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    check((await page.locator('#looks li[data-look="home"][data-on="true"]').count()) === 1 && (await page.locator('#looks li[data-look="worlds"][data-on="true"]').count()) === 1, 'Admin shows both looks, on');

    check((await flip('home')) === 'false', 'the owner can go back to the previous home page');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check((await page.locator('.hx-hero').isVisible()) && (await page.locator('[data-fl]').count()) === 0, 'the previous home page is back at once');
    const headerBg = await page.locator('header.top').evaluate((el) => getComputedStyle(el).backgroundColor);
    check(headerBg === 'rgba(0, 0, 0, 0)', `its header still lies over the picture (${headerBg})`);
    const preview = await page.goto(`${BASE}/first-light`, { waitUntil: 'networkidle' });
    check(
      (await page.locator('.fl-preview').isVisible()) && (await page.locator('meta[name="robots"][content*="noindex"]').count()) === 1 && /noindex/.test(preview?.headers()['x-robots-tag'] ?? ''),
      'meanwhile the First Light waits at /first-light, as a preview nobody indexes',
    );
    check((await flip('home')) === 'true', 'and can be the home page again');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check((await page.locator('[data-fl]').count()) === 1, 'the First Light is back at once');

    check((await flip('worlds')) === 'false', 'the owner can remove the worlds');
    await page.goto(`${BASE}/mercadito`, { waitUntil: 'networkidle' });
    check((await page.locator('[data-dw]').count()) === 0 && (await page.locator('.mc-top').count()) === 1, 'the districts are as they were');
    check((await flip('worlds')) === 'true', 'and show them again');
    await page.goto(`${BASE}/mercadito`, { waitUntil: 'networkidle' });
    check((await page.locator('[data-dw="mercadito"]').count()) === 1, 'the worlds are back at once');
    await context.close();
  }

  await browser.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exitCode = failures ? 1 : 0;
})();
