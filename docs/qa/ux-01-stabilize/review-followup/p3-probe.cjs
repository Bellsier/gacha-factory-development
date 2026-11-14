'use strict';
// P3: band/close/scroll across more screens, the log panel, browser zoom and a larger font. node p3-probe.cjs <root>
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const root = process.argv[2];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const CASES = [
  ['320x568', { width: 320, height: 568 }, 1, true], ['390x844', { width: 390, height: 844 }, 1, true], ['844x390', { width: 844, height: 390 }, 1, true],
  ['568x320', { width: 568, height: 320 }, 1, true], ['1280x800', { width: 1280, height: 800 }, 1, false],
  ['1280x800@150%', { width: 853, height: 533 }, 1.5, false], ['1280x800@200%', { width: 640, height: 400 }, 2, false], ['390x844@font125', { width: 390, height: 844 }, 1, true, '125%'], ['1280x800@font125', { width: 1280, height: 800 }, 1, false, '125%'],
];
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = p === '/' ? 'index.html' : p; fs.readFile(path.join(root, f), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [name, viewport, dsf, mobile, font] of CASES) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile }); await ctx.route('https://fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const page = await ctx.newPage(); await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready'); await page.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
    await page.evaluate((f) => { if (f) document.documentElement.style.fontSize = f; state.research.autoCraftDevice = true; Object.assign(state.products, { steel: 5 }); state.gold = 1000; for (let i = 0; i < 60; i++) log('기록 ' + i); renderAll(); }, font || null);
    const res = {};
    for (const panel of ['dev', 'mining', 'village', 'workers', 'delivery', 'research', 'log']) {
      if (panel === 'log') await page.evaluate(() => { tdClosePanels(); document.body.classList.add('td-log-open'); });
      else await page.evaluate((t) => { tdClosePanels(); tdOpenTab(t); }, panel);
      await page.waitForTimeout(100);
      res[panel] = await page.evaluate(async () => {
        const panel = document.querySelector('body.td-log-open #logSection') || document.querySelector('.tab-panel.active'), close = document.getElementById('tdClose');
        const pr = panel.getBoundingClientRect(), cr = close.getBoundingClientRect(), b = getComputedStyle(panel, '::before');
        const head = b.position === 'sticky' ? parseFloat(b.height) : 0;
        let covered = 0, hidden = 0; const sample = [];
        for (let y = 0; ; y += 10) {
          panel.scrollTop = y; await new Promise(requestAnimationFrame);
          for (const el of panel.querySelectorAll('button,summary,input,select,label')) {
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            const top = Math.max(r.top, pr.top + head), bottom = Math.min(r.bottom, pr.bottom);
            if (Math.min(r.right, cr.right) - Math.max(r.left, cr.left) > 0 && Math.min(bottom, cr.bottom) - Math.max(top, cr.top) > 0) { covered++; if (sample.length < 2) sample.push(el.outerHTML.slice(0, 50)); }
          }
          if (y >= panel.scrollHeight - panel.clientHeight) break;
        }
        panel.scrollTop = 0;
        // the close button itself must be reachable: the element at its centre is the button
        const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        return { head: Math.round(head), close: [Math.round(cr.top - pr.top), Math.round(cr.bottom - pr.top)], closeInBand: cr.top >= pr.top - 1 && cr.bottom <= pr.top + head + 1, closeHit: !!hit && (hit === close || close.contains(hit)), covered, sample, clientH: panel.clientHeight };
      });
    }
    const bad = Object.entries(res).filter(([, r]) => r.covered || !r.closeInBand || !r.closeHit);
    console.log(name, bad.length ? 'ISSUES ' + JSON.stringify(Object.fromEntries(bad)) : 'ok', JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, r]) => [k, [r.head, r.close.join('-'), r.clientH]]))));
    await ctx.close();
  }
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
