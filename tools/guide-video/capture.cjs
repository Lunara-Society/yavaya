// Real screens of yavaya.lat for the guide: public pages from production, member-only forms
// from the local build (logged in with the local test account). Mobile at 3x for phone frames,
// desktop at 2x for laptop frames. Nothing is filled in: these are the real, empty forms.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PROD = 'https://yavaya.lat';
const LOCAL = 'http://127.0.0.1:3100';
const OUT = __dirname + '/ui/';
const ONLY = process.argv.slice(2);
const SHOTS = [
  // [name, base, path, kind, scrollTo selector or text, needsLogin]
  ['home', PROD, '/', 'desktop', null, false],
  ['home-districts', PROD, '/', 'desktop', 'text=Elige tu distrito', false],
  ['mercadito', PROD, '/mercadito', 'desktop', null, false],
  ['mercadito-about', PROD, '/mercadito/about', 'desktop', 'text=Cómo protegemos cada publicación', false],
  ['mercadito-publish', LOCAL, '/mercadito/publish', 'desktop', null, true],
  ['services', PROD, '/services', 'desktop', null, false],
  ['services-new', LOCAL, '/services/new', 'desktop', null, true],
  ['services-about', PROD, '/services/about', 'desktop', 'text=Para lo que no puede esperar a mañana', false],
  ['work', PROD, '/work', 'desktop', null, false],
  ['work-principles', PROD, '/work', 'desktop', 'text=El pago siempre a la vista', false],
  ['yavayago', PROD, '/yavayago', 'desktop', null, false],
  ['yavayago-trust', PROD, '/yavayago', 'desktop', 'text=Repartidores revisados.', false],
  ['viajes', PROD, '/yavayago/viajes', 'desktop', null, false],
  ['viajes-form', LOCAL, '/yavayago/viajes', 'desktop', '.go-trip-form', true],
  ['viajes-how', PROD, '/yavayago/viajes', 'desktop', '.go-how', false],
  ['community-about', PROD, '/community/about', 'desktop', null, false],
  ['community-new', LOCAL, '/community/new', 'desktop', null, true],
  ['violeta', PROD, '/violeta', 'desktop', null, false],
  ['violeta-protect', PROD, '/violeta', 'desktop', 'text=Cómo te protegemos', false],
  ['sanctuary', PROD, '/sanctuary', 'desktop', null, false],
  ['sanctuary-light', LOCAL, '/sanctuary', 'desktop', '#daily', true],
  ['sanctuary-prayer', LOCAL, '/sanctuary/prayer', 'desktop', null, true],
  ['animals', PROD, '/animals', 'desktop', null, false],
  ['animals-learn', LOCAL, '/animals/learn', 'desktop', null, true],
  ['animals-lost', PROD, '/animals/lost', 'desktop', null, false],
  ['trust', PROD, '/trust', 'desktop', 'text=Cinco niveles, de visitante a élite', false],
  ['tokens', PROD, '/tokens', 'desktop', 'text=Simples. Y seguirán siendo simples.', false],
  ['status', PROD, '/status', 'desktop', null, false],
  ['reputation', PROD, '/reputation', 'desktop', null, false],
];
(async () => {
  const browser = await chromium.launch();
  const ctx = {
    mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-NI' },
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'es-NI' },
  };
  const contexts = {};
  async function getCtx(kind, login) {
    const key = kind + (login ? '-in' : '');
    if (contexts[key]) return contexts[key];
    const c = await browser.newContext({ ...ctx[kind], colorScheme: 'light' });
    // Production goes through Playwright's Node-side fetch, which verifies TLS against the
    // session CA bundle (NODE_EXTRA_CA_CERTS); the browser itself never sees the proxy cert.
    await c.route(/^https:\/\/(www\.)?yavaya\.lat\//, async (route) => {
      try { const resp = await route.fetch(); await route.fulfill({ response: resp }); }
      catch (e) { await route.abort(); }
    });
    if (login) {
      const p = await c.newPage();
      await p.goto(LOCAL + '/login', { waitUntil: 'domcontentloaded' });
      await p.fill('input[name=email]', process.env.CAPTURE_EMAIL); // a test member's account, never a real person's
      await p.fill('input[name=password]', process.env.CAPTURE_PASSWORD);
      await p.press('input[name=password]', 'Enter');
      await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
      await p.close();
    }
    contexts[key] = c;
    return c;
  }
  for (const [name, base, path, kind, target, login] of SHOTS) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try {
      const c = await getCtx(kind, login);
      const p = await c.newPage();
      await p.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(2500);
      // reveal-on-scroll elements: scroll through the page so they settle visible
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await p.addStyleTag({ content: '*{animation-play-state:paused!important} [data-reveal],.reveal{opacity:1!important;transform:none!important} .toast,.live-toast,[class*=toast]{display:none!important}' });
      // Member-only screens come from a local test account: hide the header so its name never shows.
      if (login) await p.addStyleTag({ content: 'body header{display:none!important}' });
      if (name === 'sanctuary-light') { await p.locator('summary', { hasText: 'Elegir' }).first().click().catch(() => {}); await p.waitForTimeout(400); }
      if (target) {
        const el = p.locator(target).first();
        await el.scrollIntoViewIfNeeded({ timeout: 8000 });
        await p.evaluate(() => window.scrollBy(0, -90));
      }
      await p.waitForTimeout(1200);
      await p.screenshot({ path: OUT + name + '.png' });
      console.log('ok', name);
      await p.close();
    } catch (e) {
      console.log('fail', name, String(e).slice(0, 160));
    }
  }
  await browser.close();
})();
