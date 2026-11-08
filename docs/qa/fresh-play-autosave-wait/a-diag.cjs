'use strict';
// Issue #32 A diagnosis: does `gold===50` accept a committed autosave that does not yet hold the recruited worker,
// and what does a refresh then load? node a-diag.cjs <repoRoot> <runs>
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const [root, runsArg, mode] = process.argv.slice(2), runs = +runsArg || 5, waitNew = mode === 'wait-new';
const { commitReady } = require(path.join(root, 'tests/playthrough/save-wait.cjs')) // the same predicate fresh-play uses;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
(async () => {
  const server = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = p === '/' ? 'index.html' : p; fs.readFile(path.join(root, f), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {}) }); const out = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.route('https://fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const page = await ctx.newPage();
    await page.goto(url); await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
    await page.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
    const id = await page.evaluate(() => S2Runtime.session.id);
    // preparation fixture: the state fresh-play has after selling 10 steel (50 G, the first ticket)
    await page.evaluate(() => { state.gold = 50; permanent.firstGachaGranted = true; permanent.tickets = Math.max(1, permanent.tickets); renderAll(); });
    // wait for the real autosave timer to commit gold 50 (a revision change), then recruit right after it
    const r0 = await page.evaluate(i => S2Runtime.engine.read(i).then(x => x.revision), id);
    for (let t = Date.now(); ; ) { // bounded poll in node (an async predicate in waitForFunction is always truthy)
      const x = await page.evaluate(i => S2Runtime.engine.read(i), id);
      if (x.revision > r0 && x.snapshot.payload.run.gold === 50) break;
      if (Date.now() - t > 15000) throw new Error('gold 50 was not committed in 15 s');
      await new Promise((r) => setTimeout(r, 30));
    }
    const base = await page.evaluate(i => S2Runtime.engine.read(i), id);
    await page.locator('.tab-btn[data-tab="workers"]').click(); await page.locator('#gachaTicketBtn').click();
    await page.waitForFunction(() => state.characters.length === 1);
    const want = await page.evaluate(([i, rev]) => ({ villageId: i, afterRevision: rev, gold: state.gold, workers: state.characters.length, assignments: state.characters.map(w => w.resource) }), [id, base.revision]);
    const now = await page.evaluate(i => S2Runtime.engine.read(i), id);
    const oldCondition = now.snapshot.payload.run.gold === 50, newCondition = commitReady(now, want);
    let waited = null;
    if (waitNew) { // the fixed wait: a newer commit of this village with the worker (bounded 25 s)
      const t = Date.now();
      for (;;) { const x = commitReady(await page.evaluate(i => S2Runtime.engine.read(i), id), want); if (x.ready) { waited = { ms: Date.now() - t, revision: x.committed.revision }; break; } if (Date.now() - t > 25000) throw new Error('not committed: ' + x.reasons.join(', ')); await new Promise((r) => setTimeout(r, 100)); }
    }
    // refresh (right away with the old wait; after the commit with the new one), then continue the same village
    await page.reload(); await page.waitForFunction(() => GameBootstrap.state === 'ready');
    await page.locator('[data-s2-recent]').click(); await page.waitForFunction(i => S2Runtime.session?.id === i && S2Runtime.canPlay(), id);
    const loadedWorkers = await page.evaluate(() => state.characters.length);
    out.push({ run: i + 1, memoryWorkers: want.workers, committedWorkers: newCondition.committed.workers, committedRevision: now.revision, baseRevision: base.revision, oldConditionPassed: oldCondition, newConditionReady: newCondition.ready, newReasons: newCondition.reasons, workersAfterRefresh: loadedWorkers, waited });
    await ctx.close();
  }
  await b.close(); server.close();
  out.forEach((o) => console.log(JSON.stringify(o)));
})().catch((e) => { console.error(e); process.exit(1); });
