const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const p = await br.newPage();
  p.on('pageerror', (e) => console.error('PAGEERR', String(e)));
  await p.goto('file://' + path.join(__dirname, 'score.html'));
  const { wav, peak } = await p.evaluate(() => renderScore());
  fs.writeFileSync(path.join(__dirname, 'score.wav'), Buffer.from(wav, 'base64'));
  console.log('peak', peak.toFixed(3));
  await br.close();
})();
