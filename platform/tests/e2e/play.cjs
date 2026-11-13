/**
 * Yavaya Rush played from start to finish by a script, in a real browser
 * (docs/PLAY.md): that the course can be completed with the keys a person
 * has, that a fall puts the player back at a checkpoint, and that the finish
 * shows a time. It reads where things are (the game exposes that, read-only)
 * and presses keys; it cannot move the player any other way.
 *
 * Needs /play open (the owner's switch, or `play.open` in feature_flags):
 *
 *   node tests/e2e/play.cjs [http://127.0.0.1:3000]
 */
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/play`, { waitUntil: 'load' });
  check(await page.waitForSelector('.yp-canvas', { timeout: 20000 }).then(() => true, () => false), 'the game loads and draws');
  // A first visit opens the Character Studio; its main button goes on to the course.
  const studio = await page.waitForSelector('.yp-sheet', { timeout: 5000 }).then(() => true, () => false);
  check(studio, 'a first visit opens the Character Studio');
  if (studio) {
    await page.click('.yp-option >> nth=1');
    await page.click('.yp-primary');
  }
  check(await page.waitForSelector('.yp-hud', { timeout: 8000 }).then(() => true, () => false), 'and goes on to the course');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing is wider than the screen');

  // A fall first: straight off the street into the fountain.
  const fell = await page.evaluate(async () => {
    const host = document.querySelector('.yp-host');
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    key('keydown', 'ArrowUp');
    let furthest = 0;
    const t0 = performance.now();
    // Until the player is suddenly far behind where they had got to, or ten seconds.
    while (performance.now() - t0 < 10000) {
      const s = host.ypState();
      if (s.z < furthest - 5) break;
      furthest = Math.max(furthest, s.z);
      await new Promise((r) => requestAnimationFrame(r));
    }
    key('keyup', 'ArrowUp');
    return { ...host.ypState(), furthest };
  });
  check(fell.furthest > 13 && fell.z < 6 && fell.checkpoint === 0, `a fall puts the player back at the start (got to z ${fell.furthest.toFixed(1)}, back at ${fell.z.toFixed(1)})`);

  const run = await page.evaluate(async () => {
    const host = document.querySelector('.yp-host');
    const held = new Set();
    const hold = (code, on) => {
      if (on === held.has(code)) return;
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }));
      if (on) held.add(code);
      else held.delete(code);
    };
    const tap = () => {
      hold('Space', true);
      setTimeout(() => hold('Space', false), 260);
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR' }));
    // Where each jump should come down: [z, x], x null meaning "wherever the cart is".
    const LANDINGS = [
      [17.9, 0], [23.1, 0.8], [28.3, -0.6], [33.5, 0.7], [38.9, 0],
      [54.6, 0], [57, 0], [59.4, 0], [61.8, 0],
      [77.2, 'a'], [82.6, 'b'], [88.1, 0], [90.9, 0],
    ];
    const STEP_FACES = [53.4, 55.8, 58.2, 60.6];
    const t0 = performance.now();
    let lastJump = 0;
    let aimed = null;
    let before = host.ypState();
    const falls = [];
    return new Promise((done) => {
      const tick = () => {
        const s = host.ypState();
        const now = performance.now();
        if (s.z < before.z - 3 && falls.length < 12) falls.push(`${before.x.toFixed(1)},${before.y.toFixed(1)},${before.z.toFixed(1)}`);
        before = s;
        if (s.finished || now - t0 > 150000) {
          for (const code of [...held]) hold(code, false);
          done({ ...s, falls });
          return;
        }
        const [a, b] = s.carts;
        const from = s.grounded && s.on ? s.on.maxZ - 0.3 : s.z;
        // The landing is chosen on the ground and kept for the whole jump.
        if (s.grounded) {
          const landing = LANDINGS.find(([z]) => z - 0.6 > from) ?? null;
          aimed = landing && landing[0] - s.z < 6 ? landing : null;
        }
        const near = aimed;
        const targetX = !near ? (s.z >= 93.4 && s.z < 116.4 ? -0.9 : 0) : near[1] === 'a' ? a : near[1] === 'b' ? b : near[1];
        let go = true;
        let jump = false;
        let back = false;
        if (s.grounded) {
          const edge = s.on ? s.on.maxZ : Infinity;
          const face = STEP_FACES.find((z) => s.z > z - 0.7 && s.z < z);
          if (face) jump = true;
          else if (near && s.z > edge - 0.45 && s.z < 91.4) {
            // At an edge: line up first, and for a cart wait until it is under the jump.
            const cart = typeof near[1] === 'string';
            if (cart && Math.abs(targetX - s.x) > 0.6) go = false;
            else jump = true;
          }
          // The signs: wait for each to swing clear of the middle.
          s.signs.forEach((x, i) => {
            const z = 42.9 + i * 4;
            if (s.z > z - 1.8 && s.z < z - 0.8 && Math.abs(x - s.x) < 2.2) go = false;
          });
        } else if (near) {
          // Like a person: the thumb stays forward in the air. The course has
          // to catch a running jump, and this checks that it does.
          go = true;
        }
        hold('ArrowUp', go);
        hold('ArrowDown', back);
        // Screen-right is −x: the camera looks along +z.
        // On the ground it only steers as far as what it stands on allows; the rest of the way in the air.
        const room = s.grounded && s.on ? Math.max(0, s.on.w / 2 - 0.6) : Infinity;
        const steerX = s.grounded && s.on ? Math.min(s.on.x + room, Math.max(s.on.x - room, targetX)) : targetX;
        hold('ArrowLeft', s.x < steerX - 0.15);
        hold('ArrowRight', s.x > steerX + 0.15);
        if (jump && now - lastJump > 350) {
          lastJump = now;
          tap();
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  });
  if (!run.finished) console.log('     falls at', run.falls.join(' | '));
  check(run.finished, `the course can be finished with the keys (reached z ${run.z.toFixed(1)}, checkpoint ${run.checkpoint})`);
  check(run.elapsed > 16 && run.elapsed < 140, `in a believable time (${run.elapsed.toFixed(1)} s)`);
  check(run.collected >= 3, `collecting coins on the way (${run.collected})`);
  const panel = await page.evaluate(() => ({ shown: !document.querySelector('.yp-panel').hidden, time: document.querySelector('.yp-panel-time').textContent, best: document.querySelector('.yp-best').textContent }));
  check(panel.shown && /\d:\d\d\.\d\d/.test(panel.time), `the finish shows the time (${panel.time})`);
  check(panel.best.length > 0, `and keeps it as the best (${panel.best})`);
  await page.screenshot({ path: process.env.PLAY_SHOT ?? '/dev/null' }).catch(() => {});
  await page.click('.yp-again');
  const again = await page.evaluate(() => document.querySelector('.yp-host').ypState());
  check(!again.finished && again.z < 4 && again.collected === 0, '"Jugar otra vez" starts a fresh run');
  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
