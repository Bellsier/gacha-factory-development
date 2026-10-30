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
