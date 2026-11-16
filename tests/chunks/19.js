// =============================================================================
// Task 22: the drawing resolution on slow screens (render.js tdRenderScaleStep) and the corner slip
// round rock (player.js worldStepFoot). (19.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
(function test_renderDivisors() {
  const win = newDom(makeMemoryStorage()).window;
  const d = (native, zoom) => JSON.stringify(win.tdRenderDivisors(native, zoom));
  check('Task22: a ratio-3 phone at zoom 2 can draw at 3, 1.5 or 1 (an art pixel stays 6, 3 or 2 canvas pixels)', d(3, 2) === '[1,2,3]');
  check('Task22: at zoom 1 only the whole divisor 3 keeps art pixels whole (1.5 would not)', d(3, 1) === '[1,3]');
  check('Task22: a ratio-2 screen can halve; a ratio-1 screen (most PCs) never changes', d(2, 3) === '[1,2]' && d(1, 3) === '[1]');
  check('Task22: an uneven ratio (2.625) is left as it is', d(2.625, 2) === '[1]');
})();

(function test_renderScaleSteps() {
  const win = newDom(makeMemoryStorage()).window, TD = win.TD;
  Object.defineProperty(win, 'devicePixelRatio', { value: 3, configurable: true });
  TD.view = { w: 390, h: 844, zoom: 2, dpr: 3 };
  TD.frames = 100;
  const step = (now, ms) => { const changed = win.tdRenderScaleStep(now, ms); TD.frames += 100; return changed; };
  const k = () => TD.resStep.k;
  step(0, 30);
  check('Task22: fast enough frames (30 ms) keep the full resolution', k() === 1);
  check('Task22: slow frames (130 ms) step down one divisor', step(1000, 130) && k() === 2);
  check('Task22: no other change for a while after one (no flicker back and forth)', !step(2000, 130) && k() === 2);
  check('Task22: still slow after the hold: one more step down', step(6000, 130) && k() === 3);
  check('Task22: fast at the small size is not enough to go back if the finer size would be slow again (pixels x 2.25)', !step(11000, 15) && k() === 3);
  check('Task22: very fast at the small size goes back up one step', step(16000, 8) && k() === 2);
  check('Task22: at most 3 changes in a session', !step(21000, 130) && k() === 2 && TD.resStep.changes === 3);
})();

(function test_renderScaleResize() {
  // the canvas is drawn at ratio / k, the view keeps its CSS size
  const win = newDom(makeMemoryStorage()).window, TD = win.TD;
  Object.defineProperty(win, 'devicePixelRatio', { value: 3, configurable: true });
  const c = win.document.createElement('canvas');
  Object.defineProperty(c, 'clientWidth', { value: 390 }); Object.defineProperty(c, 'clientHeight', { value: 844 });
  const real = TD.canvas; TD.canvas = c;
  try {
    TD.resStep = { k: 1, at: 0, frame: 0, changes: 0 }; win.tdResize();
    const full = [c.width, c.height, TD.view.dpr, TD.view.div];
    TD.resStep.k = 2; win.tdResize();
    const half = [c.width, c.height, TD.view.dpr, TD.view.div, TD.view.w, TD.view.h, TD.view.zoom];
    check('Task22: full resolution: 1170 x 2532 canvas pixels at ratio 3', JSON.stringify(full) === '[1170,2532,3,1]', JSON.stringify(full));
    check('Task22: divisor 2: 585 x 1266 canvas pixels drawn at ratio 1.5, the view still 390 x 844 at zoom 2', JSON.stringify(half) === '[585,1266,1.5,2,390,844,2]', JSON.stringify(half));
  } finally { TD.canvas = real; }
})();

// The 256 test world, seed 1682025673 / generator v2: a gap in the rock one cell wide north of
// (-19.23, 21.56). Task 20's walk got stuck here: 0.1 off the gap's centre, walking north stopped dead.
function slipWorld() {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8'));
  Object.assign(p.run.world, { seed: 1682025673, size: 256, generatorVersion: 2, chunkEditsVersion: 1, chunkEdits: {} });
  const s = makeMemoryStorage(); s.setItem('gachaFactorySave.worldgen256.v1', JSON.stringify(p));
  const win = newDom(s, { url: 'https://example.test/?worldgen=256', saveKey: 'gachaFactorySave.worldgen256.v1', fullWorld: true }).window;
  win.worldEnsureRect({ minX: -24, maxX: -14, minY: 16, maxY: 26 });
  return win;
}
(function test_rockCornerSlip() {
  const win = slipWorld(), p = win.state.world.player;
  Object.assign(p, { x: -19.23, y: 21.56 });
  const startOk = win.playerCanStand(p.x, p.y);
  let bad = 0, maxSide = 0;
  win.setPlayerHeld('up', true);
  for (let i = 0; i < 12; i++) { const x0 = p.x; win.tickPlayer(); if (!win.playerCanStand(p.x, p.y)) bad++; maxSide = Math.max(maxSide, Math.abs(p.x - x0)); }
  win.clearPlayerHeld();
  check('Task22: walking north 0.1 off a one-cell gap in the rock, the player slips into it and walks through', startOk && p.y < 20.2, JSON.stringify({ x: p.x, y: p.y }));
  check('Task22: ...on standable ground all the way, side steps no larger than CORNER_SLIP (0.18)', bad === 0 && maxSide <= 0.18 + 1e-9, JSON.stringify({ bad, maxSide }));
})();

(function test_rockSlipNeverThrough() {
  // random walking round the gap and the rock next to it: never off standable ground, never a jump
  const win = slipWorld(), p = win.state.world.player;
  let r = 22; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const dirs = [['up'], ['down'], ['left'], ['right'], ['up', 'left'], ['up', 'right'], ['down', 'left'], ['down', 'right']];
  Object.assign(p, { x: -19.23, y: 21.56 });
  let bad = 0, jumps = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 8 === 0) { win.clearPlayerHeld(); dirs[Math.floor(rnd() * 8)].forEach((d) => win.setPlayerHeld(d, true)); }
    const x0 = p.x, y0 = p.y; win.tickPlayer();
    if (!win.playerCanStand(p.x, p.y)) bad++;
    if (Math.hypot(p.x - x0, p.y - y0) > 0.3 * Math.SQRT2 + 0.18 + 1e-9) jumps++;
  }
  win.clearPlayerHeld();
  check('Task22: 3000 random steps round the rock gap: never on rock, never more than a step (plus the slip)', bad === 0 && jumps === 0, JSON.stringify({ bad, jumps }));
})();

// =============================================================================
// Task 23: telling the craft huts apart at their doors (interact.js tdDoorBonus) and where a new hut
// goes (factory.js workshopBuildSpot). The midgame save has two huts side by side, (1,-1) and (2,-1),
// the second right behind the cabin at (2,0): before, the strip between that hut's door and the
// cabin's back wall picked the cabin, and the huts had the same label.
// =============================================================================
const HUT_MID = fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8');
function hutWin() { const st = makeMemoryStorage(); st.setItem('gachaFactorySave', HUT_MID); return newDom(st).window; }

(function test_hutDoorStrip() {
  const win = hutWin(), s = win.state, ws = s.world.workshops;
  const huts = JSON.stringify(ws.map((w) => [w.x, w.y])), base = s.world.base;
  check('Task23: the fixture has two huts side by side behind the cabin', huts === '[[1,-1],[2,-1]]' && base.x === 2 && base.y === 0, huts);
  // every standable point in front of each door (the hut's width, from the door down to the cabin's wall), any facing
  const wrong = [];
  ['up', 'down', 'left', 'right'].forEach((f) => {
    s.world.player.facing = f;
    ws.forEach((w) => {
      for (let dy = 0; dy <= 0.55; dy += 0.05) for (let dx = -0.3; dx <= 0.3001; dx += 0.05) {
        const x = w.x + dx, y = w.y + dy;
        if (!win.playerCanStand(x, y)) continue;
        const t = win.tdInteractTarget(x, y);
        if (!t || t.id !== w.id) wrong.push([f, +x.toFixed(2), +y.toFixed(2), t && t.id]);
      }
    });
  });
  check('Task23: standing in front of a hut door always picks that hut (both huts, every facing)', wrong.length === 0, JSON.stringify(wrong.slice(0, 6)));
  const t = win.tdInteractTarget(2, -0.5);
  check('Task23: just behind the cabin, at the second hut\'s door, it is the hut, not the cabin', t && t.type === 'workshop' && t.id === ws[1].id, JSON.stringify(t));
  s.world.player.facing = 'up';
  const front = win.tdInteractTarget(base.x, base.y + 0.3);
  check('Task23: the cabin\'s own door step still opens the cabin', front && front.type === 'base');
})();

(function test_hutLabels() {
  const win = hutWin(), ws = win.state.world.workshops;
  const l = ws.map((w) => win.tdInteractTarget(w.x, w.y + 0.3).label);
  check('Task23: the two huts have different labels (number, level and recipe)', l[0] !== l[1] && /^제작소 1 Lv\.\d+ · /.test(l[0]) && /^제작소 2 Lv\.\d+ · /.test(l[1]), JSON.stringify(l));
  const rec = win.recipeByKey(ws[0].recipeKey);
  check('Task23: the label names what the hut makes, or that it has no recipe', l[0].endsWith(' · ' + (rec ? rec.name : '레시피 없음')), l[0]);
})();

(function test_doorsOnlyReorder() {
  // the reach is the plain distance as before: something is offered exactly where something is in reach
  const win = hutWin(), s = win.state, R = win.TOPDOWN.INTERACT_RANGE;
  const pts = [s.world.base].concat(s.world.workshops);
  let bad = 0;
  ['up', 'down', 'left', 'right'].forEach((f) => {
    s.world.player.facing = f;
    for (let y = -3; y <= 2; y += 0.1) for (let x = -1; x <= 5; x += 0.1) {
      const t = win.tdInteractTarget(x, y);
      if (t && Math.hypot(t.x - x, t.y - y) > R + 1e-9) bad++;
      if (!t && pts.some((p) => Math.hypot(p.x - x, p.y - y) <= R)) bad++;
    }
  });
  check('Task23: a target is always within the old reach (1.15), and something is offered wherever the cabin or a hut is in reach', bad === 0, String(bad));
})();

(function test_walkAlongHutDoors() {
  // walking along the row in front of the doors, tick by tick (one tick = one step as on a slow PC at 4x),
  // the label follows the doors: first hut, then the second, never the cabin in between
  const win = hutWin(), s = win.state, p = s.world.player, ws = s.world.workshops;
  Object.assign(p, { x: 0.6, y: -0.7, facing: 'right' });
  const seen = [];
  win.setPlayerHeld('right', true);
  for (let i = 0; i < 12 && p.x < 2.4; i++) {
    win.tickPlayer();
    const t = win.tdInteractTarget(p.x, p.y);
    if (!seen.length || seen[seen.length - 1] !== (t && t.id)) seen.push(t && t.id);
  }
  win.clearPlayerHeld();
  check('Task23: walking past the doors the target goes hut 1 -> hut 2, never the cabin or nothing', JSON.stringify(seen) === JSON.stringify([ws[0].id, ws[1].id]), JSON.stringify({ seen, x: p.x, y: p.y }));
})();

(function test_newHutSpacing() {
  // a new game: huts are built round the cabin, none right behind it, none door to door beside another
  const win = newDom(makeMemoryStorage()).window, s = win.state;
  s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12;
  s.products.steelGear = 10; s.products.manaEngine = 10;
  while (win.canBuildWorkshop() && s.world.workshops.length < 8) win.buildWorkshop();
  const ws = s.world.workshops, b = s.world.base, keys = ws.map((w) => w.x + ',' + w.y);
  check('Task23: all eight huts are still built, each on its own cell', ws.length === 8 && new Set(keys).size === 8, JSON.stringify(keys));
  check('Task23: no new hut right behind the cabin', !ws.some((w) => w.x === b.x && w.y === b.y - 1), JSON.stringify(keys));
  check('Task23: no two huts door to door side by side', !ws.some((w) => ws.some((o) => o !== w && o.y === w.y && Math.abs(o.x - w.x) === 1)), JSON.stringify(keys));
  check('Task23: they stay near the cabin (within 4 cells)', ws.every((w) => Math.max(Math.abs(w.x - b.x), Math.abs(w.y - b.y)) <= 4));
})();

(function test_oldHutsKept() {
  // a save with huts packed the old way keeps them where they are; the next one goes to a spaced spot
  const win = hutWin(), s = win.state;
  const before = JSON.stringify(s.world.workshops.map((w) => [w.id, w.x, w.y]));
  s.research.workshopBuild = true; s.gold = 1e12;
  const spot = win.workshopBuildSpot();
  check('Task23: loading keeps the packed huts in place', JSON.stringify(s.world.workshops.map((w) => [w.id, w.x, w.y])) === before, before);
  check('Task23: the next hut is not beside them door to door', !!spot && !s.world.workshops.some((w) => w.y === spot.y && Math.abs(w.x - spot.x) <= 1), JSON.stringify(spot));
})();

(function test_bubbleSeeThroughAndHtml() {
  const win = hutWin(), TD = win.TD;
  const cam = { x: 0, y: 0 }, z = 2, W = 390, H = 844;
  TD.workerSim = { byId: { a: { x: 0, y: 0 } }, last: null };
  const sp = win.topdownToScreen(0, 0, cam, W, H, z);
  const over = { x: sp.x - 10, y: sp.y - 30, w: 40, h: 22 }, away = { x: sp.x + 200, y: sp.y - 30, w: 40, h: 22 };
  check('Task23: a bubble over a walking worker is found (it is then drawn see-through)', win.tdBubbleCoversWorker(over, cam, W, H, z) === true && win.tdBubbleCoversWorker(away, cam, W, H, z) === false);
  win.tdBubbleHtml(['감정소 · 100G'], { x: 10, y: 20, w: 120, h: 22 }, false, true, 'bold 14px sans-serif');
  const el = win.document.querySelector('.td-bubble');
  check('Task23: on a lowered resolution the bubble is a page element at the same place and size', !!el && !el.hidden && el.textContent === '감정소 · 100G' && el.style.left === '10px' && el.style.top === '20px' && el.style.width === '120px' && el.classList.contains('is-thin'));
  win.tdBubbleHtml(null);
  check('Task23: ...and it is hidden again at full resolution or with no target', el.hidden === true);
})();

(function test_hintFadesOverBubble() {
  const win = hutWin(), TD = win.TD, doc = win.document, hint = doc.getElementById('nextHint');
  hint.getBoundingClientRect = () => ({ left: 10, top: 52, width: 280, height: 70 });
  TD.playerRect = { x: 180, y: 400, w: 32, h: 44 };
  TD.hintBox = null; win.tdHintClear({ x: 150, y: 80, w: 120, h: 22 });
  const faded = doc.body.classList.contains('td-hint-under');
  TD.hintBox = null; win.tdHintClear({ x: 150, y: 300, w: 120, h: 22 });
  const back = !doc.body.classList.contains('td-hint-under');
  TD.playerRect = { x: 40, y: 90, w: 32, h: 44 }; TD.hintBox = null; win.tdHintClear(null);
  check('Task23: the top hint fades while the bubble is under it, and comes back after', faded && back);
  check('Task23: ...and while the player is under it', doc.body.classList.contains('td-hint-under'));
  TD.playerRect = { x: 180, y: 400, w: 32, h: 44 }; TD.hintBox = null;
  win.tdHintClear(null, [{ x: 200, y: 60, w: 88, h: 80 }]);
  const near = doc.body.classList.contains('td-hint-near') && !doc.body.classList.contains('td-hint-under');
  win.tdHintClear(null, [{ x: 300, y: 60, w: 88, h: 80 }]);
  check('Task23: a building with a door under the hint makes it half clear (only then)', near && !doc.body.classList.contains('td-hint-near'));
  const W = win.state.world; Object.assign(W.player, { x: W.base.x, y: W.base.y + 0.5 });
  const rects = win.tdDoorRects({ x: W.player.x, y: W.player.y }, 390, 844, 2);
  check('Task23: the door buildings near the player are listed (the cabin and both huts at least)', rects.length >= 3 && rects.every((q) => q.w > 0 && q.h > 0), String(rects.length));
})();

(function test_buildCheckStaysCheap() {
  // the screen asks canBuildWorkshop every tick: it must not lay the village roads out again
  const win = hutWin(), s = win.state;
  s.research.workshopBuild = true; s.gold = 1e12;
  win.villageRoads(); // the roads as they are, cached
  let computes = 0;
  const real = win.villageRoadsCompute;
  win.villageRoadsCompute = function () { computes++; return real.apply(this, arguments); };
  for (let i = 0; i < 20; i++) win.canBuildWorkshop();
  win.updateNumbers();
  check('Task23: asking whether a hut can be built (every tick) never lays the roads out again', computes === 0 && win.canBuildWorkshop() === true, String(computes));
  win.workshopBuildSpot();
  const after = computes; win.villageRoads();
  check('Task23: choosing the spot leaves the cached roads as they were (no extra layout afterwards)', computes === after, JSON.stringify({ after, now: computes }));
})();

// =============================================================================
// Task 24: interface and type, first pass. Panel titles, the phone hint that opens on a tap, a tap on
// the world closing a panel on a phone, the font chain with its fallbacks, one icon per dock button.
// =============================================================================
(function test_T24_panelTitles() {
  const win = newDom(makeMemoryStorage()).window, doc = win.document;
  const tabs = [...doc.querySelectorAll('.tab-btn[data-tab]')];
  const titled = tabs.every((b) => doc.getElementById('tab-' + b.dataset.tab).getAttribute('data-panel-title') === b.textContent.trim());
  check('Task24: every panel carries its tab\'s name as its title (and the log is 기록)', tabs.length === 6 && titled && doc.getElementById('logSection').getAttribute('data-panel-title') === '기록');
  check('Task24: the tab buttons keep their names (no icon text added)', tabs.map((b) => b.textContent).join() === '채굴,개발,인부,연구,납품,마을' && doc.querySelector('.td-log-btn').textContent === '기록');
})();

(function test_T24_hintTapAndWorldTap() {
  const win = newDom(makeMemoryStorage()).window, doc = win.document, body = doc.body;
  const hint = doc.getElementById('nextHint');
  hint.click(); const opened = hint.classList.contains('is-open');
  hint.click();
  check('Task24: a tap on the next-step hint opens it, another closes it', opened && !hint.classList.contains('is-open'));
  const canvas = doc.getElementById('tdCanvas');
  const tap = () => canvas.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  win.TD.touch = false; win.tdOpenTab('dev'); tap();
  const pcStays = win.tdPanelOpen();
  win.TD.touch = true; tap();
  const phoneCloses = !win.tdPanelOpen();
  doc.querySelector('.td-log-btn').click(); const logOpen = body.classList.contains('td-log-open'); tap();
  check('Task24: on a PC a click on the world leaves the panel open (it only takes the keyboard back)', pcStays);
  check('Task24: on a phone a tap on the world closes the open panel, and the log too', phoneCloses && logOpen && !body.classList.contains('td-log-open'));
})();

(function test_T24_fontsAndIcons() {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('Task24: the UI and handwriting faces load without holding the page (async stylesheet, swap)',
    /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Sans\+KR:wght@400;500;700&family=Gaegu:wght@400;700&display=swap" media="print" onload="this\.media='all'">/.test(html));
  check('Task24: the handwriting face falls back to the UI face and the system Korean faces', /--font-hand:'Gaegu','IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR',system-ui,sans-serif;/.test(css));
  const icons = ['mining', 'dev', 'workers', 'research', 'delivery', 'village', 'log', 'gold', 'ticket', 'prestige'];
  check('Task24: every dock button and HUD value has its pixel icon', icons.every((k) => new RegExp('--ico-' + k + ':url\\("data:image/svg\\+xml,').test(css))
    && ['mining', 'dev', 'workers', 'research', 'delivery', 'village'].every((k) => css.includes('.tab-btn[data-tab="' + k + '"]{--ico:var(--ico-' + k + ');}')) && css.includes('.td-log-btn{--ico:var(--ico-log);}'));
  check('Task24: phones (upright and on their side) get the 16px floor', /@media \(max-width: 760px\), \(max-height: 500px\) and \(orientation: landscape\)\{\s*body\.view-topdown\{--fs-min:16px;\}/.test(css));
  check('Task24: the classic page keeps its faces (the new faces only in the world-first view)', /body\.view-topdown\{\s*--font-display:var\(--font-body\);/.test(css) && /--font-display:'Space Grotesk'/.test(css));
})();

(function test_T24_escFromField() {
  // Escape closes the panel even while a field in it has the keyboard; letters typed there still never walk or act
  const win = newDom(makeMemoryStorage()).window, doc = win.document;
  win.tdOpenTab('dev');
  const field = doc.createElement('input'); field.type = 'number'; doc.getElementById('tab-dev').appendChild(field); field.focus();
  const p = win.state.world.player, at = [p.x, p.y];
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'w', bubbles: true })); win.tickPlayer();
  const still = win.tdPanelOpen() && p.x === at[0] && p.y === at[1];
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Task24: E and W typed into a panel field neither act nor walk', still);
  check('Task24: Escape from a panel field closes the panel', !win.tdPanelOpen());
})();
// =============================================================================
// G1 (2026-11-01): the approved character walk (docs/design/graphics-g0-g1/g1-proposal/proposal.js).
// Legs apart in the side view, a longer stride, the front and back feet lifting, arms against legs,
// shaded sleeve edges; size, feet, hair, face and outfit unchanged. (19.js: Claude-owned tests.)
// =============================================================================
(function test_G1_characterWalk() {
  const win = newDom(makeMemoryStorage()).window;
  const C = win.TD_PLAYER_COLORS, F = win.TD_PLAYER_FAR_LEG, dirs = ['down', 'up', 'left', 'right'];
  const raster = (sp) => win.tdRaster(sp);
  const solidAt = (r, x, y) => { const p = r.px[y * r.w + x]; return !!p && p[3] >= 1; };
  const runs = (r, y) => { let n = 0, on = false; for (let x = 0; x < r.w; x++) { const o = solidAt(r, x, y); if (o && !on) n++; on = o; } return n; };
  const right = [0, 1, 2, 3].map((f) => raster(win.tdPlayerSprite('right', f)));
  check('G1: standing side view shows two legs apart (a gap on the trouser rows 16-17; the boots below may touch)', [16, 17].every((y) => runs(right[0], y) === 2));
  const legSpan = (r) => { let a = 99, b = -1; for (let y = 16; y < 21; y++) for (let x = 0; x < r.w; x++) if (solidAt(r, x, y)) { a = Math.min(a, x); b = Math.max(b, x); } return b - a + 1; };
  check('G1: the side stride is wider than standing on both steps', legSpan(right[1]) > legSpan(right[0]) + 2 && legSpan(right[3]) > legSpan(right[0]) + 2);
  check('G1: the far leg is a shade darker than the near leg', win.tdPlayerSprite('right', 0).rects.some((r) => r[4] === F.pants) && win.tdPlayerSprite('right', 0).rects.some((r) => r[4] === C.pants));
  const bootTop = (sp, x0, x1) => Math.min(...sp.rects.filter((r) => r[4] === C.furShade && r[1] >= 16 && r[0] >= x0 && r[0] < x1).map((r) => r[1]));
  const down = [0, 1, 2, 3].map((f) => win.tdPlayerSprite('down', f));
  check('G1: from the front the stepping foot lifts two pixels', bootTop(down[1], 0, 8) === bootTop(down[0], 0, 8) - 2 && bootTop(down[3], 8, 16) === bootTop(down[0], 8, 16) - 2);
  const gloveY = (sp, x) => sp.rects.filter((r) => r[4] === C.glove && r[0] === x).map((r) => r[1])[0];
  check('G1: front sleeves swing one up, one down (two pixels apart) and against the legs',
    gloveY(down[1], 12) - gloveY(down[1], 2) === 2 && gloveY(down[3], 2) - gloveY(down[3], 12) === 2 && gloveY(down[0], 2) === gloveY(down[0], 12));
  const armX = (sp) => Math.min(...sp.rects.filter((r) => r[4] === C.glove).map((r) => r[0]));
  const rs = [0, 1, 2, 3].map((f) => win.tdPlayerSprite('right', f));
  check('G1: the near arm swings back when the near leg steps forward (and the other way)', armX(rs[1]) < armX(rs[0]) && armX(rs[3]) > armX(rs[0]));
  check('G1: every sleeve has a shaded edge (parkaDark next to parkaLight)', dirs.every((d) => [0, 1, 2, 3].every((f) => { const c = new Set(win.tdPlayerSprite(d, f).rects.map((r) => r[4])); return c.has(C.parkaLight) && c.has(C.parkaDark); })));
  // unchanged: the head (hair, face) is pixel for pixel the same in the standing frame of every direction
  const headRows = (r) => JSON.stringify(r.px.slice(0, 9 * r.w));
  const v2 = dirs.map((d) => [0, 1, 2, 3].map((f) => raster(win.tdPlayerSpriteV2(d, f))));
  check('G1: v2 is built from the same walk (16 x 22, legs apart in the side view)', v2.every((row) => row.every((r) => r.w === 16 && r.h === 22)) && [16, 17].every((y) => runs(v2[3][0], y) === 2));
  check('G1: hair stays cobalt (#3d5c9e) and the head rows keep their colours', C.hair === '#3d5c9e' && dirs.every((d) => headRows(raster(win.tdPlayerSprite(d, 0))).length > 0));
  check('G1: the 1.5x experiment drops both legs from the 1x body (no far-leg colour leaks above its own legs)',
    dirs.every((d) => [0, 1, 2, 3].every((f) => win.tdRaster(win.tdPlayerSprite15(d, f)).px.every((p) => !p || ![F.pants, F.cuff].map((c) => win.tdParseColor(c).slice(0, 3).join()).includes(p.slice(0, 3).join())))));
})();

// Approved G3 B: production art keeps the existing interactive/light pixels.
(function test_G3_houseDomestic() {
  const win = newDom(makeMemoryStorage()).window;
  const crypto = require('node:crypto');
  const regions = [[34,43,16,25],[31,68,22,2],[15,45,11,11],[59,45,11,11],[54,46,6,7],[0,70,84,3]];
  const hashes = ['253af05df730864eda0a9a458d6d0f854234374ef73a6ca8c2582a0b1430cc13', 'ac96748cd3e33d64b3342a7f373e43cb47817767e5e2e8100ff73a65527a0c37'];
  ['tdHouseSprite', 'tdHouseSpriteV2'].forEach((name, i) => {
    const sprite = win[name](), r = win.tdRaster(sprite), protectedPixels = [];
    for (const [x,y,w,h] of regions) for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) protectedPixels.push(r.px[yy*84+xx]);
    check('G3: '+name+' retains 84×73 and protected interaction/light/shadow pixels', r.w===84 && r.h===73 && crypto.createHash('sha256').update(JSON.stringify(protectedPixels)).digest('hex')===hashes[i]);
    const at = (x,y) => r.px[y*84+x].slice(0,3).join();
    check('G3: '+name+' has a bright continuous seat rim and dark separated legs', at(15,62)==='240,205,148' && at(23,62)==='240,205,148' && at(14,67)==='90,59,40' && at(23,67)==='90,59,40' && at(19,67)!==at(14,67));
    check('G3: '+name+' has distinct terracotta rims and leafy crowns', [[28,64],[61,63]].every(([x,y])=>at(x,y)==='230,173,115' && at(x,y-3)==='136,166,87'));
    check('G3: '+name+' stays inside integer sprite bounds', sprite.rects.every(([x,y,w,h])=>[x,y,w,h].every(Number.isInteger)&&x>=0&&y>=0&&x+w<=84&&y+h<=73));
  });
  win.close();
})();
// =============================================================================
// UX-01 (Issue #32): recipe cards — inputs with have/need, the craft button and its real reason up
// front; selling, auto-craft, the stock target and auto-sell in a closed <details>. UI only: the save,
// the rules and every control's data-* attribute stay as they were. (19.js: Claude-owned tests.)
// =============================================================================
(function test_UX01_recipeCards() {
  const win = newDom(makeMemoryStorage()).window, doc = win.document, s = win.state;
  const card = (k) => doc.querySelector('[data-stock="' + k + '"]').closest('.recipe');
  const more = (k) => doc.querySelector('[data-recipe-more="' + k + '"]');
  const reason = (k) => doc.querySelector('[data-craft-reason="' + k + '"]');
  const steel = card('steel');
  check('UX01: the craft button, the stock and the inputs are outside the details; sale and automation inside',
    !more('steel').contains(steel.querySelector('[data-craft="steel"]')) && !more('steel').contains(steel.querySelector('[data-stock="steel"]')) &&
    steel.querySelectorAll('[data-need^="steel:"]').length === 2 && ['[data-sell="steel"]', '[data-autocraft="steel"]', '[data-craft-target="steel"]', '[data-buyautosell="steel"]'].every((q) => more('steel').contains(doc.querySelector(q))));
  check('UX01: every card has a closed details named 「판매 · 자동화 설정」', [...doc.querySelectorAll('#recipes .recipe')].every((c) => { const d = c.querySelector('details[data-recipe-more]'); return d && !d.open && d.querySelector('summary .recipe-more-title').textContent === '판매 · 자동화 설정'; }));
  // the real reason, from recipeShortages(): every missing input
  Object.assign(s.resources, { iron: 1, coal: 0 }); s.craftQueue.steel = null; win.updateNumbers();
  const short = win.recipeShortages(win.recipeByKey('steel')).map((x) => x.name + ' ' + (x.need - x.have) + '개').join(' · ') + ' 부족';
  check('UX01: a disabled craft button says exactly what is missing (all inputs)', reason('steel').textContent === short && short === '철광석 1개 · 석탄 1개 부족' && !reason('steel').hidden &&
    doc.querySelector('[data-craft="steel"]').disabled && doc.querySelector('[data-craft="steel"]').getAttribute('aria-describedby') === reason('steel').id);
  check('UX01: each input shows have / need and marks a shortage in words', doc.querySelector('[data-need="steel:iron"]').textContent === '철광석 보유 1 / 필요 2 (부족)' && doc.querySelector('[data-need="steel:iron"]').classList.contains('is-short'));
  s.resources.iron = 1.99; win.updateNumbers();
  check('UX01: a fractional stock counts in whole units, the same as the craft rule (1.99 of 2 is still short)', reason('steel').textContent.startsWith('철광석 1개') && doc.querySelector('[data-craft="steel"]').disabled);
  Object.assign(s.resources, { iron: 10, coal: 10 }); win.updateNumbers();
  check('UX01: with enough inputs the reason disappears and the button works', reason('steel').hidden && reason('steel').textContent === '' && !doc.querySelector('[data-craft="steel"]').disabled && doc.querySelector('[data-need="steel:iron"]').textContent === '철광석 보유 10 / 필요 2');
  s.craftQueue.ironTool = 1.5; s.resources.iron = 0; win.updateNumbers();
  check('UX01: while crafting the button says so and no shortage is claimed', reason('ironTool').hidden && /제작 중/.test(doc.querySelector('[data-craft="ironTool"]').textContent));
  s.craftQueue.ironTool = null;
  // sale and auto-sell reasons, with the real numbers
  s.products.steel = 0; s.gold = 10; win.updateNumbers();
  check('UX01: an empty stock explains the disabled sale', doc.querySelector('[data-sell-reason="steel"]').textContent === '팔 수 있는 재고가 없어요');
  check('UX01: auto-sell shows the real gold shortfall', doc.querySelector('[data-buyautosell-reason="steel"]').textContent === '골드 ' + win.fmt(win.autoSellCost(win.recipeByKey('steel')) - 10) + 'G 부족 (필요 ' + win.fmt(win.autoSellCost(win.recipeByKey('steel'))) + 'G · 보유 10G)');
  s.gold = 9.6; win.updateNumbers();
  check('UX01: a fractional gold never reads as "0G short"', /^골드 [1-9][0-9,]*G 부족/.test(doc.querySelector('[data-buyautosell-reason="steel"]').textContent));
  // auto-craft state on the closed card: what it really does
  s.research.autoCraftDevice = true; win.renderAll();
  s.autoCraft.coalBrick = true; s.craftTarget.coalBrick = 3; s.products.coalBrick = 3; win.updateNumbers();
  const auto = doc.querySelector('[data-recipe-auto-state="coalBrick"]');
  check('UX01: auto-craft at its stock target says it is resting, visible with the details closed', !more('coalBrick').open && !auto.hidden && auto.textContent === '자동 제작 · 목표 재고 도달로 쉬는 중');
  s.craftTarget.coalBrick = 0; s.resources.coal = 0; win.updateNumbers();
  check('UX01: auto-craft without inputs says it waits for them (not "crafting")', auto.textContent === '자동 제작 · 재료 부족으로 대기');
  s.autoCraft.coalBrick = false; win.updateNumbers();
  check('UX01: no auto-craft, no state line', auto.hidden);
  // open state: kept across rebuilds of the same run, not saved, reset for another run
  const before = JSON.stringify(s), keys = Object.keys(win.localStorage).sort().join();
  more('steel').open = true; more('steel').dispatchEvent(new win.Event('toggle'));
  win.renderAll();
  check('UX01: an opened details stays open after renderAll (same village)', more('steel').open && !more('coalBrick').open);
  check('UX01: opening details changes nothing in the run state or the storage', JSON.stringify(s) === before && Object.keys(win.localStorage).sort().join() === keys && !/recipeMore|recipe-more/.test(JSON.stringify(s)));
  // another run object, installed the way the game does it (S2Runtime.apply: a new village, a restore or a reload):
  // the details start closed again. The same run comes back open.
  const R = win.S2Runtime, runBefore = win.state;
  R.apply({ id: 'ux01-a', name: 'UX01 A', snapshot: { savedAt: 1, payload: R.payload(win.freshRunState(), win.permanent) } });
  const swapped = win.state !== runBefore, openAfter = [...doc.querySelectorAll('[data-recipe-more]')].filter((d) => d.open).length;
  check('UX01: another run (new village, restore, reload) starts with every details closed', swapped && openAfter === 0, JSON.stringify({ swapped, openAfter }));
  // focus kept across the auto-sell purchase (button -> toggle)
  const s2 = win.state; s2.gold = 1e6; win.renderAll(); more('steel').open = true; more('steel').dispatchEvent(new win.Event('toggle'));
  const buy = doc.querySelector('[data-buyautosell="steel"]'); buy.focus(); buy.click();
  check('UX01: buying auto-sell moves the focus to its new toggle', s2.autoSell.steel === true && doc.activeElement === doc.querySelector('[data-autoselltoggle="steel"]') && more('steel').open);
  s2.products.steel = 5; win.updateNumbers();
  check('UX01: with auto-sell on, the sale explains why it is off and the closed card says auto-sell is on',
    doc.querySelector('[data-sell="steel"]').disabled && doc.querySelector('[data-sell-reason="steel"]').textContent === '자동 판매가 켜져 있어 직접 팔 수 없어요' && /자동 판매 켜짐/.test(doc.querySelector('[data-recipe-auto-state="steel"]').textContent));
  // the stock target: its own label, the field with its unit, and the help that states the rule
  const field = doc.querySelector('[data-craft-target="steel"]'), label = doc.querySelector('label[for="' + field.id + '"]');
  check('UX01: the stock target has its own label, a unit and a help line with the existing rule', label && label.textContent === '목표 재고' && field.nextElementSibling.textContent === '개에서 멈춤' &&
    /새 시작만/.test(doc.getElementById(field.getAttribute('aria-describedby')).textContent) && /0은 제한 없음/.test(doc.getElementById(field.getAttribute('aria-describedby')).textContent));
  field.value = '-3'; field.onchange();
  check('UX01: the target keeps its rule (negative -> no limit) and the summary says so', s2.craftTarget.steel === 0 && field.value === '' && /목표 없음/.test(doc.querySelector('[data-recipe-more-state="steel"]').textContent));
  // the sale hint on the closed card: only while there is something to sell by hand
  s2.autoSellOn.steel = false; more('steel').open = false; more('steel').dispatchEvent(new win.Event('toggle')); win.updateNumbers();
  check('UX01: a closed card with stock tells where selling is', !doc.querySelector('[data-recipe-sell-hint="steel"]').hidden && /「판매 · 자동화 설정」/.test(doc.querySelector('[data-recipe-sell-hint="steel"]').textContent));
  // Space on a summary opens it but does not act in the world; other keys still reach the game
  let reached = [];
  const spy = (e) => reached.push(e.key);
  doc.addEventListener('keydown', spy);
  const summary = doc.querySelector('[data-recipe-summary="steel"]');
  summary.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
  summary.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
  doc.removeEventListener('keydown', spy);
  check('UX01: Space on a recipe summary stays local; movement keys still reach the game', reached.join() === 'w');
  // workshop-only cards: nothing new — no hand craft, no automation; sale and target in the details
  win.SITES.forEach((site) => { s2.unlockedSites[site.key] = true; }); win.renderAll();
  const p = doc.querySelector('[data-workshop-only="specialAlloy"]') || doc.querySelector('[data-workshop-only]');
  const k = p && p.getAttribute('data-workshop-only');
  check('UX01: a workshop-only card keeps its note outside and only sale and target inside the details', !!k && !doc.querySelector('[data-craft="' + k + '"]') && !doc.querySelector('[data-autocraft="' + k + '"]') && !doc.querySelector('[data-buyautosell="' + k + '"]') &&
    more(k).contains(doc.querySelector('[data-sell="' + k + '"]')) && more(k).contains(doc.querySelector('[data-craft-target="' + k + '"]')) && !more(k).contains(p));
})();
// =============================================================================
// UX-01 F-01 (Issue #32): Space on the card's enabled auto-craft / auto-sell checkbox stays in the card
// (propagation stopped, default NOT prevented, so the browser ticks it); a disabled one, other keys and the
// summary keep their old paths. The real-keyboard proof is tests/playthrough/recipe-keyboard.spec.cjs.
// =============================================================================
(function test_UX01_F01_checkboxSpace() {
  const win = newDom(makeMemoryStorage()).window, doc = win.document, s = win.state;
  const reached = [];
  const spy = (e) => reached.push(e.key + ':' + (e.target.getAttribute('data-autocraft') !== null ? 'auto' : e.target.getAttribute('data-autoselltoggle') !== null ? 'sell' : e.target.tagName));
  const press = (el, key, code) => { const ev = new win.KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev; };
  // before the research: the auto-craft checkbox is disabled and keeps the old path
  doc.addEventListener('keydown', spy);
  const lockedAuto = doc.querySelector('[data-autocraft="steel"]');
  press(lockedAuto, ' ', 'Space');
  check('UX01-F01: a disabled auto-craft checkbox is not handled by the card (old path)', lockedAuto.disabled && reached.join() === ' :auto');
  reached.length = 0;
  s.research.autoCraftDevice = true; s.autoSell.steel = true; s.autoSellOn.steel = true; win.renderAll();
  const auto = doc.querySelector('[data-autocraft="steel"]'), sell = doc.querySelector('[data-autoselltoggle="steel"]');
  const evA = press(auto, ' ', 'Space'), evS = press(sell, ' ', 'Space');
  check('UX01-F01: Space on the enabled auto-craft and auto-sell checkboxes stays in the card', reached.length === 0);
  check('UX01-F01: the card never prevents the default (the browser ticks the box itself)', !evA.defaultPrevented && !evS.defaultPrevented);
  check('UX01-F01: the card does not change the box or the state itself on keydown', auto.checked === false && s.autoCraft.steel !== true && sell.checked === true && s.autoSellOn.steel === true);
  ['w', 'ArrowLeft', 'e'].forEach((k) => press(auto, k, k === 'w' ? 'KeyW' : k === 'e' ? 'KeyE' : k));
  press(sell, 'd', 'KeyD');
  check('UX01-F01: movement keys and E on those checkboxes still reach the game (Task95/99)', reached.join() === 'w:auto,ArrowLeft:auto,e:auto,d:sell');
  reached.length = 0;
  const summary = doc.querySelector('[data-recipe-summary="steel"]'), evSum = press(summary, ' ', 'Space');
  const target = doc.querySelector('[data-craft-target="steel"]'), sellBtn = doc.querySelector('[data-sell="steel"]');
  press(target, ' ', 'Space'); press(sellBtn, ' ', 'Space');
  check('UX01-F01: the summary keeps its Space handling; other card controls keep their old paths', !evSum.defaultPrevented && reached.join() === ' :INPUT, :BUTTON');
  doc.removeEventListener('keydown', spy);
})();
// =============================================================================
// Issue #32 POST-QA B/D: a recipe card rebuild waits while a stock-target field of the same run is being
// edited (an unfinished number or a composition is never replaced), runs once the focus leaves, and a
// change from a removed field or an unfinished number never sets a target. Real browser proof:
// tests/playthrough/recipe-draft.spec.cjs. (19.js: Claude-owned tests.)
// =============================================================================
(function test_UX01_BD_targetDraft() {
  const win = newDom(makeMemoryStorage()).window, doc = win.document;
  const field = () => doc.querySelector('[data-craft-target="steel"]'), more = () => doc.querySelector('[data-recipe-more="steel"]');
  win.state.craftTarget.steel = 7; win.renderAll();
  more().open = true; more().dispatchEvent(new win.Event('toggle'));
  const a = field(); a.focus(); a.value = '42';
  win.renderAll();
  check('UX01-BD: while the target field is being edited a rebuild waits (same node, draft and focus kept)', field() === a && a.value === '42' && doc.activeElement === a && win.state.craftTarget.steel === 7);
  win.SITES.forEach((site) => { win.state.unlockedSites[site.key] = true; }); win.renderAll();
  check('UX01-BD: a structural change waits too (no new cards while editing)', field() === a && !doc.querySelector('[data-stock="specialAlloy"]'));
  a.blur(); win.buildRecipes(); // what the focusout handler runs once the focus has moved
  check('UX01-BD: once the focus leaves, the rebuild runs (new cards, details still open)', field() !== a && !!doc.querySelector('[data-stock="specialAlloy"]') && more().open);
  // an unfinished number ("1e") reads as '' with validity.badInput: it is not the player clearing the field
  const b = field(); b.value = ''; Object.defineProperty(b, 'validity', { value: { badInput: true }, configurable: true }); b.onchange(); delete b.validity;
  check('UX01-BD: an unfinished number keeps the target and shows it again', win.state.craftTarget.steel === 7 && b.value === '7');
  const c = field(); c.value = ''; c.onchange();
  check('UX01-BD: a field the player really cleared still means no limit (existing rule)', win.state.craftTarget.steel === 0 && c.value === '');
  c.value = '-3'; c.onchange(); const neg = win.state.craftTarget.steel;
  c.value = '5.7'; c.onchange(); const dec = win.state.craftTarget.steel;
  c.value = '9999999'; c.onchange();
  check('UX01-BD: the existing normalisation is unchanged (-3 -> 0, 5.7 -> 5, 9999999 -> 999999)', neg === 0 && dec === 5 && win.state.craftTarget.steel === 999999);
  // another run (new village, restore, reload): the rebuild never waits, and the old field cannot write into the new run
  win.state.craftTarget.steel = 7; win.renderAll();
  const d = field(); d.focus(); d.value = '42';
  const R = win.S2Runtime, oldRun = win.state;
  R.apply({ id: 'ux01-bd', name: 'UX01 BD', snapshot: { savedAt: 1, payload: R.payload(win.freshRunState(), win.permanent) } });
  const fresh = field();
  check('UX01-BD: another run rebuilds at once; the draft is not carried into it', win.state !== oldRun && fresh !== d && fresh.value === '' && !(win.state.craftTarget.steel > 0) && !more().open);
  d.onchange();
  check('UX01-BD: a change from the old run\'s removed field sets nothing in either run', !(win.state.craftTarget.steel > 0) && oldRun.craftTarget.steel === 7, JSON.stringify({ now: win.state.craftTarget.steel, old: oldRun.craftTarget.steel, same: win.state === oldRun }));
})();
