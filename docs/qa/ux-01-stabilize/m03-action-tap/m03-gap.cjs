'use strict';
// Is a tap right after a stick drag turned into a click? node m03-gap.cjs <root>
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const root = process.argv[2];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = p === '/' ? 'index.html' : p; fs.readFile(path.join(root, f), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await ctx.route('https://fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready'); await page.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
  await page.evaluate(() => { window.__clicks = 0; const f = tdInteractNow; window.tdInteractNow = (...a) => { window.__clicks++; return f(...a); };
    // a spot with nothing to act on, so the action button only counts clicks (diagnostic preparation)
    const b = state.world.base; for (let r = 3; r < 12; r += 0.5) { const x = b.x + r, y = b.y + r; if (playerCanStand(x, y) && !tdInteractTarget(x, y)) { Object.assign(state.world.player, { x, y }); window.__spot = { x, y }; break; } } });
  const stick = await page.locator('#tdStick').boundingBox(), c = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  const result = {};
  for (const [hold, gap] of [[0, 0], [0, 130], [0, 300], [0, 600], [60, 0], [60, 130]]) {
    let ok = 0; const n = 20;
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => { tdClosePanels(); Object.assign(state.world.player, window.__spot); });
      const s = await ctx.newCDPSession(page); // the same way navigation.cjs holdDirection drives the stick
      await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...c, id: 1 }] });
      await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + (i % 2 ? 40 : -40), y: c.y, id: 1 }] });
      if (hold) await page.waitForTimeout(hold);
      await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await s.detach();
      if (gap) await page.waitForTimeout(gap);
      const before = await page.evaluate(() => window.__clicks);
      await page.locator('#tdAction').tap();
      await page.waitForTimeout(400);
      const n2 = await page.evaluate(() => window.__clicks) - before; if (n2 === 1) ok++; else if (n2 > 1) (result.double = (result.double || 0) + 1);
      await page.waitForTimeout(500);
    }
    result['hold' + hold + '_gap' + gap] = ok + '/' + n;
  }
  console.log(JSON.stringify({ root, ...result })); await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
