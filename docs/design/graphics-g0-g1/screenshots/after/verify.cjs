'use strict';
// G1 integration check: before (develop worktree) vs after (branch), same seed, same places, same screens.
const path = require('path'), fs = require('fs');
const { serve } = require("../t21/lib.cjs") /* scratch helper: serve() = a static file server */;
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const ROOTS = { before: path.join(__dirname, 'before'), after: '/home/user/gacha-factory-development' };
const DEV = { pc: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
const log = [];
(async () => {
  const srv = { before: await serve(ROOTS.before), after: await serve(ROOTS.after) };
  let savedBefore = null;
  for (const device of ['pc', 'mobile']) for (const style of ['classic', 'v2']) for (const build of ['before', 'after']) {
    const b = await chromium.launch(); const ctx = await b.newContext(DEV[device]); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await ctx.addInitScript(() => { let s = 20261101; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; });
    await page.goto(srv[build].url + '/' + (style === 'v2' ? '?style=v2' : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof TD !== 'undefined' && TD.groundMap && TD.running && TD.sheet, null, { timeout: 120000 });
    await page.evaluate(() => { clearInterval(autoSaveTimer); TD.lightTime = 0; });
    const consts = await page.evaluate(() => ({ foot: JSON.stringify(PLAYER_FOOT), speed: BALANCE.world.PLAYER_SPEED, size: TD.sheet.player.down[0].width + 'x' + TD.sheet.player.down[0].height }));
    const tag = `${device}-${style}-${build}`;
    const pos = await page.evaluate(() => { const d = villageDistrictParts(state.village.district); return { house: d.house, base: state.world.base }; });
    const place = (x, y, f) => page.evaluate(([x, y, f]) => { Object.assign(state.world.player, { x, y, facing: f, pose: 'idle' }); TD.tracker = {}; }, [x, y, f]);
    const vw = DEV[device].viewport, z = await page.evaluate(() => TD.view.zoom), clip = { x: vw.width / 2 - 14 * z, y: vw.height / 2 - 24 * z, width: 28 * z, height: 30 * z };
    // scenes
    await place(pos.house.x, pos.house.y + 0.5, 'down'); await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, tag + '-house.png') });
    await place(pos.base.x + 1.6, pos.base.y + 1.2, 'right'); await page.waitForTimeout(600); await page.screenshot({ path: path.join(OUT, tag + '-workshop.png') });
    // four directions: idle and walk frames, real keys
    const frames = {};
    for (const k of ['s', 'd', 'w', 'a']) {
      await place(pos.base.x + 1.6, pos.base.y + 2.2, 'down'); await page.waitForTimeout(250);
      await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(350);
      const facing = await page.evaluate(() => state.world.player.facing);
      await page.screenshot({ path: path.join(OUT, `${tag}-idle-${k}.png`), clip });
      await place(pos.base.x + 1.6, pos.base.y + 2.2, 'down'); await page.waitForTimeout(250);
      await page.keyboard.down(k); const seen = new Set();
      for (let i = 0; i < 80 && seen.size < 4; i++) { const f = await page.evaluate(() => topdownWalkFrame(TD.tracker.walked || 0, state.world.player.pose)); if (!seen.has(f)) { seen.add(f); await page.screenshot({ path: path.join(OUT, `${tag}-walk-${k}-f${f}.png`), clip }); } await page.waitForTimeout(10); }
      await page.keyboard.up(k); await page.waitForTimeout(150);
      frames[k] = { facing, seen: [...seen].sort().join('') };
    }
    // speed on open ground
    await place(pos.base.x + 1.6, pos.base.y + 2.6, 'right'); await page.waitForTimeout(250);
    const a = await page.evaluate(() => ({ x: state.world.player.x, t: performance.now() })); await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d'); await page.waitForTimeout(100);
    const c = await page.evaluate(() => ({ x: state.world.player.x, t: performance.now() }));
    // building wall: walk up into the workshop
    await place(pos.base.x, pos.base.y + 1.0, 'up'); await page.waitForTimeout(250); await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
    const wall = await page.evaluate(() => ({ y: +state.world.player.y.toFixed(4), stand: playerCanStand(state.world.player.x, state.world.player.y) }));
    // terrain: the first blocked spot east of the house row that is not a building, walk into it
    const terr = await page.evaluate(() => { const p0 = state.world.base; for (let y = p0.y + 3; y < p0.y + 12; y += 0.5) for (let x = p0.x + 2; x < p0.x + 20; x += 0.05) { if (playerCanStand(x, y) && !playerCanStand(x + 0.05, y)) { let ok = true; for (let d = 0.05; d < 1; d += 0.05) if (!playerCanStand(x - d, y)) ok = false; if (ok) return { x, y }; } } return null; });
    let terrain = null;
    if (terr) { await place(terr.x - 0.6, terr.y, 'right'); await page.waitForTimeout(250); await page.keyboard.down('d'); await page.waitForTimeout(1000); await page.keyboard.up('d'); await page.waitForTimeout(100);
      terrain = await page.evaluate((t) => ({ edge: +t.x.toFixed(3), x: +state.world.player.x.toFixed(4), y: +state.world.player.y.toFixed(4), stand: playerCanStand(state.world.player.x, state.world.player.y), stopped: state.world.player.x <= t.x + 0.051 }), terr);
      await page.screenshot({ path: path.join(OUT, tag + '-terrain.png') }); }
    // inside the house
    await place(pos.house.x, pos.house.y + 0.2, 'up'); await page.waitForTimeout(150);
    const entered = await page.evaluate(() => villageHomeEnter());
    await page.waitForTimeout(500); await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w'); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, tag + '-inside.png') });
    const inside = await page.evaluate(() => ({ inside: villageHomeInside(), x: +villageHomeScene().x.toFixed(3), y: +villageHomeScene().y.toFixed(3), stand: villageHomeCanStand(villageHomeScene().x, villageHomeScene().y) }));
    await page.evaluate(() => villageHomeExit());
    // save and load: save, reload, same player; then (after only) load the save the old build wrote
    await place(pos.base.x + 2.25, pos.base.y + 2.5, 'left');
    const saved = await page.evaluate(() => { saveGame(); return localStorage.getItem(SAVE_KEY); });
    if (build === 'before' && !savedBefore) savedBefore = saved;
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => typeof TD !== 'undefined' && TD.groundMap && TD.running, null, { timeout: 120000 });
    const loaded = await page.evaluate(() => JSON.stringify(state.world.player));
    let oldSave = null;
    if (build === 'after' && savedBefore) {
      await page.evaluate((s) => { clearInterval(autoSaveTimer); localStorage.setItem(SAVE_KEY, s); }, savedBefore);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => typeof TD !== 'undefined' && TD.groundMap && TD.running, null, { timeout: 120000 });
      oldSave = await page.evaluate((s) => ({ player: JSON.stringify(state.world.player), want: JSON.stringify(JSON.parse(s).run.world.player), version: JSON.parse(s).version, keys: Object.keys(JSON.parse(localStorage.getItem(SAVE_KEY)).run.world.player).sort().join() }), savedBefore);
      await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, tag + '-oldsave.png') });
    }
    log.push({ tag, consts, frames, speed: +((c.x - a.x) / ((c.t - a.t - 100) / 1000)).toFixed(2), wall, terrain, entered, inside,
      save: { same: loaded === JSON.stringify(JSON.parse(saved).run.world.player), loaded }, oldSave, errors: errs });
    await b.close();
  }
  srv.before.close(); srv.after.close();
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
  log.forEach((l) => console.log(l.tag, JSON.stringify({ c: l.consts, fr: Object.values(l.frames).map((f) => f.facing + ':' + f.seen).join(' '), sp: l.speed, wall: l.wall, terr: l.terrain && [l.terrain.edge, l.terrain.x, l.terrain.stopped, l.terrain.stand], in: [l.entered, l.inside.inside, l.inside.stand], save: l.save.same, old: l.oldSave && [l.oldSave.player === l.oldSave.want, l.oldSave.keys], err: l.errors })));
})().catch((e) => { console.error(e); process.exit(1); });
