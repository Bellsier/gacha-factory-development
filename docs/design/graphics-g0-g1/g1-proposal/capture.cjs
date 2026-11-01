// 비교 화면을 열어 PNG로 저장하고 수치를 출력 (scratch)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('../t21/lib.cjs');
(async () => {
  const srv = await serve(path.join(__dirname, 'site')); const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(srv.url + '/compare.html' + (process.argv[2] ? '?scale=' + process.argv[2] : '')); await p.waitForTimeout(800);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const grids = await p.$$('.sheet'); const names = ['down', 'up', 'right', 'left'];
  for (let i = 0; i < grids.length; i++) await grids[i].screenshot({ path: path.join(__dirname, 'out', 'sheet-' + names[i] + '.png') });
  await p.screenshot({ path: path.join(__dirname, 'out', 'compare-full.png'), fullPage: true });
  const m = await p.evaluate(() => window.__metrics);
  fs.writeFileSync(path.join(__dirname, 'out', 'metrics.json'), JSON.stringify(m, null, 1));
  for (const [label, byDir] of Object.entries(m)) console.log(label, Object.entries(byDir).map(([d, v]) => d + ':' + v.size + ' top' + v.top + ' bot' + v.bottom + ' diff[' + v.frameDiff + '] legs' + v.legRunsIdle).join(' | '));
  console.log('errors', errs); await b.close(); srv.close();
})();
