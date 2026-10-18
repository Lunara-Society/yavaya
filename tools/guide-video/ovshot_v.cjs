// Renders the overlay HTML files written by overlays.py. Transparent ones keep their alpha.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const jobs = require(__dirname + '/ov_jobs_v.json');
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  for (const j of jobs) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await page.goto('file://' + j.html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: j.png, omitBackground: j.transparent });
  }
  await browser.close();
  console.log('rendered', jobs.length);
})();
