/**
 * The "Distritos en 3D" look in a real browser (docs/DISTRICTS-3D.md): that a
 * capable device gets it, that every other device keeps the classic cards,
 * and that it responds to a mouse, a finger's scroll and a leaning phone.
 *
 * Needs the classic home page with the look on (the defaults, with
 * look.first_light_home off):
 *
 *   node tests/e2e/depth.cjs [http://127.0.0.1:3000]
 *
 * Headless Chromium draws WebGL in software, which the engine refuses where
 * the browser admits it (photo.ts); "with WebGL" below lets it through to
 * exercise the shader, and "no WebGL" takes it away to exercise level 1.
 */
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';

const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};
const phone = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent };
const allowSoftwareWebgl = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (attrs && typeof attrs === 'object') delete attrs.failIfMajorPerformanceCaveat;
    return original.call(this, type, attrs);
  };
};
const noWebgl = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    return type === 'webgl' ? null : original.call(this, type, attrs);
  };
};
const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('#distritos');
    return {
      depth: root.getAttribute('data-depth'),
      level: root.getAttribute('data-depth-level'),
      medals: document.querySelectorAll('.dz-medalled').length,
      drawn: document.querySelectorAll('.dz-photo.is-on').length,
      added: document.querySelectorAll('.dz-photo, .dz-medal, .dz-glare, style[data-depth-styles]').length,
      wide: document.documentElement.scrollWidth > window.innerWidth,
      links: [...document.querySelectorAll('.hx-cards a.hx-card-link')].map((a) => a.getAttribute('href')).join(','),
    };
  });
const started = (page) => page.waitForFunction(() => document.querySelector('#distritos')?.getAttribute('data-depth') === 'on', null, { timeout: 15000 }).then(() => true, () => false);
const toCard = (page, id) =>
  page.evaluate((key) => {
    const r = document.querySelector(`li[data-district="${key}"]`).getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY - (window.innerHeight - r.height) / 2, behavior: 'instant' });
  }, id);

async function open(browser, options, init) {
  const context = await browser.newContext(options);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  return { context, page, errors };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // A phone, with WebGL.
  {
    const { context, page, errors } = await open(browser, phone, allowSoftwareWebgl);
    const before = await state(page);
    check(await started(page), 'phone: the depth starts after the page has loaded');
    await toCard(page, 'hogar');
    await page.waitForTimeout(1800);
    const s = await state(page);
    check(s.level === '2', `phone: level 2 with WebGL (${s.level})`);
    check(s.medals >= 3 && s.drawn >= 2, `phone: medallions and photographs in depth near the screen (${s.medals}, ${s.drawn})`);
    check(!s.wide, 'phone: the page is no wider than the screen');
    check(s.links === before.links && s.links.split(',').length === 13, 'phone: the thirteen links are the same as before it started');
    const lean = async (gamma) => {
      for (let i = 0; i <= 10; i += 1) {
        await page.evaluate((g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 45, gamma: g })), (gamma * i) / 10);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(700);
    };
    /*
     * The slide eases in and then fades as the new way of holding the phone
     * becomes "level", so it is its peak that is measured, frame by frame, in
     * the page. A headless browser sometimes draws nothing for a second or
     * two after a jump of the scroll, hence three leans and the best of them.
     */
    const peak = await page.evaluate(async () => {
      const emblem = document.querySelector('li[data-district="hogar"] .hx-emblem');
      const wait = (ms) => new Promise((done) => setTimeout(done, ms));
      const fire = (gamma) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 45, gamma }));
      let best = 0;
      let watching = true;
      const watch = () => {
        best = Math.max(best, Number(emblem.style.getPropertyValue('--mx')));
        if (watching) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      for (let round = 0; round < 3; round += 1) {
        for (let i = 0; i <= 10; i += 1) (fire(0), await wait(40));
        await wait(1500);
        for (let i = 0; i <= 10; i += 1) (fire((13 * i) / 10), await wait(40));
        await wait(1500);
      }
      watching = false;
      return best;
    });
    check(peak > 1.5, `phone: leaning its right edge away slides the medallion right (${peak}px at most)`);
    const pixels = () => page.evaluate(() => {
      const c = document.querySelector('li[data-district="hogar"] canvas.dz-photo');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 97) sum = (sum * 31 + d[i]) % 2147483647;
      return sum;
    });
    const a = await pixels();
    await lean(-13);
    check((await pixels()) !== a, 'phone: the photograph is drawn differently from the other side');
    check(errors.length === 0, `phone: no errors in the console (${errors.join(' | ')})`);
    await context.close();
  }

  // The same phone without WebGL: the photograph slides whole behind its frame.
  {
    const { context, page, errors } = await open(browser, phone, noWebgl);
    check(await started(page), 'no WebGL: the depth still starts');
    await toCard(page, 'salud');
    await page.waitForTimeout(1500);
    const s = await state(page);
    check(s.level === '1' && s.drawn === 0 && s.medals >= 3, `no WebGL: level 1, medallions but no canvases (${s.level}, ${s.drawn}, ${s.medals})`);
    check(errors.length === 0, 'no WebGL: no errors in the console');
    await context.close();
  }

  // Less motion, Data Saver, a small phone, and a phone that struggled earlier: the classic cards, nothing added.
  for (const [name, options, init] of [
    ['less motion', { ...phone, reducedMotion: 'reduce' }, null],
    ['Data Saver', phone, () => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } })],
    ['2 GB of memory', phone, () => Object.defineProperty(navigator, 'deviceMemory', { value: 2 })],
    ['a slow visit remembered', phone, () => window.sessionStorage.setItem('yavaya.depth', '0')],
  ]) {
    const { context, page } = await open(browser, options, init);
    await page.waitForTimeout(3500);
    const s = await state(page);
    check(s.depth === '' && s.added === 0, `${name}: the classic cards, nothing added (${s.depth}, ${s.added})`);
    await context.close();
  }

  // A computer with a mouse.
  {
    const { context, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, allowSoftwareWebgl);
    check(await started(page), 'computer: the depth starts');
    await toCard(page, 'services');
    await page.waitForTimeout(1200);
    const box = await page.locator('li[data-district="services"]').boundingBox();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 8 });
    await page.waitForTimeout(900);
    const turn = await page.evaluate(() => {
      const l = document.querySelector('li[data-district="services"] .hx-card-link');
      return { rx: Number(l.style.getPropertyValue('--rx')), ry: Number(l.style.getPropertyValue('--ry')) };
    });
    check(turn.ry > 2 && turn.rx > 1, `computer: the card turns toward the pointer (${turn.rx}°, ${turn.ry}°)`);
    await page.mouse.move(5, 5);
    const rested = await page.waitForFunction(() => Math.abs(Number(document.querySelector('li[data-district="services"] .hx-card-link').style.getPropertyValue('--ry'))) < 0.2, null, { timeout: 6000 }).then(() => true, () => false);
    check(rested, 'computer: and comes back to rest');
    const top = await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return { hero: Boolean(document.querySelector('canvas.dz-hero')), sound: document.querySelector('[data-dz-sound]')?.hasAttribute('hidden') === false && document.querySelector('.dz-sound')?.getAttribute('aria-pressed') };
    });
    check(top.hero, "computer: the home page's first picture has its canvas");
    check(top.sound === 'true', `computer: the sound switch is shown, and on (${top.sound})`);
    await toCard(page, 'services');
    await page.click('li[data-district="services"] a');
    const veiled = await page.waitForSelector('[data-dz-veil]', { state: 'attached', timeout: 1500 }).then(() => true, () => false);
    await page.waitForURL((u) => u.pathname === '/services');
    check(veiled, "computer: a click opens the card's picture into the screen");
    check(true, 'computer: and still opens the district');
    const cleared = await page.waitForSelector('[data-dz-veil]', { state: 'detached', timeout: 6000 }).then(() => true, () => false);
    check(cleared, 'computer: the picture gives way to the district');
    await page.goBack();
    check(await started(page), 'computer: back on the home page, the depth starts again');
    check(errors.length === 0, `computer: no errors in the console (${errors.join(' | ')})`);
    await context.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
