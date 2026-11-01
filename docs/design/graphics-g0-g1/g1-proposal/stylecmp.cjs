// classic vs ?style=v2: 같은 마을·위치에서 화면 갱신 속도, 프레임 그리기 시간, 스프라이트 준비 시간 (배포본, 격리 프로필)
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const URL = 'https://bellsier.github.io/gacha-factory-development/';
const DEV = { pc: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, laptop150: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 } };
const out = [];
(async () => {
  for (const [dev, rate] of [['pc', 1], ['laptop150', 1], ['mobile', 1], ['mobile', 4]]) for (const style of ['classic', 'v2']) for (let rep = 0; rep < 2; rep++) {
    const b = await chromium.launch(); const ctx = await b.newContext(DEV[dev]); const page = await ctx.newPage();
    await ctx.addInitScript(() => { let s = 20261101; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; });
    const cdp = await ctx.newCDPSession(page); if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.goto(URL + (style === 'v2' ? '?style=v2' : '')); await page.waitForFunction(() => typeof TD !== 'undefined' && TD.groundMap && TD.running && TD.sheet, null, { timeout: 120000 });
    await page.evaluate(() => { clearInterval(autoSaveTimer); saveGame = () => false; const d = villageDistrictParts(state.village.district); Object.assign(state.world.player, { x: d.house.x, y: d.house.y + 1.5 }); });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => new Promise((res) => {
      const t0 = performance.now(); const sheetMs = (() => { const a = performance.now(); tdBuildSpriteSheet(); return performance.now() - a; })();
      const orig = tdRender; const times = []; window.tdRender = function () { const a = performance.now(); const v = orig.apply(this, arguments); times.push(performance.now() - a); return v; };
      let n = 0; const start = performance.now(); const f = () => { n++; if (performance.now() - start < 6000) requestAnimationFrame(f); else { window.tdRender = orig; times.sort((a, b) => a - b); res({ fps: +(n / 6).toFixed(1), renderP50: +times[Math.floor(times.length / 2)].toFixed(2), renderP95: +times[Math.floor(times.length * 0.95)].toFixed(2), sheetMs: +sheetMs.toFixed(1), div: TD.view.div, zoom: TD.view.zoom, dpr: TD.view.dpr }); } }; requestAnimationFrame(f); }));
    out.push({ dev, rate, style, rep, ...r }); console.log(dev, 'x' + rate, style, rep, JSON.stringify(r));
    await b.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'stylecmp.json'), JSON.stringify(out, null, 1));
})();
