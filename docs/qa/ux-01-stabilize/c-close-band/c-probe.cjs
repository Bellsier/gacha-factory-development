'use strict';
// C probe: does the fixed close button (tdClose) cover a panel control at any scroll position?
// node c-probe.cjs <root> <label> [shots-dir]
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const [root, label, shots] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const VP = { pc: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 }, small: { width: 320, height: 568 }, landscape: { width: 844, height: 390 } };
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = p === '/' ? 'index.html' : p; fs.readFile(path.join(root, f), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {}); const out = {};
  for (const [vp, viewport] of Object.entries(VP)) {
    const mobile = vp !== 'pc';
    const ctx = await b.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 }); await ctx.route('https://fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(url); await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
    await page.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
    await page.evaluate(() => { state.research.autoCraftDevice = true; Object.assign(state.products, { steel: 5, coalBrick: 5 }); state.gold = 1000; renderAll(); });
    const res = {};
    for (const tab of ['dev', 'workers', 'delivery', 'village', 'mining']) {
      await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
      if (tab === 'dev') for (const k of ['steel', 'coalBrick']) { const s = page.locator(`[data-recipe-summary="${k}"]`); if (mobile) await s.tap(); else await s.click(); }
      // scroll the open panel step by step; at each step, which controls sit (even partly) under the close button, and
      // does a click at the overlap reach the control or the close button?
      const r = await page.evaluate(async () => {
        const panel = document.querySelector('.tab-panel.active'), close = document.getElementById('tdClose');
        const cs = getComputedStyle(panel), pr = panel.getBoundingClientRect(), cr = close.getBoundingClientRect();
        const hits = new Set(); let worst = 0;
        for (let y = 0; y <= panel.scrollHeight; y += 8) {
          panel.scrollTop = y; await new Promise(requestAnimationFrame);
          for (const el of panel.querySelectorAll('button,summary,input,select,label')) {
            const r0 = el.getBoundingClientRect(); if (!r0.width || !r0.height) continue;
            // only the part of the control a player can see: inside the panel and below its top band (if any)
            const band = getComputedStyle(panel, '::before'), sticky = band.position === 'sticky' ? parseFloat(band.height) : 0;
            const e = { left: r0.left, right: r0.right, top: Math.max(r0.top, pr.top + sticky), bottom: Math.min(r0.bottom, pr.bottom) };
            if (e.bottom <= e.top) continue;
            const ox = Math.min(e.right, cr.right) - Math.max(e.left, cr.left), oy = Math.min(e.bottom, cr.bottom) - Math.max(e.top, cr.top);
            if (ox > 0 && oy > 0) {
              const hit = document.elementFromPoint((Math.max(e.left, cr.left) + Math.min(e.right, cr.right)) / 2, (Math.max(e.top, cr.top) + Math.min(e.bottom, cr.bottom)) / 2);
              if (hit && (hit === close || close.contains(hit))) { hits.add((el.dataset && Object.keys(el.dataset)[0]) || el.tagName); worst = Math.max(worst, ox * oy); }
            }
          }
          if (y > panel.scrollHeight - panel.clientHeight) break;
        }
        panel.scrollTop = 0;
        return { panel: { top: Math.round(pr.top), right: Math.round(pr.right), width: Math.round(pr.width), paddingTop: cs.paddingTop, overflowY: cs.overflowY }, close: { top: Math.round(cr.top), bottom: Math.round(cr.bottom), left: Math.round(cr.left), right: Math.round(cr.right) }, coveredControls: [...hits], worstOverlapPx: Math.round(worst) };
      });
      res[tab] = r;
    }
    if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.locator('.tab-btn[data-tab="dev"]').click(); await page.evaluate(() => { const p = document.querySelector('.tab-panel.active'); const s = document.querySelector('[data-sell="steel"]'); p.scrollTop += s.getBoundingClientRect().top - document.getElementById('tdClose').getBoundingClientRect().top - 8; }); await page.waitForTimeout(200); await page.screenshot({ path: path.join(shots, `${vp}-dev-sell-at-close.png`) }); }
    out[vp] = { tabs: res, errors: errs.length }; await ctx.close();
  }
  await b.close(); server.close();
  for (const [vp, o] of Object.entries(out)) console.log(label, vp, JSON.stringify(Object.fromEntries(Object.entries(o.tabs).map(([t, r]) => [t, { covered: r.coveredControls, worst: r.worstOverlapPx, pad: r.panel.paddingTop, ptop: r.panel.top, close: [r.close.top, r.close.bottom] }]))), 'errors', o.errors);
})().catch((e) => { console.error(e); process.exit(1); });
