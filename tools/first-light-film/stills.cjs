const { chromium } = require('playwright');
const path = require('path');
const times = (process.argv[2] || '0.8,4,6.7,9.6,11.2,14.2,16.9,17.9,18.9,21.8,23.6').split(',').map(Number);
(async () => {
  const br = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('PAGEERR', String(e)));
  p.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await p.goto('file://' + path.join(__dirname, 'film', 'index.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.__timelines && window.__timelines.main));
  await p.evaluate(() => document.fonts.ready.then(() => 1));
  for (const t of times) {
    await p.evaluate((x) => { window.__timelines.main.seek(x, false); return 1; }, t);
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(__dirname, 'stills', `t${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 85 });
  }
  console.log('duration', await p.evaluate(() => window.__timelines.main.duration()));
  await br.close();
})();
