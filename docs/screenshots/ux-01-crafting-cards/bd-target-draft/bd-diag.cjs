'use strict';
// B/D before/after measurement: node bd-diag.cjs <root> <label>
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const [root, label] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = p === '/' ? 'index.html' : p; fs.readFile(path.join(root, f), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.route('https://fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/'); await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
  await page.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
  await page.evaluate(() => { state.research.autoCraftDevice = true; Object.assign(state.resources, { iron: 40, coal: 20 }); state.products.steel = 7; state.craftTarget.steel = 7; state.autoCraft.steel = true; renderAll(); });
  await page.locator('.tab-btn[data-tab="dev"]').click(); await page.locator('[data-recipe-summary="steel"]').click();
  const f = '[data-craft-target="steel"]', out = { label };
  await page.locator(f).click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('1e');
  out.before = await page.evaluate((s) => ({ target: state.craftTarget.steel, bad: document.querySelector(s).validity.badInput }), f);
  await page.evaluate(() => renderAll());
  out.afterRebuild = await page.evaluate((s) => { const el = document.querySelector(s); return { target: state.craftTarget.steel || 0, bad: el.validity.badInput, focused: el === document.activeElement }; }, f);
  await page.waitForTimeout(2000); out.steelAfter2s = await page.evaluate(() => state.products.steel);
  await page.evaluate(() => { state.autoCraft.steel = false; });
  const cdp = await ctx.newCDPSession(page);
  for (const withRebuild of [false, true]) {
    await page.evaluate(() => { state.craftTarget.steel = 0; renderAll(); });
    await page.locator(f).click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
    await cdp.send('Input.imeSetComposition', { text: '12', selectionStart: 2, selectionEnd: 2 });
    if (withRebuild) await page.evaluate(() => renderAll());
    await cdp.send('Input.imeSetComposition', { text: '123', selectionStart: 3, selectionEnd: 3 }); await cdp.send('Input.insertText', { text: '123' });
    out[withRebuild ? 'compositionRebuild' : 'compositionControl'] = await page.evaluate((s) => document.querySelector(s).value, f);
    await page.keyboard.press('Tab');
  }
  out.pageErrors = errs.length; console.log(JSON.stringify(out)); await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
