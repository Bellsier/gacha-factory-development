// G1 실제 게임 화면 비교 (배포본, 격리 프로필). 시안은 시험 브라우저 안에서만 tdPlayerSprite를 바꿔 끼움(게임 코드 변경 없음)
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const URL = 'https://bellsier.github.io/gacha-factory-development/';
const OUT = path.join(__dirname, 'out', 'ingame'); fs.mkdirSync(OUT, { recursive: true });
const PROPOSAL = fs.readFileSync(path.join(__dirname, 'site', 'proposal.js'), 'utf8');
const DEV = { pc: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
const log = [];
(async () => {
  for (const device of ['pc', 'mobile']) for (const style of ['classic', 'v2']) for (const art of ['current', 'proposal']) {
    const b = await chromium.launch(); const ctx = await b.newContext(DEV[device]); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    // the same village every time: a fixed random for the new game
    await ctx.addInitScript(() => { let s = 20261101; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; });
    await page.goto(URL + (style === 'v2' ? '?style=v2' : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof TD !== 'undefined' && TD.groundMap && TD.running && TD.sheet, null, { timeout: 90000 });
    await page.evaluate(() => { clearInterval(autoSaveTimer); saveGame = () => false; TD.lightTime = 0; });
    const before = await page.evaluate(() => ({ foot: JSON.stringify(PLAYER_FOOT), speed: BALANCE.world ? BALANCE.world.PLAYER_SPEED : null }));
    if (art === 'proposal') { await page.addScriptTag({ content: PROPOSAL }); await page.evaluate(() => { window.tdPlayerSprite = tdPlayerSpriteG1; TD.sheet = tdBuildSpriteSheet(); }); }
    const after = await page.evaluate(() => ({ foot: JSON.stringify(PLAYER_FOOT), speed: BALANCE.world ? BALANCE.world.PLAYER_SPEED : null, size: TD.sheet.player.down[0].width + 'x' + TD.sheet.player.down[0].height }));
    const tag = `${device}-${style}-${art}`;
    // scene 1: in front of the house, facing down (idle)
    const pos = await page.evaluate(() => { const d = villageDistrictParts(state.village.district); return { house: d.house, base: state.world.base }; });
    const place = (x, y, f) => page.evaluate(([x, y, f]) => { Object.assign(state.world.player, { x, y, facing: f, pose: 'idle' }); TD.tracker = {}; }, [x, y, f]);
    await place(pos.house.x, pos.house.y + 0.5, 'down'); await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, tag + '-house.png') });
    // scene 2: by the workshop, then walk (real keys) and grab frames
    await place(pos.base.x + 1.6, pos.base.y + 1.2, 'down'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, tag + '-workshop.png') });
    const vw = DEV[device].viewport, cx = vw.width / 2, cy = vw.height / 2, z = await page.evaluate(() => TD.view.zoom);
    const clip = { x: cx - 14 * z, y: cy - 24 * z, width: 28 * z, height: 30 * z };
    for (const k of ['s', 'd', 'w', 'a']) {
      await place(pos.base.x + 1.6, pos.base.y + 2.2, 'down'); await page.waitForTimeout(250);
      await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(OUT, `${tag}-idle-${k}.png`), clip });
      await place(pos.base.x + 1.6, pos.base.y + 2.2, 'down'); await page.waitForTimeout(250);
      await page.keyboard.down(k); const seen = new Set();
      for (let i = 0; i < 60 && seen.size < 4; i++) { const f = await page.evaluate(() => topdownWalkFrame(TD.tracker.walked || 0, state.world.player.pose)); if (!seen.has(f)) { seen.add(f); await page.screenshot({ path: path.join(OUT, `${tag}-walk-${k}-f${f}.png`), clip }); } await page.waitForTimeout(12); }
      await page.keyboard.up(k); await page.waitForTimeout(150);
    }
    // speed and collision with the swapped picture: walk 1.5 s right on open ground, then into the workshop wall
    await place(pos.base.x + 1.6, pos.base.y + 2.6, 'right'); await page.waitForTimeout(250);
    const a = await page.evaluate(() => ({ x: state.world.player.x, t: performance.now() })); await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d'); await page.waitForTimeout(100);
    const c = await page.evaluate(() => ({ x: state.world.player.x, t: performance.now() }));
    await place(pos.base.x, pos.base.y + 1.0, 'up'); await page.waitForTimeout(250); await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
    const wall = await page.evaluate(() => ({ y: state.world.player.y, maxY: state.world.base.y + WORLD_OBSTACLE_BOXES.base.maxY, stand: playerCanStand(state.world.player.x, state.world.player.y) }));
    log.push({ tag, before, after, speed: +((c.x - a.x) / ((c.t - a.t - 100) / 1000)).toFixed(2), wall, errors: errs });
    await b.close();
  }
  fs.writeFileSync(path.join(OUT, 'ingame-log.json'), JSON.stringify(log, null, 1));
  log.forEach((l) => console.log(l.tag, 'foot', l.after.foot === l.before.foot ? 'same' : 'CHANGED', 'speedConst', l.after.speed, 'sprite', l.after.size, 'measured', l.speed, 'u/s', 'wallStop', l.wall.y.toFixed(3), '>=', l.wall.maxY.toFixed(2), l.wall.stand, 'errors', l.errors.length));
})().catch((e) => { console.error(e); process.exit(1); });
