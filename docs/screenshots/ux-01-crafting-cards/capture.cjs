'use strict';
// UX-01 before/after capture. Usage: node capture.cjs <root> <outDir> <label>
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const [root, OUT, label] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const VP = { pc: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 }, small: { width: 320, height: 568 }, landscape: { width: 844, height: 390 } };
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); fs.readFile(path.join(root, p === '/' ? 'index.html' : p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(p === '/' ? 'index.html' : p)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port + '/';
  const log = {};
  for (const [vp, viewport] of Object.entries(VP)) {
    const mobile = vp !== 'pc';
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
    await ctx.addInitScript(() => { let s = 20261107; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url); await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready', null, { timeout: 60000 });
    await page.locator('#s2Open').click(); await page.locator('[data-s2-name]').fill('UX01 ' + vp); await page.locator('[data-s2-new]').click();
    await page.waitForFunction(() => S2Runtime.session && !S2Runtime.transitioning && S2Runtime.canPlay());
    // fixture (state injection for preparation only; identical before/after)
    await page.evaluate(() => {
      const siteOf = (k) => resourceByKey(k).site; state.unlockedSites[siteOf('mana')] = true; state.unlockedSites[siteOf('rareMetal')] = true;
      state.research.autoCraftDevice = true;
      Object.assign(state.resources, { iron: 1, coal: 5, mana: 0, rareMetal: 0 });
      Object.assign(state.products, { steel: 0, coalBrick: 3, alloy: 1, precisionPart: 2, ironTool: 0 });
      state.autoCraft.coalBrick = true; state.craftTarget.coalBrick = 3; state.autoSell.coalBrick = true; state.autoSellOn.coalBrick = false;
      state.craftQueue.ironTool = 1.5; state.gold = 10;
      renderAll();
    });
    await page.locator('.tab-btn[data-tab="dev"]').click(); await page.waitForTimeout(300);
    await page.locator('#recipes').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const measure = () => page.evaluate(() => {
      const lines = (el) => { if (!el) return null; const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))).size; };
      const out = {};
      document.querySelectorAll('#recipes [data-craft-target]').forEach((inp) => {
        const box = inp.closest('[data-target-row]') || inp.closest('label'); let maxLines = 0; const words = [];
        const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        let n; while ((n = w.nextNode())) { if (!n.textContent.trim() || n.parentElement.closest('.recipe-target-help')) continue; const r = document.createRange(); r.selectNodeContents(n); const tops = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))); if (tops.size) { maxLines = Math.max(maxLines, tops.size); words.push(n.textContent.trim() + ':' + tops.size); } }
        out[inp.dataset.craftTarget] = { maxLinesPerPhrase: maxLines, words: words.join('|'), visible: inp.getBoundingClientRect().width > 0 };
      });
      const cards = [...document.querySelectorAll('#recipes .recipe')].map((c) => ({ key: (c.querySelector('[data-stock]') || {}).dataset?.stock, h: Math.round(c.getBoundingClientRect().height), w: Math.round(c.getBoundingClientRect().width) }));
      return { target: out, cards, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${vp}-${name}.png`) }); const el = page.locator('#recipes'); await el.screenshot({ path: path.join(OUT, `${vp}-${name}-cards.png`) }); };
    await shot('1-default'); log[vp] = { default: await measure() };
    // after build only: open the detail of the auto-craft card and the workshop-only card with real input
    const sums = page.locator('#recipes [data-recipe-more="coalBrick"] > summary, #recipes [data-recipe-more="precisionPart"] > summary');
    if (await sums.count()) { for (let i = 0; i < await sums.count(); i++) { const s = sums.nth(i); await s.scrollIntoViewIfNeeded(); if (mobile) await s.tap(); else await s.click(); } await page.waitForTimeout(200); await page.locator('[data-recipe-more="coalBrick"]').scrollIntoViewIfNeeded(); await shot('2-detail-open'); log[vp].open = await measure(); }
    // enough materials: steel becomes craftable
    await page.evaluate(() => { Object.assign(state.resources, { iron: 10, coal: 10 }); updateNumbers(); });
    await page.locator('#recipes').scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await shot('3-craftable');
    log[vp].errors = errs; await b.close();
  }
  server.close(); fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
  for (const [vp, l] of Object.entries(log)) console.log(label, vp, JSON.stringify(l.default.target), 'overflow', l.default.overflow, 'errors', l.errors.length);
})().catch((e) => { console.error(e); process.exit(1); });
